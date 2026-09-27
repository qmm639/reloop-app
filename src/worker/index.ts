import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { db } from "../lib/db";
import { claimNext, enqueue, failJob, finishJob, parsePayload, reclaimStale } from "../lib/queue";
import { providers, usableToken, ProviderId } from "../lib/providers";
import { canRender, PLANS, PlanId } from "../lib/plans";
import { fetchSource } from "./download";
import { render, probe, Rules } from "./video";
import { transcribeToSrt } from "./transcribe";

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? "./storage");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ------------------------------------------------------------------ */
/* 1) ตรวจช่องต้นทางตามรอบเวลา แล้วสร้างงาน render ให้คลิปใหม่            */
/* ------------------------------------------------------------------ */
async function handlePoll(workflowId: string) {
  const wf = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { sourceConnection: true, user: true },
  });
  if (!wf || !wf.active) return;

  if (wf.sourceConnection) {
    const provider = providers[wf.sourceConnection.provider as ProviderId];
    if (provider.listNew) {
      const token = await usableToken(wf.sourceConnection.id);
      const items = await provider.listNew(token, wf.sourceRef ?? wf.sourceConnection.externalId, wf.lastSeenExternalId);
      log(`[poll] ${wf.name}: พบคลิปใหม่ ${items.length} รายการ`);

      for (const it of items.reverse()) {
        const created = await db.sourceItem.upsert({
          where: { workflowId_externalId: { workflowId: wf.id, externalId: it.externalId } },
          update: {},
          create: { workflowId: wf.id, externalId: it.externalId, title: it.title, url: it.url },
        });
        await enqueue("render", { sourceItemId: created.id });
      }
      if (items.length) {
        await db.workflow.update({ where: { id: wf.id }, data: { lastSeenExternalId: items[items.length - 1].externalId } });
      }
    }
  }

  await db.workflow.update({ where: { id: wf.id }, data: { lastCheckedAt: new Date() } });
  await enqueue("poll", { workflowId: wf.id }, { runAt: new Date(Date.now() + wf.checkEvery * 60_000) });
}

/* ------------------------------------------------------------------ */
/* 2) ดาวน์โหลด → ทำซับ → เรนเดอร์ → แตกเป็นงาน publish ต่อปลายทาง        */
/* ------------------------------------------------------------------ */
async function handleRender(sourceItemId: string) {
  const item = await db.sourceItem.findUnique({
    where: { id: sourceItemId },
    include: { workflow: { include: { destinations: { include: { connection: true } }, user: true } } },
  });
  if (!item) return;

  const wf = item.workflow;
  const user = wf.user;
  const plan = (user.plan as PlanId) ?? "free";

  if (!canRender({ plan, clipsUsed: user.clipsUsed, usageResetAt: user.usageResetAt })) {
    log(`[render] ข้าม: ผู้ใช้ ${user.email} ใช้โควตาแพ็กเกจ ${PLANS[plan].name} ครบแล้ว`);
    return;
  }

  const rules = JSON.parse(wf.rules || "{}") as Rules;
  if (rules.subtitle && !PLANS[plan].subtitle) rules.subtitle = false; // ซับไทยเปิดเฉพาะแพ็กเกจที่รองรับ

  const workDir = path.join(STORAGE, "work", item.id);
  const outPath = path.join(STORAGE, "renders", `${item.id}.mp4`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    log(`[render] ${item.title}`);
    const source = await fetchSource(item.url, workDir);
    const needsRender = Boolean(rules.crop || rules.subtitle || rules.logo);
    let duration: number | null = null;

    if (needsRender) {
      const info = await probe(source);
      duration = Math.round(info.duration);
      const srt = rules.subtitle ? await transcribeToSrt(source, workDir) : null;
      await render({
        input: source,
        output: outPath,
        rules: { ...rules, maxSeconds: rules.maxSeconds ?? 180 },
        srtPath: srt ?? undefined,
        logoPath: rules.logo ? path.join(STORAGE, "assets", `${user.id}-logo.png`) : undefined,
      });
    } else {
      // โหมดโพสต์คลิปต้นฉบับ: ไม่ตัดต่อ ใช้แรงเครื่องน้อยมาก รันบนแพลนเล็กสุดได้
      fs.renameSync(source, outPath);
    }

    await db.sourceItem.update({
      where: { id: item.id },
      data: { renderPath: outPath, renderedAt: new Date(), duration },
    });
    await db.user.update({ where: { id: user.id }, data: { clipsUsed: { increment: 1 } } });

    for (const dest of wf.destinations) {
      const post = await db.post.create({
        data: { workflowId: wf.id, sourceItemId: item.id, connectionId: dest.connectionId, status: "queued" },
      });
      await enqueue("publish", { postId: post.id }, { runAt: scheduleFor(wf.schedule) });
    }
  } finally {
    fs.rmSync(path.join(workDir, "source.mp4"), { force: true }); // เก็บเฉพาะไฟล์ที่เรนเดอร์แล้ว
  }
}

/** แปลงรูปแบบการตั้งเวลาเป็นเวลาที่จะเริ่มโพสต์ */
function scheduleFor(mode: string): Date {
  const now = new Date();
  if (mode === "peak") {
    const target = new Date(now);
    target.setHours(18, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }
  if (mode === "spread") return new Date(now.getTime() + 1000 * 60 * 60 * (2 + Math.random() * 6));
  return now;
}

/* ------------------------------------------------------------------ */
/* 3) อัปโหลดขึ้นแพลตฟอร์มปลายทาง                                       */
/* ------------------------------------------------------------------ */
async function handlePublish(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: { connection: true, sourceItem: true, workflow: true },
  });
  if (!post || !post.sourceItem.renderPath) return;

  const provider = providers[post.connection.provider as ProviderId];
  const token = await usableToken(post.connectionId);
  const rules = JSON.parse(post.workflow.rules || "{}") as Rules & { captionTemplate?: string };
  const caption = (rules.captionTemplate ?? "{title}").replace("{title}", post.sourceItem.title);
  const publicBase = process.env.PUBLIC_MEDIA_BASE_URL;

  await db.post.update({ where: { id: post.id }, data: { status: "uploading" } });

  try {
    const result = await provider.publish(
      token,
      post.connection.externalId,
      {
        filePath: post.sourceItem.renderPath,
        publicUrl: publicBase ? `${publicBase}/${path.basename(post.sourceItem.renderPath)}` : undefined,
        title: post.sourceItem.title,
        caption,
      },
      JSON.parse(post.connection.meta || "{}"),
    );
    await db.post.update({
      where: { id: post.id },
      data: { status: "published", remoteId: result.remoteId, url: result.url, publishedAt: new Date(), error: null },
    });
    log(`[publish] ${provider.label}: ${result.url ?? result.remoteId}`);
  } catch (e) {
    await db.post.update({
      where: { id: post.id },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* วนรับงานจากคิว                                                       */
/* ------------------------------------------------------------------ */
async function tick() {
  const job = await claimNext(WORKER_ID);
  if (!job) return false;

  try {
    const p = parsePayload<{ workflowId?: string; sourceItemId?: string; postId?: string }>(job.payload);
    if (job.type === "poll" && p.workflowId) await handlePoll(p.workflowId);
    else if (job.type === "render" && p.sourceItemId) await handleRender(p.sourceItemId);
    else if (job.type === "publish" && p.postId) await handlePublish(p.postId);
    await finishJob(job.id);
  } catch (e) {
    log(`[error] งาน ${job.type} ล้มเหลว:`, e instanceof Error ? e.message : e);
    await failJob(job.id, e);
  }
  return true;
}

async function main() {
  fs.mkdirSync(path.join(STORAGE, "renders"), { recursive: true });
  log(`worker ${WORKER_ID} เริ่มทำงาน · เก็บไฟล์ที่ ${STORAGE}`);

  // เวิร์กโฟลว์ที่เปิดอยู่แต่ยังไม่มีงาน poll ในคิว ให้ตั้งรอบให้ใหม่
  const active = await db.workflow.findMany({ where: { active: true } });
  for (const wf of active) {
    const pending = await db.job.count({ where: { type: "poll", status: "queued", payload: { contains: wf.id } } });
    if (!pending) await enqueue("poll", { workflowId: wf.id });
  }

  for (;;) {
    await reclaimStale();
    const worked = await tick();
    if (!worked) await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

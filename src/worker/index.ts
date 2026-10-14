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

/**
 * การตัดต่อ (ffmpeg) กินแรมหลายร้อย MB ต่อคลิป บนเครื่องเล็กที่รันร่วมกับบอทจะทำให้ทั้งเครื่องล่ม
 * จึงปิดไว้เป็นค่าเริ่มต้น เปิดด้วย RELOOP_RENDER_ENABLED=1 เมื่อย้ายไปเครื่องที่ใหญ่พอ
 * ตอนปิด คลิปจะถูกโพสต์ตามต้นฉบับ ไม่ว่าเวิร์กโฟลว์จะตั้งกฎการแปลงไว้อย่างไร
 */
const RENDER_ENABLED = process.env.RELOOP_RENDER_ENABLED === "1";

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
      // listNew คืนคลิปเรียงจากใหม่ไปเก่า
      const found = await provider.listNew(token, wf.sourceRef ?? wf.sourceConnection.externalId, wf.lastSeenExternalId);

      // เวิร์กโฟลว์ที่เพิ่งสร้างยังไม่เคยเห็นคลิปไหนเลย listNew จึงคืนคลิปย้อนหลังทั้งหน้า (10-15 คลิป)
      // ถ้าปล่อยผ่าน ลูกค้าจะโดนโพสต์คลิปเก่ารวดเดียวทุกปลายทางทันทีที่กดสร้าง
      // รอบแรกจึงเอาเฉพาะคลิปล่าสุดคลิปเดียว แล้วรอบถัดไปค่อยตามคลิปที่ลงใหม่จริง
      const firstRun = !wf.lastSeenExternalId;
      const items = firstRun ? found.slice(0, 1) : found;
      log(`[poll] ${wf.name}: พบคลิปใหม่ ${items.length} รายการ` + (firstRun && found.length > 1 ? ` (รอบแรก ข้ามคลิปเก่า ${found.length - 1} คลิป)` : ""));

      for (const it of [...items].reverse()) {
        const created = await db.sourceItem.upsert({
          where: { workflowId_externalId: { workflowId: wf.id, externalId: it.externalId } },
          update: {},
          create: { workflowId: wf.id, externalId: it.externalId, title: it.title, url: it.url },
        });
        await enqueue("render", { sourceItemId: created.id });
      }
      if (found.length) {
        await db.workflow.update({ where: { id: wf.id }, data: { lastSeenExternalId: found[0].externalId } });
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
  if (!RENDER_ENABLED) {
    rules.crop = false;
    rules.subtitle = false;
    rules.logo = false;
  }
  // ยังไม่มีหน้าให้ลูกค้าอัปโหลดโลโก้ ถ้าไม่มีไฟล์อยู่จริง ffmpeg จะล้มทั้งงาน
  const logoPath = path.join(STORAGE, "assets", `${user.id}-logo.png`);
  if (rules.logo && !fs.existsSync(logoPath)) rules.logo = false;

  const workDir = path.join(STORAGE, "work", item.id);
  const outPath = path.join(STORAGE, "renders", `${item.id}.mp4`);
  fs.mkdirSync(workDir, { recursive: true });

  const posts = [];
  for (const dest of wf.destinations) {
    const existing = await db.post.findFirst({
      where: { workflowId: wf.id, sourceItemId: item.id, connectionId: dest.connectionId },
    });
    const post = existing
      ? await db.post.update({ where: { id: existing.id }, data: { status: "rendering", error: null } })
      : await db.post.create({
          data: { workflowId: wf.id, sourceItemId: item.id, connectionId: dest.connectionId, status: "rendering" },
        });
    posts.push(post);
  }

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
        logoPath: rules.logo ? logoPath : undefined,
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

    for (const post of posts) {
      await db.post.update({
        where: { id: post.id },
        data: { status: "queued", error: null },
      });
      await enqueue("publish", { postId: post.id }, { runAt: scheduleFor(wf.schedule) });
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db.post.updateMany({
      where: { id: { in: posts.map((p) => p.id) } },
      data: { status: "failed", error: errMsg },
    });
    throw e;
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

  // เจ้าของกดหยุดเวิร์กโฟลว์ไปแล้วระหว่างที่งานรออยู่ในคิว — ต้องไม่โพสต์ออกไป
  if (!post.workflow.active) {
    await db.post.update({ where: { id: post.id }, data: { status: "failed", error: "ยกเลิก: เวิร์กโฟลว์ถูกหยุดก่อนถึงเวลาโพสต์" } });
    log(`[publish] ข้าม: เวิร์กโฟลว์ ${post.workflow.name} ถูกหยุดไว้`);
    return;
  }

  // บางแพลตฟอร์มเลือกวิธีโพสต์ตามสัดส่วนและความยาวของคลิป (เช่น Reels ของ Facebook)
  const info = await probe(post.sourceItem.renderPath).catch(() => null);

  const provider = providers[post.connection.provider as ProviderId];
  const token = await usableToken(post.connectionId);
  const rules = JSON.parse(post.workflow.rules || "{}") as Rules & { captionTemplate?: string };
  const caption = (rules.captionTemplate ?? "{title}").replace("{title}", post.sourceItem.title);
  // Instagram ต้องดึงไฟล์จาก URL สาธารณะ ถ้าไม่ได้ตั้งที่เก็บไฟล์ภายนอก (S3/R2) ใช้ /media ของเว็บเราเอง
  const publicBase =
    process.env.PUBLIC_MEDIA_BASE_URL || (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/media` : undefined);

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
        width: info?.width || undefined,
        height: info?.height || undefined,
        duration: info?.duration || undefined,
      },
      JSON.parse(post.connection.meta || "{}"),
    );
    await db.post.update({
      where: { id: post.id },
      data: { status: "published", remoteId: result.remoteId, url: result.url, publishedAt: new Date(), error: null },
    });
    log(`[publish] ${provider.label}: ${result.url ?? result.remoteId}`);
    await removeRenderIfDone(post.sourceItemId);
  } catch (e) {
    await db.post.updateMany({
      where: { id: post.id },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

/** โพสต์ครบทุกปลายทางแล้ว ลบไฟล์วิดีโอทิ้งทันที ดิสก์จะได้ไม่เต็ม */
async function removeRenderIfDone(sourceItemId: string) {
  const pending = await db.post.count({ where: { sourceItemId, status: { not: "published" } } });
  if (pending > 0) return;
  const item = await db.sourceItem.findUnique({ where: { id: sourceItemId } });
  if (!item?.renderPath) return;
  fs.rmSync(item.renderPath, { force: true });
  fs.rmSync(path.join(STORAGE, "work", item.id), { recursive: true, force: true });
  await db.sourceItem.update({ where: { id: item.id }, data: { renderPath: null } });
}

/** กันดิสก์เต็ม: ลบไฟล์วิดีโอที่ค้างเกิน 24 ชั่วโมง (เช่นโพสต์ล้มเหลวจนหมดรอบลองใหม่) */
let lastSweep = 0;
function sweepOldFiles() {
  if (Date.now() - lastSweep < 60 * 60_000) return;
  lastSweep = Date.now();
  const cutoff = Date.now() - 24 * 60 * 60_000;
  for (const dir of ["renders", "work"]) {
    const base = path.join(STORAGE, dir);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const p = path.join(base, name);
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* แพ็กเกจของลูกค้าที่ไม่ได้จ่ายผ่าน Stripe                               */
/* ------------------------------------------------------------------ */

/**
 * แพ็กเกจปกติถูกตั้งจาก webhook ของ Stripe ทางเดียว ลูกค้าที่จ่ายช่องทางอื่น (โอนเงิน)
 * จะค้างที่แพ็กเกจทดลองใช้ซึ่งโพสต์ได้ 5 คลิปแล้วหยุดเงียบๆ
 *
 * ตั้ง RELOOP_PLAN_GRANTS เป็น "อีเมล:แพ็กเกจ" คั่นด้วยจุลภาค เช่น
 *   RELOOP_PLAN_GRANTS="a@example.com:creator,b@example.com:agency"
 * worker จะตั้งแพ็กเกจให้บัญชีเหล่านั้น รวมถึงบัญชีที่สมัครทีหลัง (ตรวจทุกนาที)
 * และล้างยอดคลิปให้ทุก 30 วัน เพราะบัญชีพวกนี้ไม่มีรอบบิลของ Stripe มาล้างให้
 */
function planGrants(): Map<string, PlanId> {
  const grants = new Map<string, PlanId>();
  for (const pair of (process.env.RELOOP_PLAN_GRANTS ?? "").split(",")) {
    const at = pair.lastIndexOf(":");
    if (at < 1) continue;
    const email = pair.slice(0, at).trim().toLowerCase();
    const plan = pair.slice(at + 1).trim().toLowerCase();
    if (email && plan in PLANS) grants.set(email, plan as PlanId);
    else if (email) log(`[plan] ข้าม "${pair.trim()}" — ไม่รู้จักแพ็กเกจนี้ (มี ${Object.keys(PLANS).join(", ")})`);
  }
  return grants;
}

let lastGrantSync = 0;
async function syncPlanGrants() {
  if (Date.now() - lastGrantSync < 60_000) return;
  lastGrantSync = Date.now();

  const grants = planGrants();
  if (grants.size === 0) return;

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  // อีเมลในฐานข้อมูลเก็บตามที่ลูกค้าพิมพ์ตอนสมัคร (ตัวพิมพ์เล็กใหญ่ปนกันได้) จึงเทียบแบบไม่สนตัวพิมพ์เอง
  // บัญชีที่สมัครผ่าน Stripe อยู่ ปล่อยให้ Stripe เป็นคนคุมแพ็กเกจ
  const users = await db.user.findMany({ where: { stripeSubId: null } });
  for (const user of users) {
    const plan = grants.get(user.email.trim().toLowerCase());
    if (!plan) continue;

    if (user.plan !== plan) {
      await db.user.update({ where: { id: user.id }, data: { plan, clipsUsed: 0, usageResetAt: new Date() } });
      log(`[plan] ตั้งแพ็กเกจ ${PLANS[plan].name} ให้ ${user.email}`);
    } else if (user.usageResetAt < monthAgo) {
      await db.user.update({ where: { id: user.id }, data: { clipsUsed: 0, usageResetAt: new Date() } });
      log(`[plan] ขึ้นรอบเดือนใหม่ ล้างยอดคลิปของ ${user.email}`);
    }
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
    sweepOldFiles();
    await syncPlanGrants().catch((e) => log("[plan] ตั้งแพ็กเกจไม่สำเร็จ:", e instanceof Error ? e.message : e));
    const worked = await tick();
    if (!worked) await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

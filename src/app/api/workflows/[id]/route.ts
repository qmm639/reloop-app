import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { enqueue } from "@/lib/queue";

const patch = z.object({ active: z.boolean() });

/** หยุดหรือเปิดเวิร์กโฟลว์ — ตอนหยุด worker จะไม่ตรวจคลิปใหม่และไม่โพสต์งานที่ค้างในคิว */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const parsed = patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const { id } = await ctx.params;
  const wf = await db.workflow.findFirst({ where: { id, userId: user.id } });
  if (!wf) return NextResponse.json({ error: "ไม่พบเวิร์กโฟลว์" }, { status: 404 });

  await db.workflow.update({ where: { id: wf.id }, data: { active: parsed.data.active } });
  // รอบตรวจจะหยุดเองเมื่อเวิร์กโฟลว์ถูกปิด ตอนเปิดกลับต้องตั้งรอบให้ใหม่
  if (parsed.data.active && !wf.active) {
    await enqueue("poll", { workflowId: wf.id });
  } else if (!parsed.data.active) {
    await db.job.deleteMany({ where: { type: "poll", status: "queued", payload: { contains: wf.id } } });
  }

  return NextResponse.json({ ok: true, active: parsed.data.active });
}

/** ลบเวิร์กโฟลว์พร้อมประวัติคลิปและโพสต์ของมัน (บัญชีที่เชื่อมไว้ไม่ถูกลบ) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const { id } = await ctx.params;
  const wf = await db.workflow.findFirst({ where: { id, userId: user.id } });
  if (!wf) return NextResponse.json({ error: "ไม่พบเวิร์กโฟลว์" }, { status: 404 });

  await db.job.deleteMany({ where: { type: "poll", status: "queued", payload: { contains: wf.id } } });
  await db.workflow.delete({ where: { id: wf.id } });
  return NextResponse.json({ ok: true });
}

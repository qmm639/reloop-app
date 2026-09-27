import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { enqueue } from "@/lib/queue";

/** สั่งให้ตรวจช่องต้นทางเดี๋ยวนี้ ไม่ต้องรอรอบถัดไป */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const { id } = await ctx.params;
  const wf = await db.workflow.findFirst({ where: { id, userId: user.id } });
  if (!wf) return NextResponse.json({ error: "ไม่พบเวิร์กโฟลว์" }, { status: 404 });

  await enqueue("poll", { workflowId: wf.id });
  return NextResponse.json({ ok: true, message: "ส่งเข้าคิวแล้ว worker จะเริ่มภายในไม่กี่วินาที" });
}

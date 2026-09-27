import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { enqueue } from "@/lib/queue";
import { PLANS, PlanId } from "@/lib/plans";

const schema = z.object({
  name: z.string().min(1).max(80),
  sourceConnectionId: z.string().optional(),
  sourceKind: z.enum(["youtube", "tiktok", "facebook_live", "upload"]),
  sourceRef: z.string().max(200).optional(),
  checkEvery: z.number().int().min(5).max(1440).default(5),
  schedule: z.enum(["instant", "peak", "spread"]).default("instant"),
  rules: z
    .object({
      crop: z.boolean().default(false),
      subtitle: z.boolean().default(false),
      logo: z.boolean().default(false),
      highlights: z.boolean().default(false),
      captionTemplate: z.string().max(500).default("{title}"),
    })
    .default({}),
  destinationIds: z.array(z.string()).min(1),
});

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  const workflows = await db.workflow.findMany({
    where: { userId: user.id },
    include: { destinations: { include: { connection: true } }, sourceConnection: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลเวิร์กโฟลว์ไม่ครบ", detail: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const plan = PLANS[(user.plan as PlanId) ?? "free"];
  const count = await db.workflow.count({ where: { userId: user.id } });
  if (count >= plan.sources) {
    return NextResponse.json({ error: `แพ็กเกจ ${plan.name} สร้างได้สูงสุด ${plan.sources} เวิร์กโฟลว์` }, { status: 402 });
  }
  if (body.destinationIds.length > plan.destinations) {
    return NextResponse.json({ error: `แพ็กเกจ ${plan.name} เลือกปลายทางได้สูงสุด ${plan.destinations} ช่อง` }, { status: 402 });
  }

  // ปลายทางทุกช่องต้องเป็นบัญชีของผู้ใช้คนนี้เท่านั้น
  const owned = await db.connection.findMany({ where: { id: { in: body.destinationIds }, userId: user.id } });
  if (owned.length !== body.destinationIds.length) {
    return NextResponse.json({ error: "มีปลายทางที่ไม่ใช่บัญชีของคุณ" }, { status: 403 });
  }

  const wf = await db.workflow.create({
    data: {
      userId: user.id,
      name: body.name,
      sourceConnectionId: body.sourceConnectionId ?? null,
      sourceKind: body.sourceKind,
      sourceRef: body.sourceRef ?? null,
      checkEvery: body.checkEvery,
      schedule: body.schedule,
      rules: JSON.stringify(body.rules),
      destinations: { create: owned.map((c) => ({ connectionId: c.id })) },
    },
  });

  await enqueue("poll", { workflowId: wf.id });
  return NextResponse.json({ workflow: wf }, { status: 201 });
}

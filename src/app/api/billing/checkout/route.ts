import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { stripe, billingEnabled } from "@/lib/stripe";
import { PLANS, PlanId } from "@/lib/plans";

/** สร้างหน้า Checkout ของ Stripe สำหรับสมัครแพ็กเกจรายเดือน */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  if (!billingEnabled()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าคีย์ Stripe" }, { status: 501 });

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: PlanId };
  if (!plan || !(plan in PLANS) || plan === "free") return NextResponse.json({ error: "เลือกแพ็กเกจไม่ถูกต้อง" }, { status: 400 });

  const priceId = process.env[PLANS[plan].priceEnv!];
  if (!priceId) return NextResponse.json({ error: `ยังไม่ได้ตั้งค่า ${PLANS[plan].priceEnv}` }, { status: 501 });

  const s = stripe();
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ email: user.email, metadata: { userId: user.id } });
    customerId = customer.id;
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard/billing?status=success`,
    cancel_url: `${base}/dashboard/billing?status=cancel`,
    subscription_data: { metadata: { userId: user.id, plan } },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}

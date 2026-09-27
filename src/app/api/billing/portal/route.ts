import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { stripe, billingEnabled } from "@/lib/stripe";

/** เปิดหน้าจัดการการสมัครของ Stripe ให้ผู้ใช้เปลี่ยนบัตรหรือยกเลิกเอง */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  if (!billingEnabled() || !user.stripeCustomerId) return NextResponse.json({ error: "ยังไม่มีข้อมูลการสมัคร" }, { status: 400 });

  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/billing`,
  });
  return NextResponse.json({ url: session.url });
}

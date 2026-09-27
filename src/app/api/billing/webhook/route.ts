import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/plans";

// ต้องอ่าน body ดิบเพื่อตรวจลายเซ็น จึงห้ามให้ Next แคชหรือแปลงร่าง
export const dynamic = "force-dynamic";

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await db.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) return;

  const priceId = sub.items.data[0]?.price.id;
  const active = sub.status === "active" || sub.status === "trialing";
  const periodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end;

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: active ? planFromPriceId(priceId) : "free",
      stripeSubId: sub.id,
      subStatus: sub.status,
      periodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า webhook" }, { status: 501 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `ลายเซ็นไม่ถูกต้อง: ${e instanceof Error ? e.message : ""}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        const sub = await stripe().subscriptions.retrieve(String(s.subscription));
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;

    case "invoice.paid": {
      // ขึ้นรอบบิลใหม่ = ล้างโควตาคลิปของเดือนนั้น
      const inv = event.data.object as Stripe.Invoice;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customerId) {
        await db.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { clipsUsed: 0, usageResetAt: new Date() },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

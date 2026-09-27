import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY ใน .env");
    client = new Stripe(key);
  }
  return client;
}

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

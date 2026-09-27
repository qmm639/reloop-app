export type PlanId = "free" | "starter" | "creator" | "agency";

export const PLANS: Record<
  PlanId,
  { name: string; priceTHB: number; sources: number; destinations: number; clipsPerMonth: number; subtitle: boolean; priceEnv?: string }
> = {
  free:    { name: "ทดลองใช้", priceTHB: 0,    sources: 1,  destinations: 2,        clipsPerMonth: 5,        subtitle: false },
  starter: { name: "Starter",  priceTHB: 390,  sources: 1,  destinations: 3,        clipsPerMonth: 30,       subtitle: false, priceEnv: "STRIPE_PRICE_STARTER" },
  creator: { name: "Creator",  priceTHB: 990,  sources: 5,  destinations: Infinity, clipsPerMonth: 300,      subtitle: true,  priceEnv: "STRIPE_PRICE_CREATOR" },
  agency:  { name: "Agency",   priceTHB: 2900, sources: 20, destinations: Infinity, clipsPerMonth: Infinity, subtitle: true,  priceEnv: "STRIPE_PRICE_AGENCY" },
};

/** แปลง price id ของ Stripe กลับเป็นชื่อแพ็กเกจ (ใช้ตอนรับ webhook) */
export function planFromPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  for (const [id, p] of Object.entries(PLANS)) {
    if (p.priceEnv && process.env[p.priceEnv] === priceId) return id as PlanId;
  }
  return "free";
}

export type Usage = { plan: PlanId; clipsUsed: number; usageResetAt: Date };

export function quotaLeft(u: Usage) {
  const limit = PLANS[u.plan].clipsPerMonth;
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - u.clipsUsed);
}

export function canRender(u: Usage) {
  return quotaLeft(u) > 0;
}

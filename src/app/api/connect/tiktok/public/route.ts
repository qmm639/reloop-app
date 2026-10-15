import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getBaseUrl } from "@/lib/providers";
import { resolveTikTokPublicChannel } from "@/lib/providers/tiktok";
import { PLANS, PlanId } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base), 303);

  const formData = await req.formData();
  const handle = String(formData.get("handle") ?? "").trim();
  if (!handle) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=กรุณาระบุชื่อช่องหรือลิงก์ TikTok", base), 303);
  }

  const used = await db.connection.count({ where: { userId: user.id } });
  const limit = PLANS[(user.plan as PlanId) ?? "free"].sources + 10;
  if (used >= limit) {
    return NextResponse.redirect(new URL("/dashboard/billing?error=limit", base), 303);
  }

  try {
    const info = await resolveTikTokPublicChannel(handle);
    const displayName =
      info.nickname && info.nickname.toLowerCase() !== info.uniqueId.toLowerCase()
        ? `${info.nickname} (@${info.uniqueId})`
        : `@${info.uniqueId}`;

    await db.connection.upsert({
      where: {
        userId_provider_externalId: {
          userId: user.id,
          provider: "tiktok",
          externalId: info.secUid,
        },
      },
      update: {
        displayName,
        accessToken: encrypt(`public:${info.uniqueId}`),
        expiresAt: null,
        meta: JSON.stringify({ mode: "public", uniqueId: info.uniqueId, secUid: info.secUid }),
      },
      create: {
        userId: user.id,
        provider: "tiktok",
        externalId: info.secUid,
        displayName,
        accessToken: encrypt(`public:${info.uniqueId}`),
        expiresAt: null,
        meta: JSON.stringify({ mode: "public", uniqueId: info.uniqueId, secUid: info.secUid }),
      },
    });

    return NextResponse.redirect(new URL("/dashboard/connections?connected=tiktok", base), 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ไม่พบช่อง TikTok ที่ระบุ";
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(msg)}`, base), 303);
  }
}

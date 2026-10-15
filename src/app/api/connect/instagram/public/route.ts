import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getBaseUrl } from "@/lib/providers";
import { resolveInstagramPublicChannel } from "@/lib/providers/meta";
import { PLANS, PlanId } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base), 303);

  const formData = await req.formData();
  const handle = String(formData.get("handle") ?? "").trim();
  if (!handle) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=กรุณาระบุชื่อบัญชีหรือลิงก์ Instagram", base), 303);
  }

  const used = await db.connection.count({ where: { userId: user.id } });
  const limit = PLANS[(user.plan as PlanId) ?? "free"].sources + 10;
  if (used >= limit) {
    return NextResponse.redirect(new URL("/dashboard/billing?error=limit", base), 303);
  }

  try {
    const info = await resolveInstagramPublicChannel(handle);
    const externalId = `ig_public:${info.username}`;
    const displayName =
      info.fullName && info.fullName.toLowerCase() !== info.username.toLowerCase()
        ? `${info.fullName} (@${info.username})`
        : `@${info.username}`;

    await db.connection.upsert({
      where: {
        userId_provider_externalId: {
          userId: user.id,
          provider: "instagram",
          externalId,
        },
      },
      update: {
        displayName,
        accessToken: encrypt(`public:${info.username}`),
        expiresAt: null,
        meta: JSON.stringify({ mode: "public", username: info.username, ownerId: info.ownerId }),
      },
      create: {
        userId: user.id,
        provider: "instagram",
        externalId,
        displayName,
        accessToken: encrypt(`public:${info.username}`),
        expiresAt: null,
        meta: JSON.stringify({ mode: "public", username: info.username, ownerId: info.ownerId }),
      },
    });

    return NextResponse.redirect(new URL("/dashboard/connections?connected=instagram", base), 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ไม่พบบัญชี Instagram ที่ระบุ";
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(msg)}`, base), 303);
  }
}

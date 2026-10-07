import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getBaseUrl } from "@/lib/providers";
import { MetaAvailablePage } from "@/lib/providers/meta";
import { PLANS, PlanId } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const jar = await cookies();
  const rawCookie = jar.get("pending_meta_selection")?.value;
  if (!rawCookie) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=session_expired", base));
  }

  let data: {
    provider: "facebook" | "instagram";
    pages: MetaAvailablePage[];
    expiresAt?: number | null;
  };

  try {
    data = JSON.parse(decrypt(rawCookie));
  } catch {
    return NextResponse.redirect(new URL("/dashboard/connections?error=invalid_data", base));
  }

  const formData = await req.formData();
  const provider = (formData.get("provider") as string) || data.provider;
  const rawSelected = formData.getAll("selectedIds") as string[];
  const selectedIds = new Set(rawSelected);

  if (selectedIds.size === 0) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=no_pages_selected", base));
  }

  const isIg = provider === "instagram";
  const matchedPages = data.pages.filter((p) =>
    isIg ? p.instagramId && selectedIds.has(p.instagramId) : selectedIds.has(p.id)
  );

  if (matchedPages.length === 0) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=pages_not_found", base));
  }

  // ตรวจสอบโควตาแพ็กเกจ
  const used = await db.connection.count({ where: { userId: user.id } });
  const limit = PLANS[(user.plan as PlanId) ?? "free"].sources + 10; // ยืดหยุ่นให้เชื่อมได้หลายเพจ
  if (used + matchedPages.length > limit) {
    return NextResponse.redirect(new URL("/dashboard/billing?error=limit", base));
  }

  // บันทึกเฉพาะเพจที่ผู้ใช้ติ๊กเลือก
  for (const page of matchedPages) {
    if (isIg) {
      const igId = page.instagramId!;
      const igName = page.instagramUsername
        ? `@${page.instagramUsername} (${page.name})`
        : `Instagram ของเพจ ${page.name}`;

      await db.connection.upsert({
        where: {
          userId_provider_externalId: {
            userId: user.id,
            provider: "instagram",
            externalId: igId,
          },
        },
        update: {
          displayName: igName,
          accessToken: encrypt(page.accessToken),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          meta: JSON.stringify({ pageId: page.id }),
        },
        create: {
          userId: user.id,
          provider: "instagram",
          externalId: igId,
          displayName: igName,
          accessToken: encrypt(page.accessToken),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          meta: JSON.stringify({ pageId: page.id }),
        },
      });
    } else {
      await db.connection.upsert({
        where: {
          userId_provider_externalId: {
            userId: user.id,
            provider: "facebook",
            externalId: page.id,
          },
        },
        update: {
          displayName: page.name,
          accessToken: encrypt(page.accessToken),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          meta: JSON.stringify({ instagramId: page.instagramId ?? null }),
        },
        create: {
          userId: user.id,
          provider: "facebook",
          externalId: page.id,
          displayName: page.name,
          accessToken: encrypt(page.accessToken),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          meta: JSON.stringify({ instagramId: page.instagramId ?? null }),
        },
      });
    }
  }

  // ลบคุกกี้ชั่วคราว
  const res = NextResponse.redirect(
    new URL(`/dashboard/connections?connected=${provider}&count=${matchedPages.length}`, base)
  );
  res.cookies.delete("pending_meta_selection");
  return res;
}

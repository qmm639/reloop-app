import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { isProviderId, providers, redirectUri, getBaseUrl } from "@/lib/providers";
import { fetchMetaAccounts } from "@/lib/providers/meta";
import { PLANS, PlanId } from "@/lib/plans";

/** รับ code กลับจากแพลตฟอร์ม แลกเป็น token แล้วพาไปหน้าเลือกเพจ หรือบันทึกแบบเข้ารหัส */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const { provider } = await ctx.params;
  if (!isProviderId(provider)) return NextResponse.json({ error: "ไม่รู้จักแพลตฟอร์มนี้" }, { status: 404 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${provider}`)?.value;
  jar.delete(`oauth_state_${provider}`);

  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(url.searchParams.get("error")!)}`, base));
  }
  if (!code || !state || state !== expected) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=state", base));
  }

  // สำหรับ Facebook และ Instagram: ดึงเพจทั้งหมด แล้วส่งไปหน้าจอ Pop-up ให้ผู้ใช้เลือกติ๊กเพจ
  if (provider === "facebook" || provider === "instagram") {
    try {
      const { pages, expiresIn } = await fetchMetaAccounts(code, redirectUri(provider));
      if (!pages || pages.length === 0) {
        return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent("ไม่พบเพจ Facebook ในบัญชีนี้ ต้องเป็นแอดมินเพจอย่างน้อย 1 เพจ")}`, base));
      }

      if (provider === "instagram") {
        const igPages = pages.filter((p) => p.instagramId);
        if (igPages.length === 0) {
          return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent("ไม่พบบัญชี Instagram Business ที่ผูกกับเพจ กรุณาผูกบัญชีก่อนใน Meta Business Suite")}`, base));
        }
      }

      const pendingPayload = encrypt(JSON.stringify({
        provider,
        pages,
        expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      }));

      const res = NextResponse.redirect(new URL(`/dashboard/connections/select?provider=${provider}`, base));
      res.cookies.set("pending_meta_selection", pendingPayload, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 600, // 10 minutes
        path: "/",
        sameSite: "lax",
      });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ";
      return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(msg)}`, base));
    }
  }

  // แพลตฟอร์มอื่นๆ (YouTube, TikTok) บันทึกทันทีตามปกติ
  try {
    const tokens = await providers[provider].exchange(code, redirectUri(provider));

    const used = await db.connection.count({ where: { userId: user.id } });
    const limit = PLANS[(user.plan as PlanId) ?? "free"].sources + 3;
    if (used >= limit) {
      return NextResponse.redirect(new URL("/dashboard/billing?error=limit", base));
    }

    await db.connection.upsert({
      where: { userId_provider_externalId: { userId: user.id, provider, externalId: tokens.externalId } },
      update: {
        displayName: tokens.displayName,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes ?? null,
        meta: tokens.meta ? JSON.stringify(tokens.meta) : null,
      },
      create: {
        userId: user.id,
        provider,
        externalId: tokens.externalId,
        displayName: tokens.displayName,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes ?? null,
        meta: tokens.meta ? JSON.stringify(tokens.meta) : null,
      },
    });

    return NextResponse.redirect(new URL("/dashboard/connections?connected=" + provider, base));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ";
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(msg)}`, base));
  }
}

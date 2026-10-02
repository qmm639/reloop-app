import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { isProviderId, providers, redirectUri, getBaseUrl } from "@/lib/providers";
import { randomId } from "@/lib/crypto";

/** เริ่มขั้นตอน OAuth: ส่งผู้ใช้ไปหน้าอนุมัติสิทธิ์ของแพลตฟอร์มโดยตรง */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const { provider } = await ctx.params;
  if (!isProviderId(provider)) return NextResponse.json({ error: "ไม่รู้จักแพลตฟอร์มนี้" }, { status: 404 });

  // state กัน CSRF: สุ่มค่า เก็บใส่คุกกี้ แล้วเทียบตอน callback
  const state = randomId(16);
  (await cookies()).set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(providers[provider].authUrl(state, redirectUri(provider)));
}

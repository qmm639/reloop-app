import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { Provider, ProviderId } from "./types";
import { youtube } from "./youtube";
import { tiktok } from "./tiktok";
import { facebook, instagram } from "./meta";

export const providers: Record<ProviderId, Provider> = { youtube, tiktok, facebook, instagram };

export const isProviderId = (v: string): v is ProviderId => v in providers;

export function getBaseUrl(req?: any): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const host = req.headers?.get("x-forwarded-host") || req.headers?.get("host");
    const proto = req.headers?.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }
  return "https://app.qmm639.com";
}

export function redirectUri(provider: ProviderId) {
  const base = getBaseUrl();
  return `${base}/api/connect/${provider}/callback`;
}

/**
 * คืน access token ที่ใช้ได้จริง: ถอดรหัส และต่ออายุให้อัตโนมัติถ้าใกล้หมดอายุ
 */
export async function usableToken(connectionId: string): Promise<string> {
  const conn = await db.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("ไม่พบการเชื่อมต่อบัญชีนี้");

  const nearExpiry = conn.expiresAt ? conn.expiresAt.getTime() - Date.now() < 5 * 60_000 : false;
  const provider = providers[conn.provider as ProviderId];

  if (nearExpiry && conn.refreshToken && provider.refresh) {
    const fresh = await provider.refresh(decrypt(conn.refreshToken));
    if (fresh?.accessToken) {
      await db.connection.update({
        where: { id: conn.id },
        data: {
          accessToken: encrypt(fresh.accessToken),
          refreshToken: fresh.refreshToken ? encrypt(fresh.refreshToken) : conn.refreshToken,
          expiresAt: fresh.expiresAt ?? conn.expiresAt,
        },
      });
      return fresh.accessToken;
    }
  }
  return decrypt(conn.accessToken);
}

export * from "./types";

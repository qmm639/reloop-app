export type ProviderId = "youtube" | "tiktok" | "facebook" | "instagram";

export type TokenSet = {
  externalId: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
  meta?: Record<string, unknown>;
};

export type PublishInput = {
  filePath: string; // ไฟล์ที่เรนเดอร์แล้วบนเครื่อง worker
  publicUrl?: string; // บาง API (Instagram) ต้องการ URL สาธารณะแทนการอัปโหลดไฟล์
  title: string;
  caption: string;
  /** ขนาดและความยาวของไฟล์ (worker วัดด้วย ffprobe) — ไม่มีค่าถ้าวัดไม่ได้ */
  width?: number;
  height?: number;
  duration?: number;
};

export type PublishResult = { remoteId: string; url?: string };

export type SourceItem = {
  externalId: string;
  title: string;
  url: string;
  publishedAt?: Date;
};

export interface Provider {
  id: ProviderId;
  label: string;
  canBeSource: boolean;
  /** URL ที่พาผู้ใช้ไปหน้าอนุมัติสิทธิ์ของแพลตฟอร์ม */
  authUrl(state: string, redirectUri: string): string;
  /** แลก code เป็น token + ข้อมูลบัญชี */
  exchange(code: string, redirectUri: string): Promise<TokenSet>;
  /**
   * แลก code แล้วคืนทุกบัญชีที่ผู้ใช้อนุญาตในครั้งเดียว (เช่นเลือกหลายเพจในหน้าขอสิทธิ์ของ Facebook)
   * ถ้าแพลตฟอร์มไม่มีแนวคิดนี้ไม่ต้องมี ระบบจะใช้ exchange แทน
   */
  exchangeAll?(code: string, redirectUri: string): Promise<TokenSet[]>;
  /** ต่ออายุ token ที่หมดอายุ (คืน null ถ้าแพลตฟอร์มไม่มี refresh token) */
  refresh?(refreshToken: string): Promise<Partial<TokenSet> | null>;
  /** อ่านรายการคลิปใหม่จากช่องต้นทาง */
  listNew?(accessToken: string, externalId: string, sinceId?: string | null): Promise<SourceItem[]>;
  /** โพสต์คลิปขึ้นแพลตฟอร์ม */
  publish(accessToken: string, externalId: string, input: PublishInput, meta?: Record<string, unknown>): Promise<PublishResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const safeUrl = url.replace(/([?&](?:client_secret|access_token|fb_exchange_token|refresh_token)=)[^&]+/gi, "$1***");
    const b = body as Record<string, any> | null;
    const detail = b?.error?.message || b?.error_description || (typeof b?.error === "string" ? b.error : "") || (typeof b?.message === "string" ? b.message : "");
    throw new ProviderError(`เรียก ${safeUrl} ไม่สำเร็จ (${res.status})${detail ? `: ${detail}` : ""}`, res.status, body);
  }
  return body as T;
}

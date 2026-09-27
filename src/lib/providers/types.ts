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
  if (!res.ok) throw new ProviderError(`เรียก ${url} ไม่สำเร็จ (${res.status})`, res.status, body);
  return body as T;
}

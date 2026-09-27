import fs from "node:fs";
import { Provider, TokenSet, PublishInput, PublishResult, jsonFetch, ProviderError } from "./types";

const V = process.env.META_API_VERSION ?? "v21.0";
const GRAPH = `https://graph.facebook.com/${V}`;

/**
 * สิทธิ์ที่ขอจาก Facebook
 * แอปจะขอ scope เหล่านี้ได้ก็ต่อเมื่อเพิ่ม use case ที่เกี่ยวข้องในหน้า App Dashboard แล้ว
 * ถ้าเจอ "Invalid Scopes" ให้ลดเหลือชุดพื้นฐานก่อนโดยตั้งค่า META_SCOPES ใน .env
 */
const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];
const SCOPES = (process.env.META_SCOPES ?? DEFAULT_SCOPES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .join(",");

function authUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${V}/dialog/oauth?${p}`;
}

/** แลก code → user token → long-lived token → เลือกเพจแรกของผู้ใช้ */
async function exchangeMeta(code: string, redirectUri: string, want: "facebook" | "instagram"): Promise<TokenSet> {
  const short = await jsonFetch<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.META_APP_ID ?? "",
        client_secret: process.env.META_APP_SECRET ?? "",
        redirect_uri: redirectUri,
        code,
      }),
  );

  const long = await jsonFetch<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID ?? "",
        client_secret: process.env.META_APP_SECRET ?? "",
        fb_exchange_token: short.access_token,
      }),
  );

  const pages = await jsonFetch<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[] }>(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${long.access_token}`,
  );
  const page = pages.data?.[0];
  if (!page) throw new ProviderError("ไม่พบเพจ Facebook ในบัญชีนี้ ต้องเป็นแอดมินเพจอย่างน้อย 1 เพจ");

  if (want === "instagram") {
    const igId = page.instagram_business_account?.id;
    if (!igId) throw new ProviderError("เพจนี้ยังไม่ได้ผูกบัญชี Instagram แบบ Business");
    return {
      externalId: igId,
      displayName: `Instagram ของเพจ ${page.name}`,
      accessToken: page.access_token, // page token ใช้โพสต์ IG ได้
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
      scopes: SCOPES,
      meta: { pageId: page.id },
    };
  }

  return {
    externalId: page.id,
    displayName: page.name,
    accessToken: page.access_token, // page access token อายุยาว
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    scopes: SCOPES,
    meta: { instagramId: page.instagram_business_account?.id ?? null },
  };
}

export const facebook: Provider = {
  id: "facebook",
  label: "Facebook Page",
  canBeSource: true,
  authUrl,
  exchange: (code, redirectUri) => exchangeMeta(code, redirectUri, "facebook"),

  async listNew(accessToken, pageId, sinceId) {
    const res = await jsonFetch<{ data: { id: string; title?: string; description?: string; permalink_url?: string; created_time: string }[] }>(
      `${GRAPH}/${pageId}/videos?fields=id,title,description,permalink_url,created_time&limit=10&access_token=${accessToken}`,
    );
    const items = [];
    for (const v of res.data ?? []) {
      if (sinceId && v.id === sinceId) break;
      items.push({
        externalId: v.id,
        title: v.title ?? v.description?.slice(0, 80) ?? "วิดีโอจากเพจ",
        url: v.permalink_url ?? `https://facebook.com/${v.id}`,
        publishedAt: new Date(v.created_time),
      });
    }
    return items;
  },

  /** Reels ของเพจ: start → upload ไฟล์ → finish */
  async publish(accessToken, pageId, input: PublishInput): Promise<PublishResult> {
    const start = await jsonFetch<{ video_id: string; upload_url: string }>(
      `${GRAPH}/${pageId}/video_reels`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upload_phase: "start", access_token: accessToken }),
      },
    );

    const size = fs.statSync(input.filePath).size;
    const up = await fetch(start.upload_url, {
      method: "POST",
      headers: {
        authorization: `OAuth ${accessToken}`,
        offset: "0",
        file_size: String(size),
        "content-type": "application/octet-stream",
      },
      body: fs.createReadStream(input.filePath) as unknown as BodyInit,
      // @ts-expect-error duplex จำเป็นสำหรับการสตรีมไฟล์ใน Node fetch
      duplex: "half",
    });
    if (!up.ok) throw new ProviderError("อัปโหลดไฟล์ไป Facebook ไม่สำเร็จ", up.status, await up.text());

    await jsonFetch(`${GRAPH}/${pageId}/video_reels?` +
      new URLSearchParams({
        upload_phase: "finish",
        video_id: start.video_id,
        video_state: "PUBLISHED",
        description: input.caption.slice(0, 2200),
        access_token: accessToken,
      }), { method: "POST" });

    return { remoteId: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}` };
  },
};

export const instagram: Provider = {
  id: "instagram",
  label: "Instagram Reels",
  canBeSource: false,
  authUrl,
  exchange: (code, redirectUri) => exchangeMeta(code, redirectUri, "instagram"),

  /**
   * Instagram ไม่รับอัปโหลดไฟล์ตรง ต้องส่ง URL สาธารณะของไฟล์
   * worker จึงต้องวางไฟล์ไว้บนที่เก็บที่เข้าถึงได้จากภายนอก (S3/R2/โดเมนของเรา)
   */
  async publish(accessToken, igUserId, input: PublishInput): Promise<PublishResult> {
    if (!input.publicUrl) throw new ProviderError("Instagram ต้องใช้ URL สาธารณะของไฟล์ ตั้งค่า PUBLIC_MEDIA_BASE_URL ก่อน");

    const container = await jsonFetch<{ id: string }>(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: input.publicUrl,
        caption: input.caption.slice(0, 2200),
        access_token: accessToken,
      }),
    });

    // รอให้ Instagram ดึงไฟล์และประมวลผลเสร็จก่อนสั่งโพสต์
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const st = await jsonFetch<{ status_code: string; status?: string }>(
        `${GRAPH}/${container.id}?fields=status_code,status&access_token=${accessToken}`,
      );
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR") throw new ProviderError(`Instagram ประมวลผลไฟล์ไม่สำเร็จ: ${st.status ?? ""}`);
      if (i === 29) throw new ProviderError("Instagram ใช้เวลาประมวลผลนานเกินกำหนด");
    }

    const published = await jsonFetch<{ id: string }>(`${GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
    });
    return { remoteId: published.id, url: `https://www.instagram.com/reel/${published.id}` };
  },
};

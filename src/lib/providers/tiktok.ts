import fs from "node:fs";
import { Provider, TokenSet, PublishInput, PublishResult, SourceItem, jsonFetch, ProviderError } from "./types";

// video.list = อ่านรายการคลิปสาธารณะของบัญชีที่เชื่อมไว้ ใช้ตรวจคลิปใหม่เมื่อ TikTok เป็นต้นทาง
// แอพบน developers.tiktok.com ต้องเปิด Display API และเพิ่ม scope video.list ไว้ก่อน ไม่งั้นหน้าเชื่อมบัญชีจะ error
const SCOPES = process.env.TIKTOK_SCOPES || "user.info.basic,video.list";
const API = "https://open.tiktokapis.com/v2";
const SANDBOX_CLIENT_KEY = "sbawa2d0jau9hbr8ht";
const SANDBOX_CLIENT_SECRET = "9DRNeWrqtEqiimgJDycB0Jh77artZczk";

function getClientKey(): string {
  const envKey = process.env.TIKTOK_CLIENT_KEY;
  if (!envKey || envKey === "awhvwd3kkkq48i0n") {
    return SANDBOX_CLIENT_KEY;
  }
  return envKey;
}

function getClientSecret(): string {
  const envSec = process.env.TIKTOK_CLIENT_SECRET;
  if (!envSec || envSec === "zCydsJxj6oTyvueo2qwdFRgavKrYtDJM") {
    return SANDBOX_CLIENT_SECRET;
  }
  return envSec;
}


export const tiktok: Provider = {
  id: "tiktok",
  label: "TikTok",
  canBeSource: true,

  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_key: getClientKey(),
      scope: SCOPES,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
  },

  async exchange(code, redirectUri): Promise<TokenSet> {
    const token = await jsonFetch<{ access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string }>(
      `${API}/oauth/token/`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: getClientKey(),
          client_secret: getClientSecret(),
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      },
    );
    if (token.error || !token.access_token || !token.open_id) {
      throw new ProviderError(`แลกโทเคน TikTok ไม่สำเร็จ: ${token.error_description || token.error || "ไม่มี access_token"}`);
    }

    const info = await jsonFetch<{ data: { user: { display_name: string; open_id: string } } }>(
      `${API}/user/info/?fields=open_id,display_name`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );

    return {
      externalId: token.open_id,
      displayName: info.data.user.display_name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 86400) * 1000),
      scopes: token.scope,
    };
  },

  async refresh(refreshToken) {
    const t = await jsonFetch<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }>(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: getClientKey(),
        client_secret: getClientSecret(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (t.error || !t.access_token) {
      throw new ProviderError(`ต่ออายุโทเคน TikTok ไม่สำเร็จ: ${t.error_description || t.error || "ไม่มี access_token"}`);
    }
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in ?? 86400) * 1000) };
  },

  /**
   * อ่านคลิปสาธารณะล่าสุดของบัญชีที่เชื่อมไว้ (Display API: /v2/video/list/)
   *
   * API คืนแค่ลิงก์ของคลิป ไม่มีลิงก์ไฟล์ ตัว worker จะดาวน์โหลดจาก share_url ด้วย yt-dlp
   * คลิปเรียงจากใหม่ไปเก่าอยู่แล้ว และ token ผูกกับบัญชีเดียว จึงไม่ต้องใช้ externalId
   */
  async listNew(accessToken, _openId, sinceId): Promise<SourceItem[]> {
    const fields = "id,title,video_description,create_time,share_url,duration,width,height";
    const res = await jsonFetch<{
      data?: { videos?: { id: string; title?: string; video_description?: string; create_time?: number; share_url?: string }[] };
      error?: { code?: string; message?: string };
    }>(`${API}/video/list/?fields=${fields}`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ max_count: 20 }),
    });

    // TikTok ตอบ HTTP 200 พร้อม error.code เมื่อมีปัญหา (เช่น scope ไม่พอ) ต้องเช็คเอง
    if (res.error?.code && res.error.code !== "ok") {
      const hint = res.error.code === "scope_not_authorized" ? " — ต้องเชื่อม TikTok ใหม่หลังเปิด scope video.list" : "";
      throw new ProviderError(`อ่านรายการคลิป TikTok ไม่สำเร็จ: ${res.error.message || res.error.code}${hint}`);
    }

    const items: SourceItem[] = [];
    for (const v of res.data?.videos ?? []) {
      if (sinceId && v.id === sinceId) break;
      const title = (v.title || v.video_description || "").trim();
      items.push({
        externalId: v.id,
        title: title ? title.slice(0, 150) : "คลิปจาก TikTok",
        url: v.share_url || `https://www.tiktok.com/video/${v.id}`,
        publishedAt: v.create_time ? new Date(v.create_time * 1000) : undefined,
      });
    }
    return items;
  },

  /** 3 ขั้น: init เพื่อขอ upload_url → PUT ไฟล์ → ถามสถานะจนกว่าจะโพสต์เสร็จ */
  async publish(accessToken, _externalId, input: PublishInput): Promise<PublishResult> {
    const size = fs.statSync(input.filePath).size;

    const init = await jsonFetch<{ data: { publish_id: string; upload_url: string } }>(`${API}/post/publish/video/init/`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        post_info: { title: input.caption.slice(0, 2200), privacy_level: (process.env.TIKTOK_PRIVACY_LEVEL ?? "SELF_ONLY") as any },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    });

    const blob = await fs.openAsBlob(input.filePath, { type: "video/mp4" });
    const put = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(size), "content-range": `bytes 0-${size - 1}/${size}` },
      body: blob,
    });
    if (!put.ok) throw new ProviderError("อัปโหลดไฟล์ไป TikTok ไม่สำเร็จ", put.status, await put.text());

    // TikTok ประมวลผลฝั่งเขาต่อ — วนถามสถานะสูงสุดราว 2 นาที
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const st = await jsonFetch<{ data: { status: string; publicaly_available_post_id?: string[]; fail_reason?: string } }>(
        `${API}/post/publish/status/fetch/`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ publish_id: init.data.publish_id }),
        },
      );
      const s = st.data.status;
      if (s === "PUBLISH_COMPLETE") {
        const postId = st.data.publicaly_available_post_id?.[0] ?? init.data.publish_id;
        return { remoteId: postId, url: `https://www.tiktok.com/video/${postId}` };
      }
      if (s === "FAILED") throw new ProviderError(`TikTok ปฏิเสธคลิป: ${st.data.fail_reason ?? "ไม่ทราบสาเหตุ"}`);
    }
    return { remoteId: init.data.publish_id };
  },
};

import fs from "node:fs";
import { Provider, TokenSet, PublishInput, PublishResult, jsonFetch, ProviderError } from "./types";

const SCOPES = process.env.TIKTOK_SCOPES || "user.info.basic";
const API = "https://open.tiktokapis.com/v2";
const DEFAULT_CLIENT_KEY = "awhvwd3kkkq48i0n";
const DEFAULT_CLIENT_SECRET = "zCydsJxj6oTyvueo2qwdFRgavKrYtDJM";

function getClientKey(): string {
  return process.env.TIKTOK_CLIENT_KEY || DEFAULT_CLIENT_KEY;
}

function getClientSecret(): string {
  return process.env.TIKTOK_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
}


export const tiktok: Provider = {
  id: "tiktok",
  label: "TikTok",
  canBeSource: false, // TikTok ยังไม่เปิด API อ่านคลิปใหม่ให้ทั่วไป ใช้เป็นปลายทางอย่างเดียว

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
    const token = await jsonFetch<{ access_token: string; refresh_token: string; expires_in: number; open_id: string; scope: string }>(
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

    const info = await jsonFetch<{ data: { user: { display_name: string; open_id: string } } }>(
      `${API}/user/info/?fields=open_id,display_name`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );

    return {
      externalId: token.open_id,
      displayName: info.data.user.display_name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope,
    };
  },

  async refresh(refreshToken) {
    const t = await jsonFetch<{ access_token: string; refresh_token: string; expires_in: number }>(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: getClientKey(),
        client_secret: getClientSecret(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
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

    const put = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-range": `bytes 0-${size - 1}/${size}` },
      body: fs.createReadStream(input.filePath) as unknown as BodyInit,
      // @ts-expect-error duplex จำเป็นสำหรับการสตรีมไฟล์ใน Node fetch
      duplex: "half",
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

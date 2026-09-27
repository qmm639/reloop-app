import fs from "node:fs";
import { Provider, TokenSet, SourceItem, PublishInput, PublishResult, jsonFetch, ProviderError } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export const youtube: Provider = {
  id: "youtube",
  label: "YouTube",
  canBeSource: true,

  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline", // ขอ refresh token
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  async exchange(code, redirectUri): Promise<TokenSet> {
    const token = await jsonFetch<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      },
    );

    const ch = await jsonFetch<{ items?: { id: string; snippet: { title: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true",
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    const channel = ch.items?.[0];
    if (!channel) throw new ProviderError("บัญชีนี้ยังไม่มีช่อง YouTube");

    return {
      externalId: channel.id,
      displayName: channel.snippet.title,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope,
      meta: { uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads },
    };
  },

  async refresh(refreshToken) {
    const t = await jsonFetch<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }),
    });
    return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  },

  /** อ่านคลิปใหม่จาก RSS ของช่อง — ไม่กินโควตา API */
  async listNew(_accessToken, channelId, sinceId): Promise<SourceItem[]> {
    const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`).then((r) => r.text());
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    const items: SourceItem[] = [];
    for (const e of entries) {
      const id = /<yt:videoId>(.*?)<\/yt:videoId>/.exec(e)?.[1];
      const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1]?.trim();
      const published = /<published>(.*?)<\/published>/.exec(e)?.[1];
      if (!id || !title) continue;
      if (sinceId && id === sinceId) break; // เจอคลิปที่เคยประมวลผลแล้ว หยุด
      items.push({ externalId: id, title, url: `https://www.youtube.com/watch?v=${id}`, publishedAt: published ? new Date(published) : undefined });
    }
    return items;
  },

  /** อัปโหลดแบบ resumable: ขอ URL ก่อน แล้วค่อยส่งไฟล์ */
  async publish(accessToken, _externalId, input: PublishInput): Promise<PublishResult> {
    const size = fs.statSync(input.filePath).size;
    const start = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-upload-content-length": String(size),
          "x-upload-content-type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: { title: input.title.slice(0, 100), description: input.caption.slice(0, 5000) },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        }),
      },
    );
    const uploadUrl = start.headers.get("location");
    if (!start.ok || !uploadUrl) throw new ProviderError("ขอ URL อัปโหลดจาก YouTube ไม่สำเร็จ", start.status, await start.text());

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(size) },
      body: fs.createReadStream(input.filePath) as unknown as BodyInit,
      // @ts-expect-error duplex จำเป็นสำหรับการสตรีมไฟล์ใน Node fetch
      duplex: "half",
    });
    if (!res.ok) throw new ProviderError("อัปโหลดคลิปขึ้น YouTube ไม่สำเร็จ", res.status, await res.text());
    const data = (await res.json()) as { id: string };
    return { remoteId: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
  },
};

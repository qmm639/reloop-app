import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Provider, TokenSet, PublishInput, PublishResult, SourceItem, jsonFetch, ProviderError } from "./types";

const exec = promisify(execFile);

function getYtdlpPython(): string {
  if (process.env.YTDLP_PYTHON_PATH) return process.env.YTDLP_PYTHON_PATH;
  if (fs.existsSync("/opt/ytdlp/bin/python")) return "/opt/ytdlp/bin/python";
  if (process.env.YTDLP_PATH) {
    const dir = path.dirname(process.env.YTDLP_PATH);
    for (const name of ["python.exe", "python3", "python"]) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "python3";
}

const PY_TIKTOK_HELPER = `
import json, re, sys, time, yt_dlp
import yt_dlp.extractor.tiktok as t

mode = sys.argv[1]
arg1 = sys.argv[2].strip()
arg2 = sys.argv[3].strip() if len(sys.argv) > 3 else ""

ydl = yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True})
ie = t.TikTokUserIE(ydl)

def resolve_user(raw):
    if re.search(r"(?:vt\\.tiktok\\.com|vm\\.tiktok\\.com|/video/\\d+)", raw):
        info = ydl.extract_info(raw, download=False)
        sec = info.get("channel_id")
        uid = info.get("uploader_id") or info.get("uploader") or ""
        nick = info.get("uploader") or uid
        if sec:
            return {"secUid": sec, "uniqueId": uid, "nickname": nick}
    m = re.search(r"tiktok\\.com/@([\\w.-]+)", raw)
    u = m.group(1) if m else raw.lstrip("@").split("?")[0].split("/")[0].strip()
    url = "https://www.tiktok.com/@" + u
    h = ie._generate_blockbuster_headers()
    wp = ie._download_webpage(url, u, headers=h, impersonate=True, fatal=False) or ""
    ud = ie._get_universal_data(wp, u)
    if not ud and wp:
        try:
            ie._solve_challenge_and_set_cookies(wp)
            wp = ie._download_webpage(url, u, headers=h, impersonate=True, fatal=False) or ""
            ud = ie._get_universal_data(wp, u)
        except Exception:
            pass
    user = (ud or {}).get("webapp.user-detail", {}).get("userInfo", {}).get("user", {})
    sec = user.get("secUid") or ie._extract_sec_uid_from_embed(u)
    uid = user.get("uniqueId") or u
    nick = user.get("nickname") or uid
    return {"secUid": sec, "uniqueId": uid, "nickname": nick}

if mode == "resolve":
    info = resolve_user(arg1)
    if not info.get("secUid"):
        print(json.dumps({"error": "ไม่พบช่อง TikTok นี้ หรือช่องถูกตั้งเป็นส่วนตัว"}))
        sys.exit(0)
    print(json.dumps(info))
elif mode == "list":
    sec_uid = arg1
    uid = arg2 or "tiktok"
    if not sec_uid.startswith("MS4w"):
        info = resolve_user(sec_uid)
        sec_uid = info.get("secUid") or ""
        uid = info.get("uniqueId") or uid
    if not sec_uid:
        print(json.dumps({"error": "ไม่พบรหัสช่อง TikTok (secUid)"}))
        sys.exit(0)
    res = ie._download_json(ie._API_BASE_URL, uid, query=ie._build_web_query(sec_uid, int(time.time() * 1000)), impersonate=True, fatal=False) or {}
    if not res.get("itemList") and uid:
        resolve_user(uid)
        res = ie._download_json(ie._API_BASE_URL, uid, query=ie._build_web_query(sec_uid, int(time.time() * 1000)), impersonate=True, fatal=False) or {}
    videos = []
    for v in res.get("itemList") or []:
        vid = v.get("id")
        if not vid:
            continue
        author = (v.get("author") or {}).get("uniqueId") or uid
        desc = (v.get("desc") or "").strip()
        videos.append({
            "id": str(vid),
            "title": desc[:150] if desc else f"คลิปจาก TikTok @{author}",
            "url": f"https://www.tiktok.com/@{author}/video/{vid}",
            "createTime": v.get("createTime"),
        })
    print(json.dumps({"videos": videos}))
`;

export async function resolveTikTokPublicChannel(input: string): Promise<{ secUid: string; uniqueId: string; nickname: string }> {
  const py = getYtdlpPython();
  const { stdout } = await exec(py, ["-c", PY_TIKTOK_HELPER, "resolve", input], { timeout: 30_000 });
  const lastLine = stdout.trim().split(/\r?\n/).pop() ?? "{}";
  const parsed = JSON.parse(lastLine) as { secUid?: string; uniqueId?: string; nickname?: string; error?: string };
  if (parsed.error || !parsed.secUid) {
    throw new ProviderError(parsed.error || "ไม่พบช่อง TikTok ที่ระบุ");
  }
  return {
    secUid: parsed.secUid,
    uniqueId: parsed.uniqueId || input.replace(/^@/, ""),
    nickname: parsed.nickname || parsed.uniqueId || input,
  };
}

export async function listTikTokPublicVideos(secUidOrUser: string, uniqueIdHint: string, sinceId?: string | null): Promise<SourceItem[]> {
  const py = getYtdlpPython();
  const { stdout } = await exec(py, ["-c", PY_TIKTOK_HELPER, "list", secUidOrUser, uniqueIdHint], { timeout: 45_000 });
  const lastLine = stdout.trim().split(/\r?\n/).pop() ?? "{}";
  const parsed = JSON.parse(lastLine) as { videos?: { id: string; title: string; url: string; createTime?: number }[]; error?: string };
  if (parsed.error) {
    throw new ProviderError(parsed.error);
  }
  const items: SourceItem[] = [];
  for (const v of parsed.videos ?? []) {
    if (sinceId && v.id === sinceId) break;
    items.push({
      externalId: v.id,
      title: v.title || "คลิปจาก TikTok",
      url: v.url,
      publishedAt: v.createTime ? new Date(v.createTime * 1000) : undefined,
    });
  }
  return items;
}

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
   * อ่านคลิปสาธารณะล่าสุดของบัญชีที่เชื่อมไว้
   * รองรับทั้งบัญชีที่เชื่อมด้วย @ชื่อช่อง (ไม่ต้องผ่าน OAuth/Sandbox) และบัญชีที่เชื่อมผ่าน OAuth Display API
   */
  async listNew(accessToken, externalId, sinceId): Promise<SourceItem[]> {
    if (accessToken.startsWith("public:") || externalId.startsWith("MS4w") || externalId.startsWith("@")) {
      const uniqueId = accessToken.startsWith("public:") ? accessToken.slice("public:".length) : externalId.replace(/^@/, "");
      return listTikTokPublicVideos(externalId, uniqueId, sinceId);
    }

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

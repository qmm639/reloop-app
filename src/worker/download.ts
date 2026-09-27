import fs from "node:fs";
import path from "node:path";
import { run } from "./video";

/**
 * ดึงไฟล์ต้นฉบับมาไว้บนเครื่อง worker
 * - ลิงก์ไฟล์ตรง (S3 / Drive ที่แชร์ไฟล์) → ดาวน์โหลดด้วย fetch
 * - ลิงก์ YouTube/Facebook → ใช้ yt-dlp (ตั้งค่า YTDLP_PATH)
 *   ใช้กับคลิปของผู้ใช้เองเท่านั้น และต้องเป็นไปตามข้อกำหนดของแต่ละแพลตฟอร์ม
 */
export async function fetchSource(url: string, workDir: string): Promise<string> {
  fs.mkdirSync(workDir, { recursive: true });
  const out = path.join(workDir, "source.mp4");

  if (/^https?:\/\/[^ ]+\.(mp4|mov|m4v)(\?|$)/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์ต้นฉบับไม่สำเร็จ (${res.status})`);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    return out;
  }

  const ytdlp = process.env.YTDLP_PATH ?? "yt-dlp";
  await run(ytdlp, ["-f", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4", "-o", out, url]);
  if (!fs.existsSync(out)) throw new Error("ดึงไฟล์ต้นฉบับไม่สำเร็จ");
  return out;
}

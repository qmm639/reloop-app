import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
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

  // ลิงก์ไฟล์ตรง รวมถึงลิงก์จาก CDN ของ Facebook ที่ได้จากฟิลด์ source ของวิดีโอในเพจ
  const direct = /^https?:\/\/[^ ]+\.(mp4|mov|m4v)(\?|$)/i.test(url) || /^https?:\/\/[^/ ]*fbcdn\.net\//i.test(url);
  if (direct) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`ดาวน์โหลดไฟล์ต้นฉบับไม่สำเร็จ (${res.status})`);
    // เขียนลงดิสก์ทีละส่วน ไม่โหลดทั้งไฟล์เข้าแรม (คลิปยาวหลักร้อย MB จะทำให้เครื่องเล็กล่ม)
    await pipeline(Readable.fromWeb(res.body as unknown as NodeWebStream), fs.createWriteStream(out));
    return out;
  }

  const ytdlp = process.env.YTDLP_PATH ?? "yt-dlp";
  // คลิปแนวตั้ง 9:16 ระดับ 1080p มีขนาด 1080x1920 (height=1920) จึงต้องเปิดเพดานถึง 1920 พร้อม fallback กรณีไม่มี metadata ขนาด
  await run(ytdlp, ["-f", "bv*[height<=1920]+ba/b[height<=1920]/bv*+ba/b", "--merge-output-format", "mp4", "-o", out, url]);
  if (!fs.existsSync(out)) throw new Error("ดึงไฟล์ต้นฉบับไม่สำเร็จ");
  return out;
}

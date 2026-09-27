import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

export type Rules = {
  crop?: boolean; // ตัดเป็นแนวตั้ง 9:16
  subtitle?: boolean; // เบิร์นซับลงคลิป
  logo?: boolean; // ติดโลโก้มุมขวาบน
  highlights?: boolean; // ตัดเป็นคลิปสั้นหลายท่อน
  maxSeconds?: number; // ความยาวสูงสุดของปลายทาง
};

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = "";
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out || err) : reject(new Error(`${path.basename(cmd)} จบด้วยรหัส ${code}\n${err.slice(-1500)}`)),
    );
  });
}

export async function probe(file: string) {
  const out = await run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    file,
  ]);
  const j = JSON.parse(out) as { streams?: { width: number; height: number }[]; format?: { duration?: string } };
  return {
    width: j.streams?.[0]?.width ?? 0,
    height: j.streams?.[0]?.height ?? 0,
    duration: Number(j.format?.duration ?? 0),
  };
}

/** escape path ให้ filter ของ ffmpeg อ่านได้ทั้งบน Windows และ Linux */
function esc(p: string) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * เรนเดอร์คลิปปลายทาง
 * - crop: ครอบเป็น 1080x1920 โดยวางคลิปต้นฉบับไว้กลางพื้นหลังที่เบลอจากคลิปเดียวกัน
 * - subtitle: เบิร์นไฟล์ .srt ลงภาพ (ฟอนต์ไทยต้องติดตั้งในเครื่อง worker)
 * - logo: ซ้อนไฟล์ PNG มุมขวาบน
 */
export async function render(opts: {
  input: string;
  output: string;
  rules: Rules;
  srtPath?: string;
  logoPath?: string;
  startSec?: number;
}) {
  const { input, output, rules } = opts;
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const args: string[] = ["-y"];
  if (opts.startSec) args.push("-ss", String(opts.startSec));
  args.push("-i", input);
  if (rules.logo && opts.logoPath) args.push("-i", opts.logoPath);

  const chain: string[] = [];
  if (rules.crop) {
    chain.push(
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:6[bg]",
      "[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg]",
      "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]",
    );
  } else {
    chain.push("[0:v]scale=1080:-2[base]");
  }

  let last = "base";
  if (rules.logo && opts.logoPath) {
    chain.push(`[1:v]scale=180:-1[logo]`, `[${last}][logo]overlay=W-w-48:48[wm]`);
    last = "wm";
  }
  if (rules.subtitle && opts.srtPath) {
    chain.push(
      `[${last}]subtitles='${esc(opts.srtPath)}':force_style='FontName=Sarabun,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=120'[sub]`,
    );
    last = "sub";
  }

  args.push("-filter_complex", chain.join(";"), "-map", `[${last}]`, "-map", "0:a?");
  if (rules.maxSeconds) args.push("-t", String(rules.maxSeconds));
  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  );

  await run(FFMPEG, args);
  return output;
}

/** แยกเสียงเป็น wav 16k mono สำหรับส่งไปถอดเป็นซับ */
export async function extractAudio(input: string, output: string) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await run(FFMPEG, ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
  return output;
}

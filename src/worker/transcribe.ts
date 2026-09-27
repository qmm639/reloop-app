import fs from "node:fs";
import path from "node:path";
import { extractAudio, run } from "./video";

/**
 * ถอดเสียงเป็นไฟล์ซับ .srt
 * TRANSCRIBE_PROVIDER=openai  → ใช้ Whisper API (ต้องมี OPENAI_API_KEY)
 * TRANSCRIBE_PROVIDER=local   → ใช้ whisper.cpp ในเครื่อง (WHISPER_BIN, WHISPER_MODEL)
 * TRANSCRIBE_PROVIDER=off     → ข้ามการทำซับ
 */
export async function transcribeToSrt(videoPath: string, workDir: string): Promise<string | null> {
  const mode = process.env.TRANSCRIBE_PROVIDER ?? "off";
  if (mode === "off") return null;

  const wav = await extractAudio(videoPath, path.join(workDir, "audio.wav"));
  const srt = path.join(workDir, "subtitle.srt");

  if (mode === "local") {
    const bin = process.env.WHISPER_BIN;
    const model = process.env.WHISPER_MODEL;
    if (!bin || !model) throw new Error("โหมด local ต้องตั้งค่า WHISPER_BIN และ WHISPER_MODEL");
    await run(bin, ["-m", model, "-f", wav, "-l", "th", "-osrt", "-of", srt.replace(/\.srt$/, "")]);
    return fs.existsSync(srt) ? srt : null;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("โหมด openai ต้องตั้งค่า OPENAI_API_KEY");

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(wav)]), "audio.wav");
  form.append("model", "whisper-1");
  form.append("language", "th");
  form.append("response_format", "srt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`ถอดเสียงไม่สำเร็จ (${res.status}): ${await res.text()}`);

  fs.writeFileSync(srt, await res.text(), "utf8");
  return srt;
}

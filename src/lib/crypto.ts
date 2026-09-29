import crypto from "node:crypto";

/**
 * เข้ารหัส access/refresh token ก่อนเก็บลงฐานข้อมูล
 * ถ้าฐานข้อมูลรั่ว โทเคนของผู้ใช้ยังใช้ไม่ได้ถ้าไม่มี TOKEN_ENC_KEY
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) throw new Error("ยังไม่ได้ตั้งค่า TOKEN_ENC_KEY ใน .env");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  // ค่าที่ไม่ใช่ base64 32 ไบต์พอดี (เช่นค่าที่ปุ่ม Generate ของ Render สร้าง) แปลงเป็นคีย์ 32 ไบต์ด้วย SHA-256
  if (raw.length < 32) throw new Error("TOKEN_ENC_KEY สั้นเกินไป ต้องยาวอย่างน้อย 32 ตัวอักษร");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) throw new Error("รูปแบบข้อมูลที่เข้ารหัสไม่ถูกต้อง");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export const randomId = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

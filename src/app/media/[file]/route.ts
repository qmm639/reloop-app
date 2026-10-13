import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * ให้แพลตฟอร์มปลายทางดึงไฟล์คลิปที่รอโพสต์ผ่าน URL สาธารณะ
 * (Instagram ไม่รับอัปโหลดไฟล์ตรง ต้องส่ง URL ให้ไปดึงเอง)
 *
 * เสิร์ฟเฉพาะไฟล์ .mp4 ในโฟลเดอร์ renders ซึ่งชื่อไฟล์เป็นรหัสสุ่มของคลิป
 * และไฟล์ถูกลบทิ้งทันทีที่โพสต์ครบทุกปลายทาง (ค้างได้นานสุด 24 ชั่วโมง)
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[a-z0-9]+\.mp4$/i.test(file)) return new NextResponse("ไม่พบไฟล์", { status: 404 });

  const full = path.join(path.resolve(process.env.STORAGE_DIR ?? "./storage"), "renders", file);
  const stat = await fs.promises.stat(full).catch(() => null);
  if (!stat?.isFile()) return new NextResponse("ไม่พบไฟล์", { status: 404 });

  return new NextResponse(Readable.toWeb(fs.createReadStream(full)) as unknown as BodyInit, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(stat.size),
      "cache-control": "no-store",
    },
  });
}

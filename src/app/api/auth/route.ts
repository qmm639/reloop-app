import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({
  action: z.enum(["register", "login", "logout"]),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
  const { action, email, password, name } = parsed.data;

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }
  if (!email || !password) return NextResponse.json({ error: "กรอกอีเมลและรหัสผ่าน" }, { status: 400 });

  if (action === "register") {
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "อีเมลนี้ถูกใช้แล้ว" }, { status: 409 });
    const user = await db.user.create({
      data: { email, name: name ?? null, passwordHash: await hashPassword(password) },
    });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}

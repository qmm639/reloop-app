# Reloop — ระบบหลังบ้าน

ระบบกระจายคอนเทนต์อัตโนมัติ: ดึงคลิปใหม่จากช่องต้นทาง → ตัด 9:16 ใส่ซับ ติดโลโก้ → โพสต์ขึ้นหลายแพลตฟอร์มตามเวลาที่ตั้งไว้

| ส่วน | เทคโนโลยี | ไฟล์หลัก |
| --- | --- | --- |
| เว็บ + API | Next.js 15 (App Router), TypeScript | `src/app` |
| ฐานข้อมูล | Prisma · SQLite (dev) / Postgres (prod) | `prisma/schema.prisma` |
| สมาชิก | คุกกี้ JWT + bcrypt | `src/lib/auth.ts` |
| เชื่อมบัญชี | OAuth ของ YouTube, TikTok, Facebook, Instagram | `src/lib/providers/` |
| คิวงาน | ตาราง `Job` ในฐานข้อมูล (ไม่ต้องใช้ Redis) | `src/lib/queue.ts` |
| ตัดต่อวิดีโอ | ffmpeg | `src/worker/video.ts` |
| ถอดเสียงเป็นซับ | Whisper API หรือ whisper.cpp | `src/worker/transcribe.ts` |
| ชำระเงิน | Stripe Subscriptions + Webhook | `src/app/api/billing/` |

## เริ่มใช้งานใน 4 คำสั่ง

```bash
npm install
cp .env.example .env      # แล้วเติมค่าคีย์ต่าง ๆ
npm run db:push           # สร้างตารางในฐานข้อมูล
npm run dev               # เปิด http://localhost:3000
```

เปิดอีกหน้าต่างเทอร์มินัลเพื่อรันตัวประมวลผลเบื้องหลัง:

```bash
npm run worker
```

สร้างคีย์ลับสองตัวใน `.env` ด้วยคำสั่งนี้:

```bash
node -e "const c=require('crypto');console.log('AUTH_SECRET='+c.randomBytes(32).toString('base64url'));console.log('TOKEN_ENC_KEY='+c.randomBytes(32).toString('base64'))"
```

## ทั้ง 4 ส่วนอยู่ตรงไหน

### 1. เซิร์ฟเวอร์และฐานข้อมูล
- ตาราง: `User`, `Connection`, `Workflow`, `WorkflowDestination`, `SourceItem`, `Post`, `Job`
- สมัครสมาชิก/เข้าสู่ระบบที่ `POST /api/auth` เก็บเซสชันเป็นคุกกี้ `httpOnly` อายุ 30 วัน
- ขึ้น production ให้เปลี่ยน `provider` ใน `schema.prisma` เป็น `postgresql` แล้วรัน `npx prisma migrate deploy`

### 2. เชื่อมบัญชีแพลตฟอร์ม (OAuth)
- เริ่มที่ `GET /api/connect/{provider}` → พาผู้ใช้ไปหน้าอนุมัติของแพลตฟอร์ม → กลับมาที่ `/callback`
- กัน CSRF ด้วยค่า `state` ที่สุ่มและเก็บในคุกกี้
- access token และ refresh token ถูกเข้ารหัส AES-256-GCM ก่อนบันทึก (`src/lib/crypto.ts`) และต่ออายุอัตโนมัติเมื่อใกล้หมดอายุ (`usableToken`)
- URL ที่ต้องใส่ในหน้าตั้งค่าแอปของแต่ละแพลตฟอร์ม: `{APP_URL}/api/connect/{provider}/callback`

**สิ่งที่ต้องทำเองก่อนใช้จริง:** ยื่นขอสิทธิ์กับเจ้าของแพลตฟอร์ม — Google (YouTube Data API + ตรวจสอบแอป), TikTok (`video.publish` ต้องผ่าน review), Meta (`pages_manage_posts`, `instagram_content_publish` ต้องผ่าน App Review) โค้ดในโฟลเดอร์ `providers` เขียนตามรูปแบบ API ของแต่ละเจ้า แต่เวอร์ชันและชื่อฟิลด์เปลี่ยนได้ตลอด ให้เทียบกับเอกสารล่าสุดก่อนเปิดใช้งานจริง

### 3. คิวงานและการตัดต่อ
- `npm run worker` วนรับงานจากตาราง `Job` รองรับหลาย worker พร้อมกัน (จองงานด้วย `updateMany` กันชนกัน) และลองใหม่อัตโนมัติแบบถอยเวลา 1 → 5 → 25 นาที
- ลำดับงาน: `poll` (ตรวจคลิปใหม่) → `render` (ดาวน์โหลด + ตัด + ซับ + โลโก้) → `publish` (อัปโหลดทีละปลายทาง)
- คำสั่ง ffmpeg อยู่ใน `src/worker/video.ts` — ครอบ 9:16 โดยใช้คลิปเดิมเบลอเป็นพื้นหลัง, เบิร์นซับจากไฟล์ `.srt`, ซ้อนโลโก้ PNG มุมขวาบน
- ดึงไฟล์ต้นฉบับผ่าน `yt-dlp` (ตั้งค่า `YTDLP_PATH`) ใช้กับคลิปของผู้ใช้เองเท่านั้น
- ซับไทย: ตั้ง `TRANSCRIBE_PROVIDER=openai` (ใช้ Whisper API) หรือ `local` (whisper.cpp) และต้องติดตั้งฟอนต์ไทยบนเครื่อง worker เพื่อให้ซับแสดงผลถูกต้อง

### 4. ชำระเงินรายเดือน
- `POST /api/billing/checkout` เปิดหน้า Stripe Checkout, `POST /api/billing/portal` เปิดหน้าจัดการการสมัคร
- `POST /api/billing/webhook` รับ `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` แล้วอัปเดตแพ็กเกจและล้างโควตาคลิปทุกรอบบิล
- เพดานของแต่ละแพ็กเกจกำหนดที่ `src/lib/plans.ts` และถูกบังคับใช้จริงตอนสร้างเวิร์กโฟลว์และตอนเรนเดอร์
- ทดสอบ webhook ในเครื่อง: `stripe listen --forward-to localhost:3000/api/billing/webhook`

## ที่ทดสอบแล้วในเครื่องนี้
- `npm run build` ผ่าน และ `tsc --noEmit` ไม่มี error
- สมัครสมาชิกผ่าน API ได้ เข้าหน้า `/dashboard` ได้ด้วยคุกกี้เซสชัน
- ตัดวิดีโอจริงด้วย ffmpeg: ไฟล์ 1920×1080 → 1080×1920 สำเร็จ
- worker เริ่มทำงานและวนรับงานได้

## ที่ยังทดสอบไม่ได้
การเชื่อมบัญชีจริงและการโพสต์จริง ต้องมีคีย์ของแต่ละแพลตฟอร์มและผ่าน App Review ก่อน เช่นเดียวกับ Stripe ที่ต้องใส่คีย์จริงถึงจะกดสมัครได้

## ขึ้น production
1. ฐานข้อมูล Postgres (Neon, Supabase หรือ RDS)
2. เว็บขึ้น Vercel ได้ แต่ **worker ต้องรันบนเครื่องที่มี ffmpeg** เช่น Railway, Fly.io หรือ VPS — Vercel ไม่เหมาะกับงานเรนเดอร์ยาว
3. ไฟล์วิดีโอเก็บบน S3 หรือ Cloudflare R2 แล้วตั้ง `PUBLIC_MEDIA_BASE_URL` (จำเป็นสำหรับ Instagram ที่ต้องดึงไฟล์จาก URL สาธารณะ)
4. ตั้ง `APP_URL` เป็นโดเมนจริง และใส่ callback URL เดียวกันในหน้าตั้งค่าแอปของทุกแพลตฟอร์ม

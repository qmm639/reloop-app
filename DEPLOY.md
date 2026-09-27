# ขึ้นเว็บที่ app.qmm639.com

ใช้ Render แบบเดียวกับ bot.qmm639.com เป็นคนละบริการแยกกัน ไม่กระทบตัวเดิม

## ขั้นที่ 1 — เอาโค้ดขึ้น GitHub

โค้ดถูก commit ไว้ให้แล้วในโฟลเดอร์นี้ เหลือแค่สร้าง repo แล้ว push

```bash
gh repo create reloop-app --private --source=. --push
```

ถ้าไม่มีคำสั่ง `gh` ให้สร้าง repo เปล่าบน github.com แล้วรัน

```bash
git remote add origin https://github.com/<ชื่อคุณ>/reloop-app.git
git push -u origin main
```

## ขั้นที่ 2 — สร้างบริการบน Render

1. เข้า dashboard.render.com → **New** → **Blueprint**
2. เลือก repo `reloop-app` — Render จะอ่าน `render.yaml` แล้วตั้งค่าให้เอง
3. Render จะถามค่าที่ต้องกรอกเอง กรอกตามนี้

| ตัวแปร | ค่าที่ใส่ |
| --- | --- |
| `TOKEN_ENC_KEY` | สร้างด้วยคำสั่งด้านล่าง |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | จาก Google Cloud Console |
| `META_APP_ID` / `META_APP_SECRET` | จาก Meta for Developers |
| `META_SCOPES` | เว้นว่างไว้ก่อนได้ |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | จาก TikTok for Developers |
| `STRIPE_*` | ใส่ทีหลังได้ ระบบจะซ่อนปุ่มสมัครไว้ก่อน |

สร้างคีย์เข้ารหัสโทเคน:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`AUTH_SECRET` ไม่ต้องกรอก Render สุ่มให้เองตามที่ตั้งไว้ใน `render.yaml`

## ขั้นที่ 3 — ต่อโดเมน app.qmm639.com

1. Render → บริการ `reloop` → **Settings** → **Custom Domains** → **Add Custom Domain**
2. ใส่ `app.qmm639.com`
3. ไปที่ผู้ให้บริการโดเมน เพิ่ม DNS record ตามนี้

| ชนิด | ชื่อ | ค่า |
| --- | --- | --- |
| CNAME | `app` | `reloop.onrender.com` (Render จะบอกค่าจริงให้) |

4. รอ DNS อัปเดต 5–30 นาที Render จะออกใบรับรอง HTTPS ให้เอง

## ขั้นที่ 4 — อัปเดต redirect URI ของทุกแพลตฟอร์ม

พอโดเมนใช้ได้แล้ว เอา URL ชุดนี้ไปใส่แทนของ localhost

| ที่ไหน | URL |
| --- | --- |
| Google Cloud Console → Credentials | `https://app.qmm639.com/api/connect/youtube/callback` |
| Meta → Facebook Login → Valid OAuth Redirect URIs | `https://app.qmm639.com/api/connect/facebook/callback` และ `.../instagram/callback` |
| TikTok → Login Kit → Redirect URI | `https://app.qmm639.com/api/connect/tiktok/callback` |
| Stripe → Webhooks → Endpoint | `https://app.qmm639.com/api/billing/webhook` |

จะเก็บ URL ของ localhost ไว้ด้วยก็ได้ ทุกแพลตฟอร์มใส่ได้หลายอัน จะได้ทดสอบในเครื่องต่อได้

## ค่าใช้จ่ายโดยประมาณ

| รายการ | ราคา |
| --- | --- |
| Render 0.5 CPU / 512MB | ~$7 ต่อเดือน |
| ดิสก์ 2GB | ~$0.50 ต่อเดือน |
| ถอดเสียงทำซับ (ถ้าเปิด) | จ่ายตามการใช้งานจริง |

ตั้งไว้ให้โพสต์คลิปต้นฉบับโดยไม่ตัดต่อ จึงใช้เครื่องเล็กสุดได้ ถ้าวันหลังเปิดตัดต่อหรือใส่ซับ ให้เพิ่มแพลนเป็น 1 CPU / 2GB (~$25)

## ตรวจว่าใช้งานได้จริง

1. เปิด `https://app.qmm639.com` ต้องเห็นหน้าแรก
2. สมัครสมาชิก แล้วเข้าหน้าแดชบอร์ดได้
3. ไปหน้า "บัญชีที่เชื่อม" กดเชื่อม YouTube ต้องเด้งไปหน้าอนุมัติของ Google และกลับมาแล้วเห็นชื่อช่อง
4. สร้างเวิร์กโฟลว์ กด "ตรวจเดี๋ยวนี้" แล้วดูที่ Render → Logs ต้องเห็นบรรทัด `[poll]`

## ข้อจำกัดที่ยังเหลือ

- **Instagram** ต้องตั้ง `PUBLIC_MEDIA_BASE_URL` ให้ชี้ไปที่เก็บไฟล์สาธารณะ (S3 หรือ Cloudflare R2) เพราะ Instagram ดึงไฟล์จาก URL เท่านั้น
- **Facebook และ TikTok** โพสต์ให้ได้เฉพาะบัญชีที่เป็นแอดมินของแอป จนกว่าจะผ่าน App Review
- **การดึงคลิปจาก YouTube** ใช้กับช่องของผู้ใช้เองเท่านั้น และต้องเป็นไปตามข้อกำหนดของแพลตฟอร์ม

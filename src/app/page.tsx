import Link from "next/link";
import { getUser } from "@/lib/auth";

export default async function Home() {
  const user = await getUser();
  return (
    <main className="wrap" style={{ paddingBlock: 64, display: "grid", gap: 28, maxWidth: 820 }}>
      <p className="mono" style={{ color: "var(--wire)", letterSpacing: ".12em", textTransform: "uppercase" }}>
        Reloop Studio
      </p>
      <h1 style={{ font: "800 clamp(34px,5vw,54px)/1.08 var(--f-head)" }}>
        อัดครั้งเดียว ปล่อยครบทุกช่องทาง
      </h1>
      <p className="muted" style={{ fontSize: 17, maxWidth: "52ch" }}>
        เชื่อมช่องต้นทางกับปลายทางไว้ครั้งเดียว ทุกคลิปใหม่ที่คุณลงจะถูกโพสต์ต่อไปยังช่องทางอื่นของคุณให้เองตามเวลาที่ตั้งไว้
      </p>
      <div className="row">
        {user ? (
          <Link className="btn btn-main" href="/dashboard">ไปที่แดชบอร์ด</Link>
        ) : (
          <>
            <Link className="btn btn-main" href="/login?mode=register">สมัครใช้งาน</Link>
            <Link className="btn btn-line" href="/login">เข้าสู่ระบบ</Link>
          </>
        )}
      </div>
      <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
        <b>ใช้กับคลิปและบัญชีของคุณเองเท่านั้น</b>
        <p className="muted" style={{ marginTop: 6 }}>
          การเชื่อมบัญชีทำผ่านหน้าอนุมัติสิทธิ์ของ YouTube, Facebook, Instagram และ TikTok โดยตรง ระบบไม่เห็นรหัสผ่านของคุณ
          และคุณยกเลิกการเชื่อมหรือหยุดการโพสต์อัตโนมัติได้ทุกเมื่อ
        </p>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link> · <Link href="/terms">ข้อกำหนดการให้บริการ</Link>
      </p>
    </main>
  );
}

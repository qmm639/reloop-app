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
        เชื่อมช่องต้นทางกับปลายทางไว้ครั้งเดียว ทุกคลิปใหม่จะถูกตัด ใส่ซับ ติดโลโก้ และโพสต์ให้เองตามเวลาที่ตั้งไว้
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
        <b>หน้านี้เป็นแอปจริงของระบบหลังบ้าน</b>
        <p className="muted" style={{ marginTop: 6 }}>
          หน้าการตลาดฉบับเต็มอยู่ในไฟล์ reloop.html แยกต่างหาก ส่วนโปรเจกต์นี้คือระบบผู้ใช้ การเชื่อมบัญชี คิวงานตัดต่อ
          และการรับชำระเงิน
        </p>
      </div>
    </main>
  );
}

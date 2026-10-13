import Link from "next/link";

export const metadata = { title: "นโยบายความเป็นส่วนตัว · Reloop Studio" };
export const dynamic = "force-dynamic";

export default function Privacy() {
  const contact = process.env.CONTACT_EMAIL;

  return (
    <main className="wrap" style={{ paddingBlock: 56, display: "grid", gap: 18, maxWidth: 760 }}>
      <p className="mono muted">ปรับปรุงล่าสุด 13 ตุลาคม 2569</p>
      <h1 style={{ font: "800 34px/1.15 var(--f-head)" }}>นโยบายความเป็นส่วนตัว</h1>
      <p className="muted">
        Reloop Studio เป็นเครื่องมือสำหรับเจ้าของช่อง ใช้นำคลิปที่คุณลงในช่องทางหนึ่งของคุณไปโพสต์ต่อในช่องทางอื่นของคุณโดยอัตโนมัติ
        หน้านี้อธิบายว่าเราเก็บข้อมูลอะไร ใช้ทำอะไร และคุณควบคุมได้อย่างไร
      </p>

      <h2 style={{ fontSize: 20 }}>ข้อมูลที่เราเก็บ</h2>
      <ul className="muted" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>อีเมลและรหัสผ่านของบัญชี Reloop รหัสผ่านถูกเก็บในรูปที่เข้ารหัสทางเดียว เราอ่านรหัสผ่านของคุณไม่ได้</li>
        <li>ชื่อและรหัสของช่องหรือเพจที่คุณเชื่อม และโทเคนที่แพลตฟอร์มออกให้เมื่อคุณกดอนุญาต โทเคนถูกเข้ารหัสก่อนบันทึก</li>
        <li>ชื่อคลิป ลิงก์ และสถานะการโพสต์ของคลิปที่ระบบประมวลผลให้คุณ</li>
        <li>ไฟล์วิดีโอของคลิปที่กำลังรอโพสต์ เก็บไว้ชั่วคราวและลบทิ้งเมื่อโพสต์ครบทุกปลายทาง หรือภายใน 24 ชั่วโมง</li>
      </ul>
      <p className="muted">เราไม่เห็นและไม่เก็บรหัสผ่านของ YouTube, Facebook, Instagram หรือ TikTok ของคุณ</p>

      <h2 style={{ fontSize: 20 }}>เราใช้ข้อมูลทำอะไร</h2>
      <ul className="muted" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>ตรวจว่าช่องต้นทางของคุณมีคลิปใหม่หรือไม่</li>
        <li>อัปโหลดคลิปนั้นไปยังช่องหรือเพจปลายทางที่คุณเลือกไว้ในเวิร์กโฟลว์</li>
        <li>แสดงประวัติการโพสต์และยอดการใช้งานในแดชบอร์ดของคุณ</li>
      </ul>
      <p className="muted">เราไม่ขายข้อมูล ไม่ใช้ข้อมูลเพื่อโฆษณา และไม่ส่งต่อให้บุคคลอื่น นอกจากการส่งคลิปไปยังแพลตฟอร์มปลายทางตามที่คุณสั่ง</p>

      <h2 style={{ fontSize: 20 }}>ข้อมูลจากบริการของ Google และ YouTube</h2>
      <p className="muted">
        Reloop ใช้ YouTube API Services เพื่ออ่านข้อมูลช่องของคุณและอัปโหลดวิดีโอขึ้นช่องของคุณ การใช้งานส่วนนี้อยู่ภายใต้{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">ข้อกำหนดในการให้บริการของ YouTube</a> และ{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">นโยบายความเป็นส่วนตัวของ Google</a>
      </p>
      <p className="muted">
        การใช้และการส่งต่อข้อมูลที่ได้รับจาก Google APIs ของเราเป็นไปตาม{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>{" "}
        รวมถึงข้อกำหนดเรื่อง Limited Use คุณถอนสิทธิ์ที่ให้ไว้ได้ทุกเมื่อที่{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">หน้าการตั้งค่าความปลอดภัยของบัญชี Google</a>
      </p>

      <h2 style={{ fontSize: 20 }}>ข้อมูลจาก Facebook, Instagram และ TikTok</h2>
      <p className="muted">
        เราขอสิทธิ์เท่าที่จำเป็นสำหรับการอ่านรายการวิดีโอของเพจและการโพสต์วิดีโอในนามเพจหรือบัญชีที่คุณเลือก
        คุณถอนสิทธิ์ได้จากหน้าการตั้งค่าของแต่ละแพลตฟอร์ม
      </p>

      <h2 style={{ fontSize: 20 }}>การควบคุมและการลบข้อมูล</h2>
      <ul className="muted" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>หยุดหรือลบเวิร์กโฟลว์ได้ที่หน้าภาพรวม การลบจะลบประวัติคลิปและโพสต์ของเวิร์กโฟลว์นั้นด้วย</li>
        <li>ยกเลิกการเชื่อมบัญชีได้ที่หน้าบัญชีที่เชื่อม ระบบจะลบโทเคนของบัญชีนั้นทันที</li>
        <li>
          ขอลบบัญชี Reloop และข้อมูลทั้งหมดได้โดยติดต่อเรา
          {contact ? <> ที่ <a href={`mailto:${contact}`}>{contact}</a></> : " ผ่านช่องทางที่ได้รับตอนสมัครใช้งาน"} เราจะดำเนินการภายใน 30 วัน
        </li>
      </ul>

      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        <Link href="/">หน้าแรก</Link> · <Link href="/terms">ข้อกำหนดการให้บริการ</Link>
      </p>
    </main>
  );
}

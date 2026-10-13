import Link from "next/link";

export const metadata = { title: "ข้อกำหนดการให้บริการ · Reloop Studio" };
export const dynamic = "force-dynamic";

export default function Terms() {
  const contact = process.env.CONTACT_EMAIL;

  return (
    <main className="wrap" style={{ paddingBlock: 56, display: "grid", gap: 18, maxWidth: 760 }}>
      <p className="mono muted">ปรับปรุงล่าสุด 13 ตุลาคม 2569</p>
      <h1 style={{ font: "800 34px/1.15 var(--f-head)" }}>ข้อกำหนดการให้บริการ</h1>
      <p className="muted">การสมัครหรือใช้งาน Reloop Studio ถือว่าคุณยอมรับข้อกำหนดในหน้านี้</p>

      <h2 style={{ fontSize: 20 }}>บริการที่ให้</h2>
      <p className="muted">
        Reloop ตรวจคลิปใหม่จากช่องต้นทางที่คุณเชื่อมไว้ แล้วโพสต์คลิปนั้นไปยังช่องหรือเพจปลายทางที่คุณเลือก ตามรอบเวลาและรูปแบบที่คุณตั้ง
      </p>

      <h2 style={{ fontSize: 20 }}>สิ่งที่คุณรับรอง</h2>
      <ul className="muted" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>คุณเป็นเจ้าของหรือมีสิทธิ์ดูแลช่องและเพจทุกแห่งที่นำมาเชื่อม</li>
        <li>คลิปที่ให้ระบบโพสต์เป็นของคุณ หรือคุณมีสิทธิ์เผยแพร่คลิปนั้นในทุกปลายทางที่เลือก</li>
        <li>คุณจะปฏิบัติตามข้อกำหนดของ YouTube, Facebook, Instagram และ TikTok</li>
      </ul>

      <h2 style={{ fontSize: 20 }}>ความรับผิดชอบต่อเนื้อหา</h2>
      <p className="muted">
        ทุกโพสต์ที่ระบบส่งออกไปเป็นการโพสต์ในนามบัญชีของคุณ และเป็นความรับผิดชอบของคุณ
        คุณหยุดเวิร์กโฟลว์หรือยกเลิกการเชื่อมบัญชีได้ทุกเมื่อ
      </p>

      <h2 style={{ fontSize: 20 }}>สิ่งที่ห้ามทำ</h2>
      <ul className="muted" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>นำคลิปของผู้อื่นมาเผยแพร่ซ้ำโดยไม่ได้รับอนุญาต</li>
        <li>ใช้ระบบส่งสแปม เนื้อหาหลอกลวง หรือเนื้อหาที่ผิดกฎหมาย</li>
        <li>พยายามเข้าถึงบัญชีหรือข้อมูลของผู้ใช้รายอื่น</li>
      </ul>
      <p className="muted">การฝ่าฝืนเป็นเหตุให้เราระงับบัญชีได้ทันที</p>

      <h2 style={{ fontSize: 20 }}>แพ็กเกจและโควตา</h2>
      <p className="muted">
        แต่ละแพ็กเกจกำหนดจำนวนเวิร์กโฟลว์ ปลายทาง และจำนวนคลิปต่อเดือน เมื่อใช้ครบโควตา ระบบจะหยุดประมวลผลคลิปใหม่จนกว่าจะขึ้นรอบเดือนถัดไปหรือเปลี่ยนแพ็กเกจ
      </p>

      <h2 style={{ fontSize: 20 }}>ข้อจำกัดของบริการ</h2>
      <p className="muted">
        Reloop ทำงานผ่าน API ของแพลตฟอร์มภายนอก ซึ่งอาจเปลี่ยนเงื่อนไข จำกัดการใช้งาน หรือปฏิเสธคลิปบางรายการได้
        เราจึงไม่รับประกันว่าทุกคลิปจะโพสต์สำเร็จทุกปลายทาง สถานะและสาเหตุที่โพสต์ไม่สำเร็จจะแสดงในแดชบอร์ด
        ความรับผิดสูงสุดของเราจำกัดอยู่ที่ค่าบริการที่คุณชำระในรอบ 3 เดือนล่าสุด
      </p>

      <h2 style={{ fontSize: 20 }}>ข้อมูลของคุณ</h2>
      <p className="muted">
        การเก็บและใช้ข้อมูลเป็นไปตาม <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>

      <h2 style={{ fontSize: 20 }}>ติดต่อเรา</h2>
      <p className="muted">
        {contact ? <>มีคำถามเกี่ยวกับข้อกำหนดนี้ ติดต่อได้ที่ <a href={`mailto:${contact}`}>{contact}</a></> : "มีคำถามเกี่ยวกับข้อกำหนดนี้ ติดต่อผู้ให้บริการผ่านช่องทางที่ได้รับตอนสมัครใช้งาน"}
      </p>

      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        <Link href="/">หน้าแรก</Link> · <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>
    </main>
  );
}

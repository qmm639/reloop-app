import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { providers } from "@/lib/providers";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = {
  youtube: "#E0342A",
  tiktok: "#111418",
  facebook: "#1B6FD6",
  instagram: "#C1358A",
};

export default async function Connections({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = (await getUser())!;
  const sp = await searchParams;
  const list = await db.connection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 26 }}>บัญชีที่เชื่อม</h1>
        <p className="muted">การเชื่อมบัญชีทำผ่านหน้าอนุมัติสิทธิ์ของแต่ละแพลตฟอร์มโดยตรง ระบบไม่เห็นรหัสผ่านของคุณ</p>
      </div>

      {sp.connected && (
        <p className="pill ok">
          เชื่อม {sp.connected} เรียบร้อยแล้ว {sp.count ? `(เพิ่ม ${sp.count} บัญชี)` : ""}
        </p>
      )}
      {sp.disconnected && <p className="pill ok">ตัดการเชื่อมต่อบัญชีเรียบร้อยแล้ว</p>}
      {sp.error && <p className="pill err">เชื่อมต่อไม่สำเร็จ: {sp.error}</p>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        {Object.values(providers).map((p) => (
          <div className="card grid" key={p.id} style={{ gap: 10 }}>
            <div className="row">
              <span className="chip" style={{ background: COLOR[p.id] }}>{p.id.slice(0, 2).toUpperCase()}</span>
              <b>{p.label}</b>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              {p.canBeSource ? "ใช้เป็นต้นทางและปลายทางได้" : "ใช้เป็นปลายทางเท่านั้น"}
            </p>
            <a className="btn btn-line" href={`/api/connect/${p.id}`}>
              {p.id === "facebook" ? "เชื่อมต่อ / เพิ่มเพจ" : "เชื่อมบัญชี"}
            </a>
          </div>
        ))}
      </div>

      <section className="card">
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>บัญชีที่เชื่อมแล้ว</h2>
        {list.length === 0 ? (
          <p className="muted">ยังไม่มีบัญชีที่เชื่อม</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>แพลตฟอร์ม</th>
                <th>ชื่อบัญชี</th>
                <th>โทเคนหมดอายุ</th>
                <th>เชื่อมเมื่อ</th>
                <th style={{ textAlign: "right" }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="chip" style={{ background: COLOR[c.provider] }}>
                      {c.provider.slice(0, 2).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <b>{c.displayName}</b>
                    <div className="mono muted">{c.externalId}</div>
                  </td>
                  <td className="mono muted">{c.expiresAt ? c.expiresAt.toLocaleString("th-TH") : "ไม่ระบุ"}</td>
                  <td className="mono muted">{c.createdAt.toLocaleDateString("th-TH")}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action="/api/connect/disconnect" method="POST" style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="btn btn-line"
                        style={{
                          padding: "4px 12px",
                          minHeight: 32,
                          fontSize: 12,
                          color: "var(--err)",
                          borderColor: "color-mix(in srgb, var(--err) 30%, transparent)",
                        }}
                      >
                        ตัดการเชื่อมต่อ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

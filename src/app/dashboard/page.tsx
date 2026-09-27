import Link from "next/link";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, PlanId, quotaLeft } from "@/lib/plans";
import RunButton from "@/components/RunButton";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const user = (await getUser())!;
  const plan = (user.plan as PlanId) ?? "free";
  const limit = PLANS[plan].clipsPerMonth;

  const [workflows, connections, posts, queued] = await Promise.all([
    db.workflow.findMany({
      where: { userId: user.id },
      include: { destinations: true, sourceConnection: true },
      orderBy: { createdAt: "desc" },
    }),
    db.connection.count({ where: { userId: user.id } }),
    db.post.findMany({
      where: { workflow: { userId: user.id } },
      include: { connection: true, sourceItem: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.job.count({ where: { status: "queued" } }),
  ]);

  const stats = [
    { k: "คลิปที่ใช้เดือนนี้", v: `${user.clipsUsed}${limit === Infinity ? "" : ` / ${limit}`}`, d: limit === Infinity ? "ไม่จำกัด" : `เหลือ ${quotaLeft({ plan, clipsUsed: user.clipsUsed, usageResetAt: user.usageResetAt })} คลิป` },
    { k: "บัญชีที่เชื่อม", v: String(connections), d: "ต้นทางและปลายทางรวมกัน" },
    { k: "เวิร์กโฟลว์", v: String(workflows.length), d: `เปิดอยู่ ${workflows.filter((w) => w.active).length} รายการ` },
    { k: "งานในคิว", v: String(queued), d: "worker จะทยอยประมวลผล" },
  ];

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="spread">
        <h1 style={{ fontSize: 26 }}>ภาพรวม</h1>
        <Link className="btn btn-main" href="/dashboard/workflows/new">สร้างเวิร์กโฟลว์</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {stats.map((s) => (
          <div className="card" key={s.k}>
            <div className="mono muted">{s.k}</div>
            <div style={{ font: "700 30px var(--f-head)", marginTop: 4 }}>{s.v}</div>
            <div className="muted" style={{ fontSize: 13 }}>{s.d}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>เวิร์กโฟลว์</h2>
        {workflows.length === 0 ? (
          <p className="muted">ยังไม่มีเวิร์กโฟลว์ — เชื่อมบัญชีก่อนแล้วสร้างอันแรกได้เลย</p>
        ) : (
          <table>
            <thead>
              <tr><th>ชื่อ</th><th>ต้นทาง</th><th>ปลายทาง</th><th>รอบตรวจ</th><th>ตรวจล่าสุด</th><th></th></tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id}>
                  <td><b>{w.name}</b></td>
                  <td className="muted">{w.sourceConnection?.displayName ?? w.sourceKind}</td>
                  <td className="muted">{w.destinations.length} ช่อง</td>
                  <td className="mono">{w.checkEvery} นาที</td>
                  <td className="mono muted">{w.lastCheckedAt ? w.lastCheckedAt.toLocaleString("th-TH") : "ยังไม่เคย"}</td>
                  <td><RunButton workflowId={w.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>โพสต์ล่าสุด</h2>
        {posts.length === 0 ? (
          <p className="muted">ยังไม่มีการโพสต์ เมื่อ worker เจอคลิปใหม่ รายการจะขึ้นที่นี่</p>
        ) : (
          <table>
            <thead><tr><th>คลิป</th><th>ปลายทาง</th><th>สถานะ</th><th>เวลา</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{p.sourceItem.title}</td>
                  <td className="muted">{p.connection.displayName}</td>
                  <td>
                    <span className={`pill ${p.status === "published" ? "ok" : p.status === "failed" ? "err" : ""}`}>
                      {p.status === "published" ? "โพสต์แล้ว" : p.status === "failed" ? "ล้มเหลว" : "กำลังดำเนินการ"}
                    </span>
                    {p.error && <div className="mono" style={{ color: "var(--err)" }}>{p.error.slice(0, 90)}</div>}
                  </td>
                  <td className="mono muted">{(p.publishedAt ?? p.createdAt).toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

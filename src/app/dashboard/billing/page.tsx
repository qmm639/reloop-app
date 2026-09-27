import { getUser } from "@/lib/auth";
import { PLANS, PlanId } from "@/lib/plans";
import BillingButtons from "@/components/BillingButtons";

export const dynamic = "force-dynamic";

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = (await getUser())!;
  const sp = await searchParams;
  const current = (user.plan as PlanId) ?? "free";
  const configured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 26 }}>แพ็กเกจและบิล</h1>
        <p className="muted">
          แพ็กเกจปัจจุบัน: <b>{PLANS[current].name}</b>
          {user.periodEnd && ` · รอบถัดไป ${user.periodEnd.toLocaleDateString("th-TH")}`}
        </p>
      </div>

      {sp.status === "success" && <p className="pill ok">ชำระเงินสำเร็จ ระบบจะอัปเดตแพ็กเกจเมื่อได้รับ webhook จาก Stripe</p>}
      {sp.status === "cancel" && <p className="pill">ยกเลิกการชำระเงินแล้ว</p>}
      {sp.error === "limit" && <p className="pill err">จำนวนบัญชีถึงเพดานของแพ็กเกจปัจจุบันแล้ว</p>}
      {!configured && <p className="pill err">ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY ปุ่มสมัครจะยังใช้ไม่ได้</p>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        {(Object.keys(PLANS) as PlanId[]).filter((p) => p !== "free").map((id) => {
          const p = PLANS[id];
          return (
            <div className="card grid" key={id} style={{ gap: 12, borderColor: current === id ? "var(--ink)" : undefined }}>
              <div className="mono muted">{p.name}</div>
              <div style={{ font: "700 34px var(--f-head)" }}>
                ฿{p.priceTHB.toLocaleString("th-TH")} <span className="mono muted">/ เดือน</span>
              </div>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                <li>ต้นทาง {p.sources} ช่อง</li>
                <li>ปลายทาง {p.destinations === Infinity ? "ไม่จำกัด" : `${p.destinations} ช่อง`}</li>
                <li>{p.clipsPerMonth === Infinity ? "คลิปไม่จำกัด" : `${p.clipsPerMonth} คลิปต่อเดือน`}</li>
                <li>{p.subtitle ? "ซับไทยอัตโนมัติ" : "ไม่รวมซับอัตโนมัติ"}</li>
              </ul>
              <BillingButtons plan={id} current={current === id} disabled={!configured} />
            </div>
          );
        })}
      </div>

      {user.stripeCustomerId && <BillingButtons portal />}
    </div>
  );
}

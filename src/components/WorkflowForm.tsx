"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Conn = { id: string; provider: string; displayName: string; externalId: string };

const RULES = [
  { key: "crop", label: "ตัดเป็นแนวตั้ง 9:16", hint: "วางคลิปกลางเฟรม พื้นหลังเบลอจากคลิปเดียวกัน" },
  { key: "subtitle", label: "ใส่ซับไทยอัตโนมัติ", hint: "ต้องตั้งค่า TRANSCRIBE_PROVIDER และอยู่ในแพ็กเกจที่รองรับ" },
  { key: "logo", label: "ติดโลโก้แบรนด์", hint: "ใช้ไฟล์ storage/assets/<user-id>-logo.png" },
  { key: "highlights", label: "ตัดไฮไลต์เป็นคลิปสั้น", hint: "แยกช่วงที่น่าสนใจจากคลิปยาว" },
] as const;

export default function WorkflowForm({ connections }: { connections: Conn[] }) {
  const router = useRouter();
  const sources = connections.filter((c) => c.provider === "youtube" || c.provider === "facebook");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [dest, setDest] = useState<string[]>(connections.filter((c) => c.id !== sources[0]?.id).slice(0, 2).map((c) => c.id));
  const [rules, setRules] = useState<Record<string, boolean>>({ crop: true, subtitle: false, logo: false, highlights: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const source = connections.find((c) => c.id === sourceId);

    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        sourceConnectionId: sourceId || undefined,
        sourceKind: source?.provider === "facebook" ? "facebook_live" : "youtube",
        sourceRef: source?.externalId,
        checkEvery: Number(fd.get("checkEvery")),
        schedule: fd.get("schedule"),
        rules: { ...rules, captionTemplate: String(fd.get("captionTemplate") || "{title}") },
        destinationIds: dest,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "สร้างเวิร์กโฟลว์ไม่สำเร็จ");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="card grid" style={{ gap: 18 }} onSubmit={submit}>
      <label className="field">
        ชื่อเวิร์กโฟลว์
        <input name="name" required defaultValue="คลิปใหม่ → ทุกช่องทาง" />
      </label>

      <label className="field">
        ต้นทาง
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
          {sources.length === 0 && <option value="">ยังไม่มีบัญชีที่ใช้เป็นต้นทางได้</option>}
          {sources.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName} ({c.provider})</option>
          ))}
        </select>
      </label>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field">
          ตรวจคลิปใหม่ทุกกี่นาที
          <input name="checkEvery" type="number" min={5} max={1440} defaultValue={5} />
        </label>
        <label className="field">
          เวลาโพสต์
          <select name="schedule" defaultValue="instant">
            <option value="instant">โพสต์ทันทีที่เรนเดอร์เสร็จ</option>
            <option value="peak">รอช่วงเวลาคนดูเยอะ (18:00)</option>
            <option value="spread">ทยอยปล่อยภายใน 2–8 ชั่วโมง</option>
          </select>
        </label>
      </div>

      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
        <legend className="mono muted">กฎการแปลง</legend>
        <div className="grid" style={{ gap: 8 }}>
          {RULES.map((r) => (
            <label key={r.key} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                style={{ width: 18, height: 18, marginTop: 3 }}
                checked={rules[r.key]}
                onChange={(e) => setRules({ ...rules, [r.key]: e.target.checked })}
              />
              <span>
                <b style={{ fontWeight: 600 }}>{r.label}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{r.hint}</div>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        แคปชัน — ใช้ {"{title}"} แทนชื่อคลิปต้นทาง
        <input name="captionTemplate" defaultValue="{title} #คลิปใหม่" />
      </label>

      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
        <legend className="mono muted">ปลายทาง ({dest.length} ช่อง)</legend>
        <div className="grid" style={{ gap: 8 }}>
          {connections.map((c) => (
            <label key={c.id} className="row" style={{ gap: 10 }}>
              <input
                type="checkbox"
                style={{ width: 18, height: 18 }}
                checked={dest.includes(c.id)}
                onChange={(e) => setDest(e.target.checked ? [...dest, c.id] : dest.filter((x) => x !== c.id))}
              />
              <span>{c.displayName} <span className="mono muted">{c.provider}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p style={{ color: "var(--err)" }}>{error}</p>}
      <button className="btn btn-main" disabled={busy || dest.length === 0}>
        {busy ? "กำลังบันทึก…" : "บันทึกและเริ่มทำงาน"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** ปุ่มหยุด/เปิด และลบเวิร์กโฟลว์ — ลูกค้าต้องหยุดการโพสต์อัตโนมัติเองได้ทุกเมื่อ */
export default function WorkflowActions({ workflowId, active, name }: { workflowId: string; active: boolean; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/workflows/${workflowId}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "ทำรายการไม่สำเร็จ");
    router.refresh();
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <button className="btn btn-line" style={{ minHeight: 36, fontSize: 13 }} disabled={busy} onClick={() => call("PATCH", { active: !active })}>
        {active ? "หยุดชั่วคราว" : "เปิดใช้งาน"}
      </button>
      <button
        className="btn btn-line"
        style={{ minHeight: 36, fontSize: 13, color: "var(--err)" }}
        disabled={busy}
        onClick={() => {
          if (confirm(`ลบเวิร์กโฟลว์ "${name}"?\nประวัติคลิปและโพสต์ของเวิร์กโฟลว์นี้จะถูกลบด้วย บัญชีที่เชื่อมไว้ยังอยู่`)) call("DELETE");
        }}
      >
        ลบ
      </button>
      {error && <span className="mono" style={{ color: "var(--err)" }}>{error}</span>}
    </span>
  );
}

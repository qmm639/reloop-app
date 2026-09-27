"use client";

import { useState } from "react";

export default function BillingButtons({
  plan,
  current,
  disabled,
  portal,
}: {
  plan?: string;
  current?: boolean;
  disabled?: boolean;
  portal?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.url) window.location.href = data.url;
    else setError(data.error ?? "เปิดหน้าชำระเงินไม่สำเร็จ");
  }

  if (portal) {
    return (
      <div className="grid" style={{ gap: 6, justifyItems: "start" }}>
        <button className="btn btn-line" disabled={busy} onClick={() => go("/api/billing/portal")}>
          จัดการการสมัครและใบเสร็จ
        </button>
        {error && <span style={{ color: "var(--err)", fontSize: 13 }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 6 }}>
      <button
        className={current ? "btn btn-line" : "btn btn-main"}
        disabled={busy || disabled || current}
        onClick={() => go("/api/billing/checkout", { plan })}
      >
        {current ? "แพ็กเกจปัจจุบัน" : busy ? "กำลังเปิด…" : "สมัครแพ็กเกจนี้"}
      </button>
      {error && <span style={{ color: "var(--err)", fontSize: 13 }}>{error}</span>}
    </div>
  );
}

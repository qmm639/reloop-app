"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunButton({ workflowId }: { workflowId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <span className="row" style={{ gap: 8 }}>
      <button
        className="btn btn-line"
        style={{ minHeight: 36, fontSize: 13 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/workflows/${workflowId}/run`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? data.message : (data.error ?? "สั่งงานไม่สำเร็จ"));
          router.refresh();
        }}
      >
        {busy ? "กำลังส่ง…" : "ตรวจเดี๋ยวนี้"}
      </button>
      {msg && <span className="mono muted">{msg}</span>}
    </span>
  );
}

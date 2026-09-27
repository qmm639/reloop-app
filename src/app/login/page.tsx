"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: mode,
        email: fd.get("email"),
        password: fd.get("password"),
        name: fd.get("name") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "ทำรายการไม่สำเร็จ");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="wrap" style={{ maxWidth: 420, paddingBlock: 72 }}>
      <h1 style={{ fontSize: 28 }}>{mode === "login" ? "เข้าสู่ระบบ" : "สมัครใช้งาน"}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        ใช้อีเมลกับรหัสผ่านอย่างน้อย 8 ตัวอักษร
      </p>

      <form onSubmit={submit} className="card grid">
        {mode === "register" && (
          <label className="field">
            ชื่อที่ใช้แสดง
            <input name="name" autoComplete="name" placeholder="ชื่อของคุณ" />
          </label>
        )}
        <label className="field">
          อีเมล
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          รหัสผ่าน
          <input name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>

        {error && <p style={{ color: "var(--err)", fontSize: 14 }}>{error}</p>}

        <button className="btn btn-main" disabled={busy}>
          {busy ? "กำลังดำเนินการ…" : mode === "login" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
        </button>
        <button
          type="button"
          className="btn btn-line"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "ยังไม่มีบัญชี? สมัครใช้งาน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}

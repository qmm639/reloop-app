"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-line"
      style={{ minHeight: 34, padding: "0 12px", marginTop: 10, fontSize: 13 }}
      onClick={async () => {
        await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "logout" }),
        });
        router.push("/login");
        router.refresh();
      }}
    >
      ออกจากระบบ
    </button>
  );
}

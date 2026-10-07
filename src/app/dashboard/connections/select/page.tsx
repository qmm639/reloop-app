import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { SelectPagesClient } from "./SelectPagesClient";

export const dynamic = "force-dynamic";

export default async function SelectPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const jar = await cookies();
  const rawCookie = jar.get("pending_meta_selection")?.value;
  if (!rawCookie) {
    redirect("/dashboard/connections");
  }

  let data: {
    provider: "facebook" | "instagram";
    pages: { id: string; name: string; instagramId?: string | null; instagramUsername?: string | null }[];
    expiresAt?: number | null;
  };

  try {
    data = JSON.parse(decrypt(rawCookie));
  } catch {
    redirect("/dashboard/connections?error=invalid_selection_data");
  }

  const { provider, pages } = data;
  const isIg = provider === "instagram";
  const items = isIg ? pages.filter((p) => p.instagramId) : pages;

  return (
    <div className="wrap" style={{ maxWidth: 680, padding: "40px 16px" }}>
      <div className="card grid" style={{ gap: 24, padding: 32 }}>
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <span
              className="chip"
              style={{
                background: isIg ? "#C1358A" : "#1B6FD6",
                width: 32,
                height: 32,
              }}
            >
              {isIg ? "IG" : "FB"}
            </span>
            <h1 style={{ fontSize: 24 }}>
              {isIg ? "เลือกบัญชี Instagram Reels ที่ต้องการเชื่อมต่อ" : "เลือกเพจ Facebook ที่ต้องการเชื่อมต่อ"}
            </h1>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            พบบัญชีทั้งหมด <b>{items.length}</b> บัญชี โปรดติ๊กเลือกเพจที่คุณต้องการใช้งานในระบบ Reloop Studio
          </p>
        </div>

        <SelectPagesClient provider={provider} items={items} />
      </div>
    </div>
  );
}

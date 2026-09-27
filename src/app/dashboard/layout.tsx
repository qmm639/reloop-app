import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { PLANS, PlanId } from "@/lib/plans";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const plan = PLANS[(user.plan as PlanId) ?? "free"];

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/dashboard" style={{ font: "800 19px var(--f-head)", color: "var(--ink)", padding: "4px 12px 14px" }}>
          Reloop
        </Link>
        <Link href="/dashboard">ภาพรวม</Link>
        <Link href="/dashboard/connections">บัญชีที่เชื่อม</Link>
        <Link href="/dashboard/workflows/new">สร้างเวิร์กโฟลว์</Link>
        <Link href="/dashboard/billing">แพ็กเกจและบิล</Link>
        <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 12, color: "var(--ink-2)" }}>
          <div>{user.email}</div>
          <div className="mono">แพ็กเกจ {plan.name}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

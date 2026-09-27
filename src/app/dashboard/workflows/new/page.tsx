import Link from "next/link";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import WorkflowForm from "@/components/WorkflowForm";

export const dynamic = "force-dynamic";

export default async function NewWorkflow() {
  const user = (await getUser())!;
  const connections = await db.connection.findMany({
    where: { userId: user.id },
    select: { id: true, provider: true, displayName: true, externalId: true },
    orderBy: { createdAt: "asc" },
  });

  if (connections.length === 0) {
    return (
      <div className="card grid" style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 22 }}>ยังเชื่อมบัญชีไม่ครบ</h1>
        <p className="muted">ต้องเชื่อมอย่างน้อย 1 บัญชีก่อน จึงจะสร้างเวิร์กโฟลว์ได้</p>
        <Link className="btn btn-main" href="/dashboard/connections">ไปเชื่อมบัญชี</Link>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 20, maxWidth: 760 }}>
      <div>
        <h1 style={{ fontSize: 26 }}>สร้างเวิร์กโฟลว์</h1>
        <p className="muted">เลือกต้นทาง ตั้งกฎการแปลง แล้วเลือกปลายทางที่จะให้โพสต์อัตโนมัติ</p>
      </div>
      <WorkflowForm connections={connections} />
    </div>
  );
}

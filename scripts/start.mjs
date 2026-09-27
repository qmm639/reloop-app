import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * จุดเริ่มต้นตอนรันบนเซิร์ฟเวอร์:
 * 1. เตรียมโฟลเดอร์เก็บไฟล์บนดิสก์ถาวร
 * 2. อัปเดตโครงตารางฐานข้อมูลให้ตรงกับ schema
 * 3. รันเว็บกับตัวประมวลผลวิดีโอพร้อมกัน ถ้าตัวใดตาย ให้ทั้งคอนเทนเนอร์ตายเพื่อให้ Render รีสตาร์ทให้
 */
const storage = process.env.STORAGE_DIR ?? "./storage";
for (const dir of ["renders", "work", "assets"]) {
  fs.mkdirSync(path.join(storage, dir), { recursive: true });
}

console.log("[start] เตรียมฐานข้อมูล…");
const db = spawnSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (db.status !== 0) {
  console.error("[start] เตรียมฐานข้อมูลไม่สำเร็จ");
  process.exit(1);
}

const children = [];
function run(name, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    console.error(`[start] ${name} หยุดทำงาน (code ${code}) — ปิดคอนเทนเนอร์เพื่อให้ระบบรีสตาร์ทให้`);
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 1);
  });
  children.push(child);
  return child;
}

const port = process.env.PORT ?? "3000";
// เรียก node ตรง ๆ ไม่ผ่าน npx ประหยัดแรมไปราว 80MB (สำคัญเมื่อรันร่วมเครื่องกับบอท)
run("web", process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port]);
// worker ถูกคอมไพล์เป็น JS ตอน build แล้ว ไม่ต้องโหลด tsx ตอนรัน (ประหยัดแรมอีกราว 40MB)
const workerArgs = fs.existsSync("dist/worker.mjs") ? ["dist/worker.mjs"] : ["--import", "tsx", "src/worker/index.ts"];
run("worker", process.execPath, workerArgs);

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    for (const c of children) c.kill(sig);
    process.exit(0);
  });
}

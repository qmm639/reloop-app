import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const base = getBaseUrl(req);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const formData = await req.formData();
  const id = formData.get("id");
  if (typeof id === "string") {
    await db.connection.deleteMany({
      where: { id, userId: user.id },
    });
  }

  return NextResponse.redirect(new URL("/dashboard/connections?disconnected=1", base));
}

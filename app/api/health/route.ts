import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Never cached: the whole point is to hit the database on every call.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    // The message can carry connection details, so it goes to the logs, not the response.
    console.error("[health] database check failed", error);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}

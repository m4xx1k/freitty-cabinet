import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// A reference list that barely ever changes, but it must not be prerendered:
// the build runs outside the private network and cannot reach the database.
// So it stays dynamic and is cached at the edge instead.
export const dynamic = "force-dynamic";

export async function GET() {
  const hubs = await prisma.hub.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      city: true,
      province: true,
      docks: { orderBy: { code: "asc" }, select: { code: true, bay: true } },
    },
  });

  return NextResponse.json(
    { hubs },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const revalidate = 300; // a reference list, it barely ever changes

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

  return NextResponse.json({ hubs });
}

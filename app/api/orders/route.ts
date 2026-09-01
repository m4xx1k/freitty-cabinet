import { NextResponse } from "next/server";
import { listOrders, listQuery } from "@/lib/services/list";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listQuery.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  return NextResponse.json(await listOrders(parsed.data));
}

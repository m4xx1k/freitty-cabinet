import { NextResponse } from "next/server";
import { toOrderDetail } from "@/lib/dto/order";
import { loadOrder, loadPriceRules } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  const [row, rules] = await Promise.all([loadOrder(number), loadPriceRules()]);
  if (!row) return NextResponse.json({ error: `Order ${number} not found` }, { status: 404 });

  return NextResponse.json(toOrderDetail(row, rules));
}

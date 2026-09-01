import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { alertsFor, needAttention } from "@/lib/domain/alerts";
import { loadAllNodes } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

/**
 * What the shell needs on every page: who is signed in, the company balance in
 * the top bar, and the count on the Orders badge — which is the Need Attention
 * number, not the order count.
 *
 * There is no auth in this build: a single tenant is seeded and the API answers
 * as its admin. Adding real sessions means a lookup here and a companyId filter
 * in the services; nothing else about the shape changes.
 */
export async function GET() {
  const [company, user, nodes] = await Promise.all([
    prisma.company.findFirst({ select: { name: true, balanceCents: true } }),
    prisma.user.findFirst({ where: { role: "ADMIN" }, select: { name: true, initials: true, role: true } }),
    loadAllNodes(),
  ]);

  const attention = needAttention(nodes.map(({ node }) => ({ node, alerts: alertsFor(node) })));

  return NextResponse.json({ user, company, needAttention: attention.total });
}

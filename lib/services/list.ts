import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { toOrderCard, type OrderCard } from "@/lib/dto/order";
import { orderInclude } from "@/lib/services/orders";

export const listQuery = z.object({
  tab: z.enum(["all", "cross-dock", "consolidation", "alerts", "drafts"]).default("all"),
  hub: z.string().optional(),
  status: z
    .enum(["DRAFT", "READY", "IN_PROGRESS", "CONSOLIDATED", "IN_TRANSIT", "DECONSOLIDATED", "CLOSED"])
    .optional(),
  period: z.enum(["today", "7d", "30d", "all"]).default("30d"),
  q: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(6),
});

export type ListQuery = z.infer<typeof listQuery>;

const DAYS: Record<Exclude<ListQuery["period"], "all">, number> = { today: 1, "7d": 7, "30d": 30 };

function since(period: ListQuery["period"], now: Date): Date | null {
  if (period === "all") return null;
  const d = new Date(now);
  d.setDate(d.getDate() - DAYS[period]);
  return d;
}

const matchesTab = (card: OrderCard, tab: ListQuery["tab"]) => {
  switch (tab) {
    case "cross-dock":
      return card.type === "CROSS_DOCK";
    case "consolidation":
      return card.type === "CONSOLIDATION";
    case "alerts":
      return card.alerts.length > 0;
    case "drafts":
      return card.status === "DRAFT";
    default:
      return true;
  }
};

/**
 * Only top-level orders are listed; sub-orders show up inside their parent.
 *
 * Tab counts and the alert filter run over the mapped cards rather than in SQL,
 * because an alert is computed, not stored. At this size (tens of orders per
 * window) that is a single query either way; a real deployment would keep a
 * materialised alert flag for the filter and recompute it on write.
 */
export async function listOrders(query: ListQuery, now: Date = new Date()) {
  const cutoff = since(query.period, now);

  const rows = await prisma.order.findMany({
    where: {
      parentId: null,
      ...(query.hub ? { hub: { name: query.hub } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(cutoff
        ? { OR: [{ scheduledAt: { gte: cutoff } }, { closedAt: { gte: cutoff } }] }
        : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: "insensitive" as const } },
              { refNumber: { contains: query.q, mode: "insensitive" as const } },
              { children: { some: { refNumber: { contains: query.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    include: orderInclude,
    orderBy: { scheduledAt: "desc" },
  });

  const cards = rows.map(toOrderCard);

  const counts = {
    all: cards.length,
    "cross-dock": cards.filter((c) => matchesTab(c, "cross-dock")).length,
    consolidation: cards.filter((c) => matchesTab(c, "consolidation")).length,
    alerts: cards.filter((c) => matchesTab(c, "alerts")).length,
    drafts: cards.filter((c) => matchesTab(c, "drafts")).length,
  };

  const filtered = cards.filter((c) => matchesTab(c, query.tab));
  const start = (query.page - 1) * query.pageSize;

  return {
    orders: filtered.slice(start, start + query.pageSize),
    counts,
    page: query.page,
    pageSize: query.pageSize,
    total: filtered.length,
  };
}

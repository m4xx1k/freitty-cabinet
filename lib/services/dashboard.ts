import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { alertsFor, needAttention } from "@/lib/domain/alerts";
import { priceOf } from "@/lib/domain/pricing";
import { ACTIVE_STATUSES } from "@/lib/domain/types";
import { toOrderCard } from "@/lib/dto/order";
import { loadPriceRules, orderInclude, toNode } from "@/lib/services/orders";

export const dashboardQuery = z.object({
  period: z.enum(["day", "week", "month", "quarter"]).default("week"),
});

export type DashboardQuery = z.infer<typeof dashboardQuery>;

// The Day / CW / Month / Quarter switch picks the bucket, not the range: the
// chart always shows the same number of buckets, just wider ones.
const BUCKETS: Record<DashboardQuery["period"], { count: number; days: number; label: string }> = {
  day: { count: 14, days: 1, label: "D" },
  week: { count: 12, days: 7, label: "W" },
  month: { count: 12, days: 30, label: "M" },
  quarter: { count: 8, days: 91, label: "Q" },
};

function buckets(period: DashboardQuery["period"], now: Date) {
  const { count, days, label } = BUCKETS[period];
  const width = days * 24 * 60 * 60 * 1000;
  const end = now.getTime();
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(end - (count - i) * width);
    return { key: `${label}${i + 1}`, from, to: new Date(end - (count - 1 - i) * width) };
  });
}

const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

export async function getDashboard(query: DashboardQuery, now: Date = new Date()) {
  const [rows, rules] = await Promise.all([
    prisma.order.findMany({ where: { parentId: null }, include: orderInclude }),
    loadPriceRules(),
  ]);

  const nodes = rows.map((row) => ({ row, node: toNode(row), alerts: alertsFor(toNode(row), now) }));

  const active = nodes.filter((n) => ACTIVE_STATUSES.includes(n.row.status));
  const closedBetween = (from: Date, to: Date) =>
    nodes.filter((n) => n.row.closedAt && n.row.closedAt >= from && n.row.closedAt < to);

  const completed30 = closedBetween(daysAgo(now, 30), now);
  const completedPrev30 = closedBetween(daysAgo(now, 60), daysAgo(now, 30));

  // Money is recomputed from the log every time; nothing is stored.
  const spendOf = (row: (typeof rows)[number]) => {
    const all = [row, ...row.children];
    const ops = all.flatMap((o) =>
      o.operations
        .filter((op) => op.billable)
        .map((op) => ({
          at: op.appliedAt,
          cents: op.qty * priceOf(rules, op.kind, op.unitType, row.hubId),
        })),
    );
    const supplies = all.flatMap((o) =>
      o.supplies.map((s) => ({
        at: row.closedAt ?? row.scheduledAt,
        cents: s.qty * s.unitPriceCents,
      })),
    );
    return [...ops, ...supplies];
  };

  const spendLines = rows.flatMap(spendOf);
  const spendIn = (from: Date, to: Date) =>
    spendLines.filter((l) => l.at >= from && l.at < to).reduce((s, l) => s + l.cents, 0);

  const series = buckets(query.period, now).map((b) => ({
    key: b.key,
    from: b.from,
    completed: closedBetween(b.from, b.to).length,
    spendCents: spendIn(b.from, b.to),
  }));

  const attention = needAttention(nodes.map((n) => ({ node: n.node, alerts: n.alerts })));
  const spend30 = spendIn(daysAgo(now, 30), now);
  const bestWeek = series.reduce((best, b) => (b.spendCents > best.spendCents ? b : best), series[0]);

  const pctChange =
    completedPrev30.length === 0
      ? null
      : Math.round(((completed30.length - completedPrev30.length) / completedPrev30.length) * 100);

  return {
    kpi: {
      active: {
        value: active.length,
        trend: active.filter((n) => n.row.createdAt >= daysAgo(now, 7)).length,
        trendLabel: "this week",
      },
      completed30: {
        value: completed30.length,
        trend: completed30.length - completedPrev30.length,
        trendLabel: "vs previous 30 days",
      },
      needAttention: attention,
    },
    series,
    insights: {
      completedChangePct: pctChange,
      spend30Cents: spend30,
      avgPerOrderCents: completed30.length ? Math.round(spend30 / completed30.length) : 0,
      bestBucket: bestWeek ? { key: bestWeek.key, spendCents: bestWeek.spendCents } : null,
    },
    recent: active
      .sort((a, b) => b.row.scheduledAt.getTime() - a.row.scheduledAt.getTime())
      .slice(0, 4)
      .map((n) => toOrderCard(n.row)),
  };
}

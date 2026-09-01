"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AreaSeries, BarSeries, type Point } from "@/components/Charts";
import { OrderCard } from "@/components/OrderCard";
import type { OrderCard as Card } from "@/lib/dto/order";
import { formatDay, formatMoney } from "@/lib/format";

interface Dashboard {
  kpi: {
    active: { value: number; trend: number; trendLabel: string };
    completed30: { value: number; trend: number; trendLabel: string };
    needAttention: {
      total: number;
      awaitingAction: number;
      activeAlerts: number;
      alerting: string[];
    };
  };
  series: { key: string; from: string; completed: number; spendCents: number }[];
  insights: {
    completedChangePct: number | null;
    spend30Cents: number;
    avgPerOrderCents: number;
    bestBucket: { key: string; spendCents: number } | null;
  };
  recent: Card[];
}

// The switch picks the bucket width, not the range — see lib/services/dashboard.
const PERIODS = [
  { key: "day", label: "Day", bucket: "day", best: "Best day" },
  { key: "week", label: "CW", bucket: "week", best: "Best week" },
  { key: "month", label: "Month", bucket: "month", best: "Best month" },
  { key: "quarter", label: "Quarter", bucket: "quarter", best: "Best quarter" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

const isPeriod = (value: string | null): value is PeriodKey =>
  PERIODS.some((p) => p.key === value);

/** ▲ up, ▼ down, ⟶ unchanged. The label comes from the API with the number. */
function Trend({ value, label, zero }: { value: number; label: string; zero: string }) {
  if (value > 0) return <div className="trend up">▲ {value} {label}</div>;
  if (value < 0) return <div className="trend down">▼ {Math.abs(value)} {label}</div>;
  return <div className="trend flat">⟶ {zero}</div>;
}

function Skeletons() {
  return (
    <>
      <div className="kpi-grid">
        {Array.from({ length: 3 }, (_, i) => (
          <div className={`skeleton kpi-tile${i === 2 ? " wide" : ""}`} key={i} />
        ))}
      </div>
      <div className="cards-grid pair">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </>
  );
}

export function DashboardView() {
  const params = useSearchParams();
  const router = useRouter();
  // The last payload that arrived and the last request that failed live in
  // separate slots. Folded into one, a failed refetch erased the dashboard and
  // took the switch that triggered it off the screen with everything else,
  // leaving no way back to the period that did work.
  const [loaded, setLoaded] = useState<{ period: PeriodKey; data: Dashboard } | null>(null);
  const [failure, setFailure] = useState<{ period: PeriodKey; message: string } | null>(null);

  const raw = params.get("period");
  const period: PeriodKey = isPeriod(raw) ? raw : "week";

  // The period lives in the URL for the same reason the order filters do: a view
  // someone is looking at is a link they can send.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Dashboard) => {
        if (cancelled) return;
        setLoaded({ period, data });
        setFailure(null);
      })
      .catch((e: Error) => !cancelled && setFailure({ period, message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Which period the state in hand belongs to *is* the loading flag — a second
  // setState in the effect body only says the same thing one render later.
  const data = loaded?.data ?? null;
  const error = failure?.period === period ? failure.message : null;
  // Figures on screen belong to the period they were fetched for, not the one
  // just clicked: labelling twelve weekly buckets "Best quarter" for the length
  // of a request is a small lie the chart does not have to tell.
  const shown = loaded?.period ?? period;
  const stale = shown !== period;

  const selectPeriod = (key: PeriodKey) => {
    router.replace(key === "week" ? "/" : `/?period=${key}`, { scroll: false });
  };

  const active = PERIODS.find((p) => p.key === shown)!;
  const attention = data?.kpi.needAttention;

  // The chip names the orders it is counting, but only the first few: the list
  // is unbounded, and twenty numbers would wrap under the tile's corner link
  // and push the whole KPI row apart. The rest are in the tooltip.
  const named = attention?.alerting.slice(0, 2).join(", ");
  const spill = (attention?.alerting.length ?? 0) - 2;

  const completedPoints: Point[] =
    data?.series.map((b) => ({
      key: b.key,
      value: b.completed,
      title: `${b.key} · from ${formatDay(b.from)} · ${b.completed} completed`,
    })) ?? [];

  const spendPoints: Point[] =
    data?.series.map((b) => ({
      key: b.key,
      value: b.spendCents,
      title: `${b.key} · from ${formatDay(b.from)} · ${formatMoney(b.spendCents)}`,
    })) ?? [];

  return (
    <div className="fc-content">
      <div className="fc-crumbs">
        Home <span>›</span> Dashboard
      </div>
      <div className="fc-page-title">
        <h1>Welcome, User 1 👋</h1>
      </div>

      {error && (
        <div className="empty">
          Could not load the dashboard ({error}). Reload the page to try again.
        </div>
      )}

      {!data && !error && <Skeletons />}

      {data && attention && (
        <>
          <div className="kpi-grid" style={{ opacity: stale ? 0.6 : 1 }}>
            <div className="kpi kpi-accent-blue">
              <div className="label">Active Orders</div>
              <div className="value">{data.kpi.active.value}</div>
              <Trend
                value={data.kpi.active.trend}
                label={data.kpi.active.trendLabel}
                zero="no new orders this week"
              />
            </div>

            <div className="kpi kpi-accent-green">
              <div className="label">Completed (30 d)</div>
              <div className="value">{data.kpi.completed30.value}</div>
              <Trend
                value={data.kpi.completed30.trend}
                label={data.kpi.completed30.trendLabel}
                zero="same as previous 30 days"
              />
            </div>

            {/* Awaiting action and alerts merged into one tile, as in the mockup.
                Each order lands in exactly one of the two buckets, so the total
                is a count of orders and not a count of reasons.

                The link carries the tab that shares this tile's predicate, and
                period=all because the tile counts over every order while the
                list would otherwise default to the last 30 days — a tile that
                promises three and opens a list of two is worse than no link. */}
            <Link
              href="/orders?tab=attention&period=all"
              className="kpi kpi-attention"
              title="Orders where the next move is yours"
            >
              <div className="label">⚠ Need Attention</div>
              <div className="attention-body">
                <div>
                  <div className="value">{attention.total}</div>
                  <div className="total-lbl">Total</div>
                </div>
                <div className="chips">
                  <span className="chip-awaiting">
                    {attention.awaitingAction} · awaiting your action
                  </span>
                  <span className="chip-alerting" title={attention.alerting.join(", ")}>
                    {attention.activeAlerts} ·{" "}
                    {attention.activeAlerts === 1 ? "alert" : "alerts"}
                    {named && ` (${named}${spill > 0 ? ` +${spill} more` : ""})`}
                  </span>
                </div>
              </div>
              <span className="open-list">Open list →</span>
            </Link>
          </div>

          <div className="section-head">
            <h2>Active Orders</h2>
            <Link href="/orders">View all →</Link>
          </div>

          {data.recent.length === 0 ? (
            <div className="empty">Nothing in progress right now.</div>
          ) : (
            <div className="cards-grid pair" style={{ opacity: stale ? 0.6 : 1 }}>
              {data.recent.map((card) => (
                <OrderCard card={card} key={card.number} />
              ))}
            </div>
          )}

          <section className="panel" style={{ opacity: stale ? 0.6 : 1 }}>
            <div className="panel-head">
              <h2>📊 Your activity</h2>
              <div className="seg" role="group" aria-label="Chart bucket">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    className={p.key === period ? "active" : undefined}
                    aria-pressed={p.key === period}
                    onClick={() => selectPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="charts">
              <div>
                <div className="chart-head">
                  <span className="k">Completed orders</span>
                  <span className="v ok">
                    {data.kpi.completed30.value} <small>last 30d</small>
                  </span>
                </div>
                <BarSeries
                  points={completedPoints}
                  label={`Completed orders per ${active.bucket}`}
                />
              </div>

              <div>
                <div className="chart-head">
                  <span className="k">Spend</span>
                  <span className="v brand">
                    {formatMoney(data.insights.spend30Cents)} <small>last 30d</small>
                  </span>
                </div>
                <AreaSeries points={spendPoints} label={`Spend per ${active.bucket}`} />
              </div>
            </div>

            <div className="insight-strip">
              <span>
                📈{" "}
                {data.insights.completedChangePct === null ? (
                  <strong>no comparable history yet</strong>
                ) : (
                  <>
                    <strong className={data.insights.completedChangePct >= 0 ? "ok" : "bad"}>
                      {data.insights.completedChangePct > 0 ? "+" : ""}
                      {data.insights.completedChangePct}%
                    </strong>{" "}
                    completed orders vs previous 30 days
                  </>
                )}
              </span>
              <span>
                💰 <strong className="brand">{formatMoney(data.insights.spend30Cents)}</strong>{" "}
                spent · avg {formatMoney(data.insights.avgPerOrderCents)}/order
              </span>
              {data.insights.bestBucket && (
                <span>
                  ⭐ {active.best}: {data.insights.bestBucket.key} (peak spend{" "}
                  {formatMoney(data.insights.bestBucket.spendCents)})
                </span>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OrderCard } from "@/components/OrderCard";
import type { OrderCard as Card } from "@/lib/dto/order";

interface ListResponse {
  orders: Card[];
  counts: Record<string, number>;
  page: number;
  pageSize: number;
  total: number;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "cross-dock", label: "Cross-Dock" },
  { key: "consolidation", label: "Consolidation" },
  { key: "alerts", label: "Alerts" },
  { key: "drafts", label: "Drafts" },
] as const;

const STATUSES = ["READY", "IN_PROGRESS", "CONSOLIDATED", "IN_TRANSIT", "CLOSED", "DRAFT"];

export function OrdersView() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hubs, setHubs] = useState<{ name: string }[]>([]);

  const query = params.toString();

  // Filters live in the URL, so every view is a link someone can send.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: ListResponse) => {
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    fetch("/api/hubs")
      .then((r) => r.json())
      .then((json) => setHubs(json.hubs ?? []))
      .catch(() => undefined);
  }, []);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in patch)) next.delete("page");
    router.replace(`/orders${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  const tab = params.get("tab") ?? "all";
  const page = Number(params.get("page") ?? 1);
  const pageSize = data?.pageSize ?? 6;
  const shownTo = Math.min(page * pageSize, data?.total ?? 0);

  return (
    <div className="fc-content">
      <div className="fc-crumbs">
        Home <span>›</span> Orders
      </div>
      <div className="fc-page-title">
        <h1>All Orders</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary">📥 Export CSV</button>
          <button className="btn btn-primary">+ New Order</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => update({ tab: t.key === "all" ? undefined : t.key })}
          >
            {t.label}
            <span className={`count${t.key === "alerts" ? " alert" : ""}`}>
              {data?.counts[t.key] ?? "·"}
            </span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select value={params.get("hub") ?? ""} onChange={(e) => update({ hub: e.target.value || undefined })}>
          <option value="">Hub: All</option>
          {hubs.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name}
            </option>
          ))}
        </select>
        <select
          value={params.get("period") ?? "30d"}
          onChange={(e) => update({ period: e.target.value === "30d" ? undefined : e.target.value })}
        >
          <option value="30d">Date: Last 30 days</option>
          <option value="7d">This week</option>
          <option value="today">Today</option>
          <option value="all">All time</option>
        </select>
        <select
          value={params.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value || undefined })}
        >
          <option value="">Status: Any</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
        {params.get("q") && (
          <button className="btn btn-secondary" onClick={() => update({ q: undefined })}>
            ✕ “{params.get("q")}”
          </button>
        )}
      </div>

      {error && <div className="empty">Could not load orders ({error}). Reload the page to try again.</div>}

      {loading && !data && (
        <div className="cards-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton" key={i} />
          ))}
        </div>
      )}

      {data && data.orders.length === 0 && !loading && (
        <div className="empty">No orders match these filters. Try a wider date range.</div>
      )}

      {data && data.orders.length > 0 && (
        <div className="cards-grid" style={{ opacity: loading ? 0.6 : 1 }}>
          {data.orders.map((card) => (
            <OrderCard card={card} key={card.number} />
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="pager">
          <div>
            Showing {shownTo} of {data.total}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) })}
            >
              ← Prev
            </button>
            <button
              className="btn btn-secondary"
              disabled={shownTo >= data.total}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

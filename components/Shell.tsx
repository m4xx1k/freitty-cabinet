"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

interface Session {
  user: { name: string; initials: string; role: string } | null;
  company: { name: string; balanceCents: number } | null;
  needAttention: number;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((r) => r.json())
      .then((data: Session) => !cancelled && setSession(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = search.trim();
    router.push(q ? `/orders?q=${encodeURIComponent(q)}&period=all` : "/orders");
  };

  return (
    <div className="fc-shell">
      <aside className="fc-sidebar">
        <div className="fc-logo">
          FREITT<span>Y</span>
        </div>
        <ul className="fc-nav">
          <li className={pathname === "/" ? "active" : undefined}>
            <Link href="/" style={{ display: "flex", width: "100%", gap: 10 }}>
              📊 Dashboard
            </Link>
          </li>
          <li className={pathname.startsWith("/orders") ? "active" : undefined}>
            <Link href="/orders" style={{ display: "flex", width: "100%", gap: 10, alignItems: "center" }}>
              📦 Orders
              {session && session.needAttention > 0 && (
                <span className="badge" title="Orders that need your attention">
                  {session.needAttention}
                </span>
              )}
            </Link>
          </li>
          <li>⚙️ Settings</li>
        </ul>
        <div className="fc-sidebar-foot">
          <button className="btn btn-primary block">
            + New Order
          </button>
        </div>
      </aside>

      <main className="fc-main">
        <div className="fc-topbar">
          <form onSubmit={onSearch} style={{ flex: 1, maxWidth: 420, display: "flex" }}>
            <input
              className="fc-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍  Search orders by number or Ref N…"
              aria-label="Search orders"
            />
          </form>
          <div className="spacer" />
          {session?.company && (
            <div className="fc-balance" title={`${session.company.name} balance`}>
              💳 {formatMoney(session.company.balanceCents)} <small>Top up →</small>
            </div>
          )}
          <button className="fc-topbar-btn" aria-label="Notifications">
            🔔<span className="dot" />
          </button>
          <div className="fc-user">
            <div className="avatar">{session?.user?.initials ?? "··"}</div>
            <div className="name">{session?.user?.name ?? "…"}</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

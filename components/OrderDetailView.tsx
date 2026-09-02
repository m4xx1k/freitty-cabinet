"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrderDetail } from "@/lib/dto/order";
import {
  avatarColor,
  CARGO_STATE_LABEL,
  formatDayTime,
  formatMoney,
  OPERATION_LABEL,
  SERVICE_LABEL,
  SKU_CATEGORY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  UNIT_FULL,
} from "@/lib/format";

// The API hands back Dates as ISO strings; every formatter here takes both.
type Detail = OrderDetail;

/**
 * The workflow, with the steps that cannot happen to this order left out. A
 * cross-dock never gets consolidated, so showing it those two steps would
 * promise a stage that will never arrive.
 */
const FLOW: Record<string, string[]> = {
  CROSS_DOCK: ["DRAFT", "READY", "IN_PROGRESS", "CLOSED"],
  CONSOLIDATION: [
    "DRAFT",
    "READY",
    "IN_PROGRESS",
    "CONSOLIDATED",
    "IN_TRANSIT",
    "DECONSOLIDATED",
    "CLOSED",
  ],
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </>
  );
}

/** The dock the trailer is standing at, and the two either side of it. */
function DockCard({ detail }: { detail: Detail }) {
  if (!detail.dock) return null;
  const gate = Number(detail.dock.code.replace(/\D/g, "")) || 0;

  return (
    <div className="panel dock-card">
      <div className="cap">Your assigned dock</div>
      <div className="dock-yard">
        <div className="wall">{detail.hub.name.toUpperCase()} HUB</div>
        <div className="gates">
          <span className="gate">{gate - 1}</span>
          <span className="gate here">{detail.dock.code.toUpperCase()}</span>
          <span className="gate">{gate + 1}</span>
        </div>
        {detail.trailerNo && <div className="trailer">🚚 {detail.trailerNo}</div>}
      </div>
      <div className="dock-foot">
        <strong>
          {detail.dock.code} · Bay {detail.dock.bay}
        </strong>
        {detail.dock.assignedAt && <div>Assigned {formatDayTime(detail.dock.assignedAt)}</div>}
        <div className="ok">● {CARGO_STATE_LABEL[detail.cargoState]} · {detail.nextAction.label}</div>
      </div>
    </div>
  );
}

/**
 * The whole argument of the project in one strip: nothing above it is stored.
 * Actual is what came off the truck, shippable is what leaves after damage, and
 * the delta is measured against the document — not against what shipped.
 */
function Reconciliation({ detail }: { detail: Detail }) {
  const sum = (kind: string) =>
    detail.operations.filter((o) => o.kind === kind).reduce((total, o) => total + o.qty, 0);

  const unloaded = sum("UNLOADING");
  const disposed = sum("DISPOSAL");
  const { declared, delta } = detail.quantities;

  return (
    <div className="reconcile">
      <span>
        Σ Unloading <strong>{unloaded}</strong> = actual
      </span>
      <span>
        − Disposal <strong>{disposed}</strong> = shippable <strong>{detail.shippable}</strong>
      </span>
      <span>
        BOL declared <strong>{declared}</strong>
        {delta !== 0 && (
          <>
            {" → "}
            <strong className="delta">
              Δ {delta > 0 ? "+" : ""}
              {delta}
            </strong>
          </>
        )}
      </span>
    </div>
  );
}

export function OrderDetailView({ number }: { number: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders/${encodeURIComponent(number)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Object.assign(new Error(body.error ?? `HTTP ${r.status}`), { status: r.status });
        return body as Detail;
      })
      .then((body) => !cancelled && setDetail(body))
      .catch((e: Error & { status?: number }) =>
        !cancelled && setFailure({ status: e.status ?? 0, message: e.message }),
      );
    return () => {
      cancelled = true;
    };
  }, [number]);

  if (failure) {
    return (
      <div className="fc-content">
        <div className="fc-crumbs">
          <Link href="/orders">Orders</Link> <span>›</span> {number}
        </div>
        <div className="empty">
          {failure.status === 404 ? (
            <>
              No order numbered <strong>{number}</strong>.{" "}
              <Link href={`/orders?q=${encodeURIComponent(number)}&period=all`} className="lnk">
                Search for it →
              </Link>
            </>
          ) : (
            <>Could not load this order ({failure.message}).</>
          )}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fc-content">
        <div className="fc-crumbs">
          <Link href="/orders">Orders</Link> <span>›</span> {number}
        </div>
        <div className="skeleton" style={{ height: 120, marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  const isConsolidation = detail.type === "CONSOLIDATION";
  const flow = FLOW[detail.type] ?? FLOW.CROSS_DOCK;
  const suppliesTotal = detail.supplies.reduce((s, l) => s + l.lineTotalCents, 0);

  return (
    <div className="fc-content">
      <div className="fc-crumbs">
        <Link href="/orders">Orders</Link> <span>›</span> {detail.number}
      </div>

      <div className="od-brand">
        <div className="mark">F</div>
        <h1>{isConsolidation ? "Consolidation" : "Cross-Dock"} management</h1>
      </div>

      <div className="od-head">
        <Link href="/orders" className="btn btn-secondary" aria-label="Back to orders">
          ←
        </Link>
        <span className="lbl">Order#:</span>
        <strong className="num">{detail.number}</strong>

        <span className={`badge ${isConsolidation ? "badge-consol" : "badge-simple"}`}>
          {isConsolidation ? "Consolidation" : "Cross-Dock"}
        </span>
        {/* Two axes, side by side on purpose: where the freight physically is,
            and where the order is in the workflow. Collapsing them into one
            enum gives either twenty statuses or a lost fact. */}
        <span className="badge badge-new" title="Where the freight physically is">
          ● {CARGO_STATE_LABEL[detail.cargoState]}
        </span>
        <span className={`badge ${STATUS_BADGE[detail.status]}`} title="Where the order is in the workflow">
          {STATUS_LABEL[detail.status]}
        </span>

        {detail.refNumber && (
          <span className="ref-n-inline">
            <span className="lbl">Ref N:</span>
            <span className="val">{detail.refNumber}</span>
          </span>
        )}

        <span className="od-by">
          <span className="lbl">by</span>
          <span className="ava" style={{ background: avatarColor(detail.createdBy.initials) }}>
            {detail.createdBy.initials}
          </span>
          {detail.createdBy.name}
        </span>

        {detail.alerts.map((a) => (
          <span className="badge badge-warn" key={a.code + a.source} title={a.message}>
            ⚠ {a.code === "QTY_DELTA" ? "Actual ≠ Expected" : a.message}
          </span>
        ))}
      </div>

      <div className="od-meta">
        <div className="pairs">
          <Row k="Customer">{detail.customer}</Row>
          <Row k="Hub">
            {detail.hub.name} ({detail.hub.province})
          </Row>
          <Row k="Services">
            {detail.services.length === 0
              ? "—"
              : detail.services.map((s) => (
                  <span className="badge badge-prog" key={s}>
                    {SERVICE_LABEL[s] ?? s}
                  </span>
                ))}
          </Row>
          <Row k="Date">{formatDayTime(detail.scheduledAt)}</Row>
          <Row k="Declared q-ty">
            <strong>{detail.quantities.declared}</strong> <small>from the BOL</small>
          </Row>
          <Row k="Actual q-ty">
            <strong>{detail.quantities.actual}</strong>{" "}
            {detail.quantities.delta !== 0 && (
              <span className="badge badge-delta">
                Δ {detail.quantities.delta > 0 ? "+" : ""}
                {detail.quantities.delta}
              </span>
            )}
          </Row>
          <Row k="Shippable">
            <strong>{detail.shippable}</strong> <small>after disposal</small>
          </Row>
        </div>

        <div className="pairs">
          <Row k="Carrier">{detail.carrier.label}</Row>
          <Row k="Phone">{detail.carrier.phone ?? "—"}</Row>
          <Row k="Truck / trailer">
            {detail.truckNo ?? "—"} / {detail.trailerNo ?? "—"}
            {detail.trailerType && <span className="badge badge-done">{detail.trailerType}</span>}
          </Row>
          <Row k="Dock">
            {detail.dock ? (
              <strong className="hot">
                {detail.dock.code} · Bay {detail.dock.bay}
              </strong>
            ) : (
              "not assigned"
            )}
          </Row>
          <Row k="Assigned to">
            {detail.assignedTo ? `${detail.assignedTo.name} (floor lead)` : "—"}
          </Row>
          <Row k="Status flow">
            <span className="flow">
              {flow.map((s, i) => (
                <span key={s}>
                  {i > 0 && " → "}
                  <span className={s === detail.status ? "now" : undefined}>{STATUS_LABEL[s]}</span>
                </span>
              ))}
            </span>
          </Row>
          <Row k="Next">
            <span className={detail.nextAction.urgent ? "hot" : undefined}>
              {detail.nextAction.label}
            </span>
          </Row>
        </div>
      </div>

      <div className={`od-row${detail.dock ? "" : " no-dock"}`}>
        <DockCard detail={detail} />

        <div className="od-counts">
          <div className="count-card">
            <div className="cap">Expected (BOL)</div>
            <div className="big">{detail.quantities.declared}</div>
            <div className="sub">declared on the document</div>
          </div>
          <div className={`count-card${detail.quantities.delta !== 0 ? " off" : ""}`}>
            <div className="cap">Actual (warehouse)</div>
            <div className="big">
              {detail.quantities.actual}
              {detail.quantities.delta !== 0 && (
                <span className="badge badge-delta">
                  {detail.quantities.delta > 0 ? "+" : ""}
                  {detail.quantities.delta}
                </span>
              )}
            </div>
            <div className="sub">counted off the truck</div>
          </div>
          <div className="count-card">
            <div className="cap">Warehouse note</div>
            <div className="note">{detail.warehouseNote ?? "—"}</div>
          </div>
        </div>
      </div>

      {isConsolidation && detail.refs.length > 0 && (
        <div className="panel table-panel">
          <div className="panel-bar">
            <strong>Sub-orders</strong>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>Sub-order</th>
                <th>Ref N</th>
                <th className="num">Declared</th>
                <th className="num">Actual</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {detail.refs.map((ref) => (
                <tr key={ref.number}>
                  <td className="mono">{ref.number}</td>
                  <td className="mono ref">{ref.refNumber ?? "—"}</td>
                  <td className="num">{ref.declaredQty}</td>
                  <td className="num">{ref.actualQty}</td>
                  <td>{ref.hasAlert && <span className="badge badge-alert">Alert</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Sum over the legs</td>
                <td className="num">{detail.quantities.declared}</td>
                <td className="num">{detail.quantities.actual}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="panel table-panel">
        <div className="panel-bar">
          <strong>Operations</strong>
        </div>
        {detail.operations.length === 0 ? (
          <div className="empty flat">Nothing has happened to this order yet.</div>
        ) : (
          <>
            <table className="grid">
              <thead>
                <tr>
                  {isConsolidation && <th>Leg</th>}
                  <th>Operation</th>
                  <th>Trailer</th>
                  <th className="num">Q-ty</th>
                  <th>Unit</th>
                  <th>Applied at</th>
                  <th>Docs</th>
                </tr>
              </thead>
              <tbody>
                {detail.operations.map((op, i) => (
                  <tr key={`${op.orderNumber}-${i}`} className={op.kind === "DISPOSAL" ? "bad" : undefined}>
                    {isConsolidation && <td className="mono">{op.orderNumber}</td>}
                    <td>
                      {op.billable && <span className="dollar" title="Billable">$</span>}
                      {op.kind === "DISPOSAL" ? (
                        <span className="badge badge-alert">Disposal</span>
                      ) : (
                        OPERATION_LABEL[op.kind] ?? op.kind
                      )}
                    </td>
                    <td>{op.trailerNo ?? "—"}</td>
                    <td className="num strong">{op.qty}</td>
                    <td>{UNIT_FULL[op.unitType] ?? op.unitType}</td>
                    <td className="soft">{formatDayTime(op.appliedAt)}</td>
                    <td className="soft docs">
                      <span>
                        💬 {op.commentCount} · 📷 {op.photoCount}
                      </span>
                      {op.requiresPhoto && op.photoCount === 0 && (
                        <span className="badge badge-alert" title="This operation must be documented">
                          missing photo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Reconciliation detail={detail} />
          </>
        )}
      </div>

      <div className="panel table-panel">
        <div className="panel-bar">
          <strong>Supplies</strong>
        </div>
        {detail.supplies.length === 0 ? (
          <div className="empty flat">No consumables on this order.</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Category</th>
                <th className="num">Q-ty</th>
                <th className="num">Unit $</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.supplies.map((line) => (
                <tr key={line.sku}>
                  <td>{line.sku}</td>
                  <td>
                    <span className="badge badge-done">
                      {SKU_CATEGORY_LABEL[line.category] ?? line.category}
                    </span>
                  </td>
                  <td className="num strong">{line.qty}</td>
                  <td className="num">{formatMoney(line.unitPriceCents)}</td>
                  <td className="num strong">{formatMoney(line.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Supply subtotal</td>
                <td className="num">{formatMoney(suppliesTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Platform price only. The partner side has no field on this response and
          no query behind it selects the column — it is absent by construction,
          not filtered out at the end. */}
      <div className="od-totals">
        <div>
          <span className="k">Operations</span>
          <span className="v">{formatMoney(detail.totals.operationsCents)}</span>
        </div>
        <div>
          <span className="k">Supplies</span>
          <span className="v">{formatMoney(detail.totals.suppliesCents)}</span>
        </div>
        <div className="grand">
          <span className="k">Order total</span>
          <span className="v">{formatMoney(detail.totals.grandCents)}</span>
        </div>
        <div className="note">Platform price</div>
      </div>

      {detail.documents.length > 0 && (
        <div className="od-docs">
          {detail.documents.map((doc) => (
            <span className="doc" key={doc.url}>
              📄 {doc.kind}
            </span>
          ))}
          <Link href={`/api/orders/${detail.number}`} className="lnk">
            Open this order as JSON →
          </Link>
        </div>
      )}
    </div>
  );
}

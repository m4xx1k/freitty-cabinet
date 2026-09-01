import Link from "next/link";
import type { OrderCard as Card } from "@/lib/dto/order";
import {
  avatarColor,
  formatDayTime,
  formatUnits,
  SERVICE_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/lib/format";

/** Ref N in its two shapes: inline for one, a disclosure for a consolidation. */
function RefNumber({ card }: { card: Card }) {
  if (card.refs.length === 0) {
    return card.refNumber ? (
      <span className="ref-n-inline">
        <span className="lbl">Ref N:</span>
        <span className="val">{card.refNumber}</span>
      </span>
    ) : null;
  }

  return (
    <details className="ref-n-multi">
      <summary>
        <span className="lbl">Ref N</span>
        <span className="count">{card.refs.length} refs</span>
      </summary>
      <div className="ref-list">
        {card.refs.map((ref) => (
          <div className="ref-item" key={ref.number}>
            <span className="sub-id">{ref.number}</span>
            <span className="sub-ref">{ref.refNumber}</span>
            <span className="sub-desc">
              {ref.declaredQty} pallets
              {ref.hasAlert && <em> · ⚠ missing photo</em>}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function Quantity({ card }: { card: Card }) {
  if (card.quantities.declared === 0 && card.quantities.actual === 0) return <>—</>;
  // Once the floor has counted something different, both numbers matter.
  if (card.quantities.delta !== 0) {
    return (
      <>
        {card.quantities.declared} decl · <span className="delta">{card.quantities.actual} actual</span>
      </>
    );
  }
  return <>{formatUnits(card.quantities.byUnit)}</>;
}

export function OrderCard({ card }: { card: Card }) {
  const isDraft = card.status === "DRAFT";
  const hasAlert = card.alerts.length > 0;

  const className = ["order-card", hasAlert && "has-alert", isDraft && "is-draft"]
    .filter(Boolean)
    .join(" ");

  const subtitle =
    card.type === "CONSOLIDATION"
      ? `Consolidation · ${card.subOrderCount ? `${card.subOrderCount} sub-orders` : "incomplete"}`
      : ["Cross-Dock", ...card.services.map((s) => SERVICE_LABEL[s] ?? s)].join(" · ");

  return (
    <article className={className}>
      <div className="oc-head">
        <div>
          <div className="oc-id-row">
            <Link href={`/orders/${card.number}`} className="oc-num">
              {card.number}
            </Link>
            <RefNumber card={card} />
          </div>
          <div className="oc-type">{subtitle}</div>
          {!isDraft && (
            <div className="oc-by">
              <span className="lbl">by</span>
              <span className="chip">
                <span className="ava" style={{ background: avatarColor(card.createdBy.initials) }}>
                  {card.createdBy.initials}
                </span>
                {card.createdBy.name}
              </span>
              <span className={`role${card.createdBy.role === "DISPATCHER" ? " disp" : ""}`}>
                {card.createdBy.role === "DISPATCHER" ? "Dispatcher" : "Admin"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isDraft ? (
            <span className="badge badge-draft">Draft</span>
          ) : (
            <>
              <span className={`badge ${card.type === "CONSOLIDATION" ? "badge-consol" : "badge-simple"}`}>
                {card.type === "CONSOLIDATION" ? "Consolidation" : "Cross-Dock"}
              </span>
              {hasAlert ? (
                <span className="badge badge-alert" title={card.alerts.map((a) => a.message).join("\n")}>
                  Alert
                </span>
              ) : (
                <span className={`badge ${STATUS_BADGE[card.status]}`}>{STATUS_LABEL[card.status]}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="oc-body">
        <div>
          <div className="k">Hub</div>
          <div className="v">{card.hub.name}</div>
        </div>
        <div>
          <div className="k">Date</div>
          <div className="v">{formatDayTime(card.scheduledAt)}</div>
        </div>
        <div>
          <div className="k">Q-ty</div>
          <div className="v">
            <Quantity card={card} />
          </div>
        </div>
        <div>
          <div className="k">Carrier</div>
          <div className="v">{card.carrier.label}</div>
        </div>
        {card.destination && (
          <div className={card.trailerCount > 1 ? undefined : "wide"}>
            <div className="k">Destination</div>
            <div className="v">
              {card.destination.city}, {card.destination.province}
              {card.destination.note && ` · ${card.destination.note}`}
            </div>
          </div>
        )}
        {card.trailerCount > 1 && (
          <div>
            <div className="k">Trailers</div>
            <div className="v">
              <span className="chip-trailers">{card.trailerCount} consolidated</span>
            </div>
          </div>
        )}
      </div>

      <div className="oc-footer">
        <div className={card.nextAction.urgent ? "urgent" : undefined}>
          {card.nextAction.urgent ? "⚠ " : "Next: "}
          {card.nextAction.label}
        </div>
        <div className="oc-icons">
          <span title="Comments">💬</span>
          <span title="Photos">📷</span>
          <span title="Documents">📄</span>
          <span title="Print">🖨</span>
          <span title="History">⏱</span>
        </div>
      </div>
    </article>
  );
}

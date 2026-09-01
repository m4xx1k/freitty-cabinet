import { quantities } from "./quantities";
import { type OrderNode, type OrderStatus, walk } from "./types";

// An alert is not a status. It sits alongside one, an order can carry several
// at once, and it is computed on read — never written to a column.

export type AlertCode = "QTY_DELTA" | "MISSING_PHOTO" | "OVERDUE";

export interface Alert {
  code: AlertCode;
  severity: "warning" | "critical";
  message: string;
  /** Which order raised it — a sub-order name shows up on the parent's card. */
  source: string;
  /** True when the client is the one who has to do something about it. */
  clientActionable: boolean;
}

export function alertsFor(node: OrderNode, now: Date = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const qty = quantities(node);

  if (qty.delta !== 0) {
    const sign = qty.delta > 0 ? "+" : "";
    alerts.push({
      code: "QTY_DELTA",
      severity: "warning",
      message: `${qty.declared} declared · ${qty.actual} actual (Δ ${sign}${qty.delta})`,
      source: node.number,
      clientActionable: false,
    });
  }

  for (const n of walk(node)) {
    const undocumented = n.operations.filter((op) => op.requiresPhoto && op.photoCount === 0);
    if (undocumented.length > 0) {
      alerts.push({
        code: "MISSING_PHOTO",
        severity: "critical",
        message: `photo missing · ${n.number}`,
        source: n.number,
        clientActionable: true,
      });
    }
  }

  // The truck was expected and never arrived: submitted, past its slot, and not
  // a single operation logged against it.
  const nothingHappened = walk(node).every((n) => n.operations.length === 0);
  if (node.status === "READY" && node.scheduledAt < now && nothingHappened) {
    alerts.push({
      code: "OVERDUE",
      severity: "critical",
      message: `scheduled ${node.scheduledAt.toISOString().slice(0, 10)}, nothing received`,
      source: node.number,
      clientActionable: false,
    });
  }

  return alerts;
}

/**
 * Is the next move the client's?
 *
 * A draft is not submitted yet, an unexplained delta needs confirming, a truck
 * that never turned up needs rebooking, and a missing photo needs uploading.
 * Leaving OVERDUE out would hide the most urgent alert there is from the very
 * tile that exists to surface it.
 *
 * One predicate, exported, because the dashboard tile and the list tab behind
 * its link count the same orders — two copies of this rule would eventually
 * disagree and the link would promise a number the list does not show.
 */
export function needsClientAttention(order: { status: OrderStatus; alerts: Alert[] }): boolean {
  return (
    order.status === "DRAFT" ||
    order.alerts.some(
      (a) => a.clientActionable || a.code === "QTY_DELTA" || a.code === "OVERDUE",
    )
  );
}

/**
 * The Need Attention tile. An order lands in exactly one bucket, otherwise the
 * one order with both a delta and a missing photo would be counted twice.
 */
export function needAttention(orders: { node: OrderNode; alerts: Alert[] }[]) {
  let awaitingAction = 0;
  let activeAlerts = 0;
  const alerting: string[] = [];

  for (const { node, alerts } of orders) {
    if (!needsClientAttention({ status: node.status, alerts })) continue;

    if (alerts.some((a) => a.clientActionable)) {
      activeAlerts++;
      alerting.push(node.number);
    } else {
      awaitingAction++;
    }
  }

  return { total: awaitingAction + activeAlerts, awaitingAction, activeAlerts, alerting };
}

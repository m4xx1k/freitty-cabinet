import { alertsFor, type Alert } from "@/lib/domain/alerts";
import { nextAction } from "@/lib/domain/nextAction";
import { orderTotals } from "@/lib/domain/pricing";
import { quantities, type Quantities, refNumbers, trailerCount } from "@/lib/domain/quantities";
import type { OrderNode, PriceRuleInput } from "@/lib/domain/types";
import { toNode, type ChildRow, type OrderRow } from "@/lib/services/orders";

// The only place a database row turns into a response body.
//
// partnerCents has no field here and is not selected by any query behind it,
// so the partner price cannot reach a client by accident — it is absent by
// construction, not filtered out at the end.

function carrierOf(row: OrderRow) {
  if (row.carrierType === "SELF_PICKUP") return { type: row.carrierType, label: "Self pickup" };
  if (row.carrierType === "OWN_DRIVER") {
    return { type: row.carrierType, label: `Driver: ${row.driver?.name ?? "—"}` };
  }
  return { type: row.carrierType, label: row.carrierName ?? "—", phone: row.carrierPhone };
}

/**
 * The card body, given work the caller has already done. The detail response is
 * a card plus more, and both need the node, its alerts and its quantities — so
 * they are computed once and passed down rather than derived twice from the
 * same row.
 */
function cardFrom(row: OrderRow, node: OrderNode, alerts: Alert[], qty: Quantities) {
  return {
    number: row.number,
    type: row.type,
    status: row.status,
    cargoState: row.cargoState,
    services: row.services,
    refNumber: row.refNumber,
    refs: row.children.map((c: ChildRow) => ({
      number: c.number,
      refNumber: c.refNumber,
      declaredQty: c.cargoLines.reduce((s, l) => s + l.declaredQty, 0),
      // Through the same function the parent's own total goes through, so a leg
      // of a consolidation cannot be counted one way in the list and another on
      // the page it links to.
      actualQty: quantities(toNode(c)).actual,
      hasAlert: alerts.some((a) => a.source === c.number),
    })),
    refCount: refNumbers(node).length,
    subOrderCount: row.children.length,
    hub: { name: row.hub.name, province: row.hub.province },
    scheduledAt: row.scheduledAt,
    closedAt: row.closedAt,
    quantities: {
      declared: qty.declared,
      actual: qty.actual,
      delta: qty.delta,
      byUnit: qty.declaredByUnit,
    },
    carrier: carrierOf(row),
    destination: row.destCity
      ? { city: row.destCity, province: row.destProvince, note: row.destNote }
      : null,
    createdBy: { name: row.createdBy.name, initials: row.createdBy.initials, role: row.createdBy.role },
    trailerCount: trailerCount(node),
    alerts,
    nextAction: nextAction(node, alerts),
  };
}

export function toOrderCard(row: OrderRow) {
  const node = toNode(row);
  return cardFrom(row, node, alertsFor(node), quantities(node));
}

export function toOrderDetail(row: OrderRow, rules: PriceRuleInput[]) {
  const node = toNode(row);
  const qty = quantities(node);
  const totals = orderTotals(node, rules);

  return {
    ...cardFrom(row, node, alertsFor(node), qty),
    customer: row.company.name,
    dock: row.dock ? { code: row.dock.code, bay: row.dock.bay, assignedAt: row.dockAssignedAt } : null,
    truckNo: row.truckNo,
    trailerNo: row.trailerNo,
    trailerType: row.trailerType,
    assignedTo: row.assignedTo
      ? { name: row.assignedTo.name, initials: row.assignedTo.initials, role: row.assignedTo.role }
      : null,
    warehouseNote: row.warehouseNote,
    shippable: qty.shippable,
    operations: [row, ...row.children].flatMap((o) =>
      o.operations.map((op) => ({
        orderNumber: o.number,
        kind: op.kind,
        trailerNo: op.trailerNo,
        qty: op.qty,
        unitType: op.unitType,
        appliedAt: op.appliedAt,
        billable: op.billable,
        photoCount: op.attachments.filter((a) => a.kind === "PHOTO").length,
        commentCount: op._count.comments,
        requiresPhoto: op.requiresPhoto,
      })),
    ),
    supplies: [row, ...row.children].flatMap((o) =>
      o.supplies.map((s) => ({
        sku: s.sku.code,
        category: s.sku.category,
        qty: s.qty,
        unitPriceCents: s.unitPriceCents,
        lineTotalCents: s.qty * s.unitPriceCents,
      })),
    ),
    documents: row.attachments.map((a) => ({ kind: a.kind, url: a.url })),
    totals,
  };
}

export type OrderCard = ReturnType<typeof toOrderCard>;
export type OrderDetail = ReturnType<typeof toOrderDetail>;

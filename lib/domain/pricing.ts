import { type OperationKind, type OrderNode, type PriceRuleInput, type UnitType, walk } from "./types";

// Two prices exist for every line: platform (what the client pays) and partner
// (the warehouse's cut). Only platform appears here, and the serialiser that
// builds API responses never reads the other one — see lib/dto.

export interface Totals {
  operationsCents: number;
  suppliesCents: number;
  grandCents: number;
}

/**
 * The hub's tariff for one operation on one pallet type. A missing rule prices
 * the line at nothing rather than failing the request — it means the tariff was
 * never entered for that hub, which is a gap in the price book, not in the order.
 */
export function priceOf(
  rules: PriceRuleInput[],
  kind: OperationKind,
  unitType: UnitType,
  hubId?: string | null,
): number {
  if (!hubId) return 0;
  const rule = rules.find(
    (r) => r.hubId === hubId && r.operationKind === kind && r.unitType === unitType,
  );
  return rule?.platformCents ?? 0;
}

export interface BilledLine {
  at: Date;
  cents: number;
  source: "operation" | "supply";
}

/**
 * Every chargeable line of an order, dated — the one place pricing happens.
 *
 * Totals on a detail page and the spend series on the dashboard both read this,
 * so the two can never drift apart: pricing a sub-order by its parent's hub in
 * one of them and by its own hub in the other is exactly the kind of divergence
 * nothing would ever report.
 *
 * `supplyDate` is when supply lines are counted, since a supply has no date of
 * its own — the order's close date, or its slot while it is still open.
 */
export function billedLines(
  node: OrderNode,
  rules: PriceRuleInput[],
  supplyDate: Date,
): BilledLine[] {
  const lines: BilledLine[] = [];

  for (const n of walk(node)) {
    const hubId = n.hubId ?? node.hubId;
    for (const op of n.operations) {
      if (!op.billable) continue;
      lines.push({
        at: op.appliedAt,
        cents: op.qty * priceOf(rules, op.kind, op.unitType, hubId),
        source: "operation",
      });
    }
    for (const supply of n.supplies ?? []) {
      // The unit price was copied onto the line when it was added, so an invoice
      // issued last month does not move when the SKU is repriced today.
      lines.push({ at: supplyDate, cents: supply.qty * supply.unitPriceCents, source: "supply" });
    }
  }

  return lines;
}

export function orderTotals(node: OrderNode, rules: PriceRuleInput[]): Totals {
  const lines = billedLines(node, rules, node.scheduledAt);
  const sum = (source: BilledLine["source"]) =>
    lines.filter((l) => l.source === source).reduce((total, l) => total + l.cents, 0);

  const operationsCents = sum("operation");
  const suppliesCents = sum("supply");

  return { operationsCents, suppliesCents, grandCents: operationsCents + suppliesCents };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

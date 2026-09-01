import { type OperationKind, type OrderNode, type PriceRuleInput, type UnitType, walk } from "./types";

// Two prices exist for every line: platform (what the client pays) and partner
// (the warehouse's cut). Only platform appears here, and the serialiser that
// builds API responses never reads the other one — see lib/dto.

export interface Totals {
  operationsCents: number;
  suppliesCents: number;
  grandCents: number;
}

/** A rule pinned to the hub beats the global one; without either, the line is free. */
export function priceOf(
  rules: PriceRuleInput[],
  kind: OperationKind,
  unitType: UnitType,
  hubId?: string | null,
): number {
  const matching = rules.filter((r) => r.operationKind === kind && r.unitType === unitType);
  const specific = hubId ? matching.find((r) => r.hubId === hubId) : undefined;
  return (specific ?? matching.find((r) => r.hubId === null))?.platformCents ?? 0;
}

export function orderTotals(node: OrderNode, rules: PriceRuleInput[]): Totals {
  let operationsCents = 0;
  let suppliesCents = 0;

  for (const n of walk(node)) {
    for (const op of n.operations) {
      if (!op.billable) continue;
      operationsCents += op.qty * priceOf(rules, op.kind, op.unitType, n.hubId ?? node.hubId);
    }
    for (const supply of n.supplies ?? []) {
      // The unit price was copied onto the line when it was added, so an invoice
      // issued last month does not move when the SKU is repriced today.
      suppliesCents += supply.qty * supply.unitPriceCents;
    }
  }

  return { operationsCents, suppliesCents, grandCents: operationsCents + suppliesCents };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

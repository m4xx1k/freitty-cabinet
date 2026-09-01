import { type OrderNode, type UnitType, walk } from "./types";

export interface Quantities {
  /** What the BOL promises, this order plus every sub-order. */
  declared: number;
  /** What came off the truck. This is the number the detail screen shows. */
  actual: number;
  /** actual − declared. Non-zero raises QTY_DELTA. */
  delta: number;
  /** What is left to ship once damaged pallets are disposed of. Not the same as actual. */
  shippable: number;
  /** Declared split by pallet type — the "15 × Std + 12 × XL" line on a card. */
  declaredByUnit: Record<UnitType, number>;
}

const emptyByUnit = (): Record<UnitType, number> => ({ STANDARD_48X40: 0, XL: 0 });

export function quantities(node: OrderNode): Quantities {
  const nodes = walk(node);

  const declaredByUnit = emptyByUnit();
  let declared = 0;
  for (const n of nodes) {
    for (const line of n.cargoLines) {
      declared += line.declaredQty;
      declaredByUnit[line.unitType] += line.declaredQty;
    }
  }

  const sumOf = (kind: string) =>
    nodes.reduce(
      (total, n) =>
        total + n.operations.filter((op) => op.kind === kind).reduce((s, op) => s + op.qty, 0),
      0,
    );

  const unloaded = sumOf("UNLOADING");
  const disposed = sumOf("DISPOSAL");

  // A delta only means something once the count is complete. Half-unloaded, a
  // consolidation would otherwise report every pallet still on the truck as
  // missing: three sub-orders declaring 9 + 6 + 12 with only the first one off
  // the trailer would read as Δ −18 and raise an alert on a healthy order.
  const counted = nodes.every(
    (n) =>
      n.cargoLines.length === 0 ||
      (n.children?.length ?? 0) > 0 ||
      n.operations.some((op) => op.kind === "UNLOADING"),
  );

  return {
    declared,
    actual: unloaded,
    delta: counted && unloaded > 0 ? unloaded - declared : 0,
    shippable: unloaded - disposed,
    declaredByUnit,
  };
}

/** How many distinct trailers the cargo was consolidated into — the "2 consolidated" chip. */
export function trailerCount(node: OrderNode): number {
  const trailers = new Set<string>();
  for (const n of walk(node)) {
    for (const op of n.operations) {
      if (op.trailerNo) trailers.add(op.trailerNo);
    }
  }
  return trailers.size;
}

/** A consolidation shows one ref per sub-order; a cross-dock carries its own. */
export function refNumbers(node: OrderNode): string[] {
  return walk(node)
    .filter((n) => (n.children?.length ?? 0) === 0)
    .map((n) => n.refNumber)
    .filter((ref): ref is string => Boolean(ref));
}

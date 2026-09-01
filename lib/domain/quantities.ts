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

  return {
    declared,
    actual: unloaded,
    // Before anything is unloaded there is no counted quantity, so no delta either.
    delta: unloaded === 0 ? 0 : unloaded - declared,
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

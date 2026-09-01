// Plain shapes the domain works on. Deliberately not Prisma types: these
// functions are pure, so a test builds one by hand in three lines and no
// database is involved anywhere below this line.

export type UnitType = "STANDARD_48X40" | "XL";

export type OperationKind = "UNLOADING" | "DISPOSAL" | "RESTACK" | "LOADING" | "STORAGE";

export type OrderStatus =
  | "DRAFT"
  | "READY"
  | "IN_PROGRESS"
  | "CONSOLIDATED"
  | "IN_TRANSIT"
  | "DECONSOLIDATED"
  | "CLOSED";

export type CargoState = "EXPECTED" | "ON_STOCK" | "LOADED" | "SHIPPED";

export interface CargoLineInput {
  unitType: UnitType;
  declaredQty: number;
}

export interface OperationInput {
  kind: OperationKind;
  qty: number;
  unitType: UnitType;
  appliedAt: Date;
  billable: boolean;
  requiresPhoto: boolean;
  photoCount: number;
  trailerNo?: string | null;
}

export interface SupplyInput {
  qty: number;
  unitPriceCents: number;
}

/** An order and, for a consolidation, its sub-orders. The same shape at both depths. */
export interface OrderNode {
  number: string;
  status: OrderStatus;
  scheduledAt: Date;
  refNumber?: string | null;
  hubId?: string | null;
  cargoLines: CargoLineInput[];
  operations: OperationInput[];
  supplies?: SupplyInput[];
  children?: OrderNode[];
}

export interface PriceRuleInput {
  hubId: string;
  operationKind: OperationKind;
  unitType: UnitType;
  platformCents: number;
}

/** Both sides of every node, parent first. */
export function walk(node: OrderNode): OrderNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  "READY",
  "IN_PROGRESS",
  "CONSOLIDATED",
  "IN_TRANSIT",
];

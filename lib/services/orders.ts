import { prisma } from "@/lib/db/prisma";
import type { OrderNode, OperationInput, PriceRuleInput } from "@/lib/domain/types";

// Everything the domain needs about one order, its sub-orders included.
export const orderInclude = {
  hub: true,
  dock: true,
  createdBy: true,
  driver: true,
  assignedTo: true,
  cargoLines: true,
  supplies: { include: { sku: { select: { code: true, category: true } } } },
  operations: {
    orderBy: { appliedAt: "asc" },
    include: { attachments: true, _count: { select: { comments: true } } },
  },
  attachments: true,
  children: {
    orderBy: { number: "asc" },
    include: {
      cargoLines: true,
      supplies: { include: { sku: { select: { code: true, category: true } } } },
      operations: {
        orderBy: { appliedAt: "asc" },
        include: { attachments: true, _count: { select: { comments: true } } },
      },
    },
  },
} as const;

type Loaded = Awaited<ReturnType<typeof loadOrder>>;
export type OrderRow = NonNullable<Loaded>;
export type ChildRow = OrderRow["children"][number];

export function loadOrder(number: string) {
  return prisma.order.findUnique({ where: { number }, include: orderInclude });
}

function toOperation(op: OrderRow["operations"][number]): OperationInput {
  return {
    kind: op.kind,
    qty: op.qty,
    unitType: op.unitType,
    appliedAt: op.appliedAt,
    billable: op.billable,
    requiresPhoto: op.requiresPhoto,
    photoCount: op.attachments.filter((a) => a.kind === "PHOTO").length,
    trailerNo: op.trailerNo,
  };
}

/** Prisma rows in, the plain tree the pure functions work on out. */
export function toNode(row: OrderRow | ChildRow): OrderNode {
  const children = "children" in row ? row.children : [];
  return {
    number: row.number,
    status: row.status,
    scheduledAt: row.scheduledAt,
    refNumber: row.refNumber,
    hubId: row.hubId,
    cargoLines: row.cargoLines.map((l) => ({ unitType: l.unitType, declaredQty: l.declaredQty })),
    operations: row.operations.map(toOperation),
    supplies: row.supplies.map((s) => ({ qty: s.qty, unitPriceCents: s.unitPriceCents })),
    children: children.map(toNode),
  };
}

/**
 * Tariffs, without the partner column. The client-facing side of the app has no
 * way to read it: the query never selects it.
 */
export async function loadPriceRules(): Promise<PriceRuleInput[]> {
  return prisma.priceRule.findMany({
    select: { hubId: true, operationKind: true, unitType: true, platformCents: true },
  });
}

/** Every top-level order as a domain node — used wherever alerts are counted. */
export async function loadAllNodes() {
  const rows = await prisma.order.findMany({ where: { parentId: null }, include: orderInclude });
  return rows.map((row) => ({ row, node: toNode(row) }));
}

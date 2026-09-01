import { describe, expect, it } from "vitest";
import { alertsFor, needAttention } from "./alerts";
import { orderTotals, priceOf } from "./pricing";
import { quantities, refNumbers, trailerCount } from "./quantities";
import type { OperationInput, OrderNode, PriceRuleInput } from "./types";

const op = (o: Partial<OperationInput> & Pick<OperationInput, "kind" | "qty">): OperationInput => ({
  unitType: "STANDARD_48X40",
  appliedAt: new Date("2026-04-17T08:55:00Z"),
  billable: true,
  requiresPhoto: false,
  photoCount: 0,
  ...o,
});

const order = (o: Partial<OrderNode> & Pick<OrderNode, "number">): OrderNode => ({
  status: "IN_PROGRESS",
  scheduledAt: new Date("2026-04-17T08:00:00Z"),
  cargoLines: [],
  operations: [],
  ...o,
});

// The order the whole detail screen is built around.
const fr001383 = order({
  number: "FR001383",
  refNumber: "REF-1012",
  cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 10 }],
  operations: [
    op({ kind: "UNLOADING", qty: 12, requiresPhoto: true, photoCount: 4, trailerNo: "TRL-8830" }),
    op({ kind: "DISPOSAL", qty: 1, requiresPhoto: true, photoCount: 2 }),
    op({ kind: "RESTACK", qty: 11, billable: false, photoCount: 1 }),
    op({ kind: "LOADING", qty: 11, trailerNo: "TRL-8830" }),
  ],
  supplies: [
    { qty: 4, unitPriceCents: 320 },
    { qty: 16, unitPriceCents: 85 },
    { qty: 2, unitPriceCents: 740 },
  ],
});

// Consolidation: three sub-orders, each with its own ref and its own pallets.
const fr001676 = order({
  number: "FR001676",
  children: [
    order({
      number: "FR001676-1",
      refNumber: "REF-1001",
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 9 }],
      operations: [op({ kind: "UNLOADING", qty: 9, trailerNo: "TRL-8830", photoCount: 1, requiresPhoto: true })],
    }),
    order({
      number: "FR001676-2",
      refNumber: "REF-1003",
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 6 }],
      operations: [op({ kind: "UNLOADING", qty: 6, trailerNo: "TRL-8830", photoCount: 1, requiresPhoto: true })],
    }),
    order({
      number: "FR001676-3",
      refNumber: "REF-1002",
      cargoLines: [{ unitType: "XL", declaredQty: 12 }],
      operations: [op({ kind: "UNLOADING", qty: 12, unitType: "XL", trailerNo: "TRL-9041", photoCount: 1, requiresPhoto: true })],
    }),
  ],
});

// Consolidation carrying both alerts at once.
const fr001674 = order({
  number: "FR001674",
  children: [
    order({
      number: "FR001674-1",
      refNumber: "REF-1005",
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 11 }],
      operations: [op({ kind: "UNLOADING", qty: 10, requiresPhoto: true, photoCount: 2 })],
    }),
    order({
      number: "FR001674-2",
      refNumber: "REF-1006",
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 7 }],
      operations: [op({ kind: "UNLOADING", qty: 6, requiresPhoto: true, photoCount: 0 })],
    }),
  ],
});

describe("quantities", () => {
  it("counts what came off the truck, not what is left after disposal", () => {
    const q = quantities(fr001383);
    expect(q.declared).toBe(10);
    expect(q.actual).toBe(12);
    expect(q.delta).toBe(2);
    // 12 unloaded − 1 damaged: this is what leaves, and it is a different number
    // from actual. Confusing the two turns Δ +2 into Δ +1 on screen.
    expect(q.shippable).toBe(11);
  });

  it("rolls a consolidation up from its sub-orders, split by pallet type", () => {
    const q = quantities(fr001676);
    expect(q.declared).toBe(27);
    expect(q.declaredByUnit).toEqual({ STANDARD_48X40: 15, XL: 12 });
    expect(q.delta).toBe(0);
  });

  it("reports no delta before anything has been unloaded", () => {
    const awaiting = order({
      number: "FR001681",
      status: "READY",
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 23 }],
    });
    expect(quantities(awaiting).delta).toBe(0);
  });

  it("takes ref numbers from the leaves and trailers from the log", () => {
    expect(refNumbers(fr001676)).toEqual(["REF-1001", "REF-1003", "REF-1002"]);
    expect(refNumbers(fr001383)).toEqual(["REF-1012"]);
    expect(trailerCount(fr001676)).toBe(2);
  });
});

describe("alerts", () => {
  it("raises a delta alert with the numbers behind it", () => {
    const alerts = alertsFor(fr001383);
    expect(alerts.map((a) => a.code)).toEqual(["QTY_DELTA"]);
    expect(alerts[0].message).toBe("10 declared · 12 actual (Δ +2)");
  });

  it("names the sub-order whose operation has no photo", () => {
    const alerts = alertsFor(fr001674);
    expect(alerts.map((a) => a.code).sort()).toEqual(["MISSING_PHOTO", "QTY_DELTA"]);
    expect(alerts.find((a) => a.code === "MISSING_PHOTO")?.message).toBe("photo missing · FR001674-2");
    expect(quantities(fr001674).delta).toBe(-2);
  });

  it("stays quiet on a clean consolidation", () => {
    expect(alertsFor(fr001676)).toEqual([]);
  });

  it("flags a submitted order whose truck never arrived", () => {
    const stood_up = order({
      number: "FR001690",
      status: "READY",
      scheduledAt: new Date("2026-04-10T09:00:00Z"),
      cargoLines: [{ unitType: "STANDARD_48X40", declaredQty: 8 }],
    });
    expect(alertsFor(stood_up, new Date("2026-04-17T09:00:00Z")).map((a) => a.code)).toEqual(["OVERDUE"]);
  });

  it("counts an order with two alerts once, in the actionable bucket", () => {
    const draft = order({ number: "DRAFT-003", status: "DRAFT" });
    const tile = needAttention(
      [fr001383, fr001674, fr001676, draft].map((node) => ({ node, alerts: alertsFor(node) })),
    );
    expect(tile).toEqual({
      total: 3,
      awaitingAction: 2,
      activeAlerts: 1,
      alerting: ["FR001674"],
    });
  });
});

describe("pricing", () => {
  const rules: PriceRuleInput[] = [
    { hubId: null, operationKind: "UNLOADING", unitType: "STANDARD_48X40", platformCents: 450 },
    { hubId: null, operationKind: "DISPOSAL", unitType: "STANDARD_48X40", platformCents: 1200 },
    { hubId: null, operationKind: "RESTACK", unitType: "STANDARD_48X40", platformCents: 350 },
    { hubId: null, operationKind: "LOADING", unitType: "STANDARD_48X40", platformCents: 400 },
    { hubId: "hub-markham", operationKind: "UNLOADING", unitType: "STANDARD_48X40", platformCents: 500 },
  ];

  it("prefers a hub tariff over the global one", () => {
    expect(priceOf(rules, "UNLOADING", "STANDARD_48X40")).toBe(450);
    expect(priceOf(rules, "UNLOADING", "STANDARD_48X40", "hub-markham")).toBe(500);
    expect(priceOf(rules, "UNLOADING", "XL")).toBe(0);
  });

  it("bills the operation log and leaves non-billable lines out", () => {
    const totals = orderTotals(fr001383, rules);
    // 12×4.50 + 1×12.00 + 11×4.00 — Restack is marked non-billable and is skipped.
    expect(totals.operationsCents).toBe(12 * 450 + 1 * 1200 + 11 * 400);
    // 4×3.20 + 16×0.85 + 2×7.40, each at the price frozen onto the line.
    expect(totals.suppliesCents).toBe(4 * 320 + 16 * 85 + 2 * 740);
    expect(totals.grandCents).toBe(totals.operationsCents + totals.suppliesCents);
  });

  it("bills a consolidation across its sub-orders", () => {
    expect(orderTotals(fr001676, rules).operationsCents).toBe(9 * 450 + 6 * 450);
  });
});

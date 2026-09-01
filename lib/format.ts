import type { UnitType } from "@/lib/domain/types";

/**
 * Times render in a fixed zone, never the reader's.
 *
 * A slot is an appointment at a dock: "08:00" is when the truck is expected
 * *there*. Left to the browser, a reviewer opening the link from Europe reads
 * 13:00 for the same booking and the operations log tells a different story
 * about the same morning. A fixed zone also makes the server and the client
 * agree, which is what keeps hydration quiet.
 *
 * The zone is UTC because that is the zone the seed's wall-clock times were
 * written in — 08:55 in prisma/seed.ts means 08:55 on the floor. In production
 * this constant becomes the hub's own zone, which is a column the schema does
 * not have yet; either way the point is that it is a property of where the work
 * happened, not of who is looking at it.
 */
const DISPLAY_TZ = "UTC";

const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function stamp(value: string | Date) {
  const parts = STAMP.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), hour: get("hour"), minute: get("minute") };
}

export function formatDay(value: string | Date): string {
  const { day, month } = stamp(value);
  return `${day} ${month}`;
}

export function formatDayTime(value: string | Date): string {
  const { day, month, hour, minute } = stamp(value);
  return `${day} ${month}, ${hour}:${minute}`;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const UNIT_LABEL: Record<UnitType, string> = { STANDARD_48X40: "Std", XL: "XL" };

/** "15 × Std + 12 × XL" — the Q-ty line, straight from the declared split. */
export function formatUnits(byUnit: Record<string, number>): string {
  const parts = Object.entries(byUnit)
    .filter(([, qty]) => qty > 0)
    .map(([unit, qty]) => `${qty} × ${UNIT_LABEL[unit as UnitType] ?? unit}`);
  return parts.length ? parts.join(" + ") : "—";
}

/** The long form, for the operations table where the pallet type is a column. */
export const UNIT_FULL: Record<string, string> = {
  STANDARD_48X40: "Standard (48×40)",
  XL: "XL",
};

export const OPERATION_LABEL: Record<string, string> = {
  UNLOADING: "Unloading",
  DISPOSAL: "Disposal",
  RESTACK: "Restack",
  LOADING: "Loading",
  STORAGE: "Storage",
};

export const SKU_CATEGORY_LABEL: Record<string, string> = {
  SECUREMENT: "Securement",
  EDGE_PROTECT: "Edge protect",
  WRAP: "Wrap",
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  READY: "New",
  IN_PROGRESS: "In progress",
  CONSOLIDATED: "Consolidated",
  IN_TRANSIT: "In transit",
  DECONSOLIDATED: "Deconsolidated",
  CLOSED: "Completed",
};

export const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  READY: "badge-new",
  IN_PROGRESS: "badge-prog",
  CONSOLIDATED: "badge-consol",
  IN_TRANSIT: "badge-prog",
  DECONSOLIDATED: "badge-warn",
  CLOSED: "badge-done",
};

export const CARGO_STATE_LABEL: Record<string, string> = {
  EXPECTED: "Expected",
  ON_STOCK: "On Stock",
  LOADED: "Loaded",
  SHIPPED: "Shipped",
};

export const SERVICE_LABEL: Record<string, string> = {
  STORAGE: "Storage",
  PICKUP: "Pickup",
  TRANSLOAD: "Transload",
  RESTOCK_REWORK: "Restock & Rework",
};

/** The avatar colours the mockup gives each dispatcher. */
export function avatarColor(initials: string): string {
  const palette: Record<string, string> = {
    U1: "#5B21B6",
    U2: "#0EA5E9",
    U3: "#16A34A",
    U4: "#D97706",
    U5: "#0F766E",
    U6: "#B8142A",
  };
  return palette[initials] ?? "#2E75B6";
}

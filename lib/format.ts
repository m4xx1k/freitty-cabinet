import type { UnitType } from "@/lib/domain/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(value: string | Date): string {
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDayTime(value: string | Date): string {
  const d = new Date(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDay(d)}, ${hh}:${mm}`;
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

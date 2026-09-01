import type { Alert } from "./alerts";
import type { OrderNode } from "./types";
import { walk } from "./types";

// The "Next: …" line in every card footer. Derived, like everything else —
// it is a reading of the status, the alerts and the last thing the floor did.

export interface NextAction {
  label: string;
  urgent: boolean;
}

export function nextAction(node: OrderNode, alerts: Alert[]): NextAction {
  const actionable = alerts.find((a) => a.clientActionable);
  if (actionable) {
    return {
      label: actionable.code === "MISSING_PHOTO" ? "Upload photo" : actionable.message,
      urgent: true,
    };
  }

  switch (node.status) {
    case "DRAFT":
      return { label: "Continue editing", urgent: false };
    case "READY":
      return { label: "Waiting for truck", urgent: false };
    case "CLOSED":
      return { label: "Closed", urgent: false };
    case "IN_TRANSIT":
      return { label: "In transit", urgent: false };
    case "DECONSOLIDATED":
      return { label: "Deconsolidated", urgent: false };
    default:
      break;
  }

  const operations = walk(node).flatMap((n) => n.operations);
  const loaded = operations.some((op) => op.kind === "LOADING");
  if (loaded) return { label: "Ready to depart", urgent: false };
  if (operations.length > 0) return { label: "Loading", urgent: false };
  return { label: "Unloading", urgent: false };
}

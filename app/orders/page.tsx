import { Suspense } from "react";
import { OrdersView } from "@/components/OrdersView";

export const metadata = { title: "All Orders — Freitty" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="fc-content">Loading orders…</div>}>
      <OrdersView />
    </Suspense>
  );
}

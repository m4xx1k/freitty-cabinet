import { Suspense } from "react";
import { DashboardView } from "@/components/DashboardView";

export const metadata = { title: "Dashboard — Freitty" };

export default function DashboardPage() {
  // The bucket switch reads the URL, so the view needs a suspense boundary.
  return (
    <Suspense fallback={<div className="fc-content">Loading dashboard…</div>}>
      <DashboardView />
    </Suspense>
  );
}

import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="fc-content">
      <div className="fc-crumbs">
        Home <span>›</span> Dashboard
      </div>
      <div className="fc-page-title">
        <h1>Welcome, User 1 👋</h1>
      </div>
      <div className="empty">
        The dashboard lands next. In the meantime the data is already live —{" "}
        <Link href="/orders" style={{ color: "var(--steel)", fontWeight: 600 }}>
          open the order list
        </Link>
        .
      </div>
    </div>
  );
}

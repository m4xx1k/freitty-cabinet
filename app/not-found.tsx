import Link from "next/link";

export const metadata = { title: "Not found — Freitty" };

/** Inside the shell, so a mistyped URL looks like a page and not a broken site. */
export default function NotFound() {
  return (
    <div className="fc-content">
      <div className="fc-crumbs">
        <Link href="/">Home</Link> <span>›</span> Not found
      </div>
      <div className="fc-page-title">
        <h1>Page not found</h1>
      </div>
      <div className="empty">
        <Link href="/orders" className="lnk">
          Open the order list →
        </Link>
      </div>
    </div>
  );
}

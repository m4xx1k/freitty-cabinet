"use client";

/** Segment error boundary. Client component by convention — it owns reset(). */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="fc-content">
      <div className="fc-page-title">
        <h1>Something went wrong</h1>
      </div>
      <div className="empty">
        {error.message || "The page could not be rendered."}
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

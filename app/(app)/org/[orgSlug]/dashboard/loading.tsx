/** Instant skeleton while DashboardPage server-renders. */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1">
        <div className="h-7 w-36 rounded bg-[var(--bg-3)]" />
        <div className="h-3 w-80 rounded bg-[var(--bg-3)]" />
      </div>
      {/* Hero tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]" />
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-52 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]" />
        <div className="h-52 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]" />
      </div>
      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-44 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]" />
        ))}
      </div>
    </div>
  );
}

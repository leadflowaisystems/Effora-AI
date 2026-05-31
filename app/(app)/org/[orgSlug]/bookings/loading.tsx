/** Instant skeleton while BookingsPage server-renders. */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-36 rounded bg-[var(--bg-3)]" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]" />
      ))}
    </div>
  );
}

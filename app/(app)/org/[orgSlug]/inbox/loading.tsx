/**
 * Shows an inbox skeleton while InboxLayout fetches the conversation list.
 * Gives instant visual feedback when entering the inbox from another section.
 */
export default function Loading() {
  return (
    <div
      className="-m-6 flex overflow-hidden bg-[var(--bg)]"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* Left panel — conversation list skeleton */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-1)]">
        {/* Toggle bar */}
        <div className="flex h-9 shrink-0 items-center border-b border-[var(--border)] px-3 gap-2">
          <div className="h-4 w-10 rounded-full bg-[var(--bg-3)] animate-pulse" />
          <div className="h-3 w-16 rounded    bg-[var(--bg-3)] animate-pulse" />
        </div>
        {/* Header row */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="h-3 w-10 rounded bg-[var(--bg-3)] animate-pulse" />
          <div className="h-6 w-6 rounded  bg-[var(--bg-3)] animate-pulse" />
        </div>
        {/* Search placeholder */}
        <div className="px-3 py-2 shrink-0">
          <div className="h-8 w-full rounded-md bg-[var(--bg-3)] animate-pulse" />
        </div>
        {/* Conversation rows */}
        <div className="space-y-1 px-1.5 pb-2">
          {[80, 65, 90, 55, 72, 60].map((w, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-[var(--radius-sm)] px-3 py-3"
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--bg-3)] animate-pulse" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className={`h-3 rounded bg-[var(--bg-3)] animate-pulse`} style={{ width: `${w}%` }} />
                <div className="h-2.5 w-full rounded bg-[var(--bg-3)] animate-pulse" />
                <div className="h-2 w-14 rounded-full bg-[var(--bg-3)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — empty while layout loads */}
      <div className="flex flex-1 items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-[var(--brand)]/30 border-t-[var(--brand)] animate-spin" />
      </div>
    </div>
  );
}

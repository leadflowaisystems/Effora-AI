/**
 * Human-readable relative timestamps (e.g. "just now", "3m", "2h", "4d").
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Format a cost in INR with proper decimal places. */
export function formatInr(amount: number): string {
  if (amount < 0.01) return "₹<0.01";
  return `₹${amount.toFixed(2)}`;
}

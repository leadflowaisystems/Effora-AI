/**
 * Shared utility: convert a named range string into UTC ISO timestamps.
 * Uses IST (UTC+5:30) as the "day boundary" since the app targets India.
 */

export type Range = "today" | "week" | "month" | "year" | "all" | "custom";

export const RANGES: { value: Range; label: string }[] = [
  { value: "today",  label: "Today"   },
  { value: "week",   label: "Week"    },
  { value: "month",  label: "Month"   },
  { value: "year",   label: "Year"    },
  { value: "all",    label: "All"     },
  { value: "custom", label: "Custom"  },
];

/** Named ranges shown in the segmented control (excludes custom — handled separately) */
export const PRESET_RANGES = RANGES.filter((r) => r.value !== "custom");

export function parseRange(raw: string | null): Range {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "year" || raw === "all" || raw === "custom") {
    return raw;
  }
  return "month"; // sensible default
}

// IST offset: +5:30 = 330 minutes
const IST_OFFSET_MS = 330 * 60 * 1000;

function istMidnight(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/**
 * Returns { from: ISO | null, to: ISO }.
 * - `from` is null for "all" (no lower bound).
 * - For "custom", pass explicit `customFrom`/`customTo` ISO strings.
 * - Boundaries align to IST midnight.
 */
export function getRangeBounds(
  range: Range,
  customFrom?: string | null,
  customTo?: string | null,
): { from: string | null; to: string } {
  const now = new Date();

  if (range === "custom") {
    return {
      from: customFrom ?? null,
      to:   customTo   ?? now.toISOString(),
    };
  }

  const to = now.toISOString();

  switch (range) {
    case "today":
      return { from: istMidnight(now).toISOString(), to };
    case "week": {
      const d = new Date(now);
      const day = d.getDay();
      d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // back to Monday
      return { from: istMidnight(d).toISOString(), to };
    }
    case "month":
      return { from: istMidnight(new Date(now.getFullYear(), now.getMonth(), 1)).toISOString(), to };
    case "year":
      return { from: istMidnight(new Date(now.getFullYear(), 0, 1)).toISOString(), to };
    case "all":
    default:
      return { from: null, to };
  }
}

/**
 * For the "Upcoming" bookings sub-category: returns a FORWARD-looking window.
 * "Today" → rest of today; "Week" → rest of this calendar week, etc.
 */
export function getFutureBounds(range: Range, customTo?: string | null): { from: string; to: string | null } {
  const now = new Date();
  const from = now.toISOString(); // starts NOW

  if (range === "custom") {
    return { from, to: customTo ?? null };
  }

  switch (range) {
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { from, to: end.toISOString() };
    }
    case "week": {
      const d = new Date(now);
      const day = d.getDay();
      d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day)); // end of Sunday
      d.setHours(23, 59, 59, 999);
      return { from, to: d.toISOString() };
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
      d.setHours(23, 59, 59, 999);
      return { from, to: d.toISOString() };
    }
    case "year": {
      const d = new Date(now.getFullYear(), 11, 31);
      d.setHours(23, 59, 59, 999);
      return { from, to: d.toISOString() };
    }
    case "all":
    default:
      return { from, to: null };
  }
}

/** Format a date for display: "3 Dec 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Format an ISO string to YYYY-MM-DD for <input type="date"> */
export function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

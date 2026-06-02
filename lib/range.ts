/**
 * Shared utility: convert a named range string into UTC ISO timestamps.
 * Uses IST (UTC+5:30) as the "day boundary" since the app targets India.
 * Exporting a pure function keeps the logic testable + reusable across routes.
 */

export type Range = "today" | "week" | "month" | "year" | "all";

export const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today"  },
  { value: "week",  label: "Week"   },
  { value: "month", label: "Month"  },
  { value: "year",  label: "Year"   },
  { value: "all",   label: "All"    },
];

export function parseRange(raw: string | null): Range {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "year" || raw === "all") {
    return raw;
  }
  return "month"; // default
}

/**
 * Returns { from: ISO | null, to: ISO }.
 * `from` is null for "all" (no lower bound filter).
 * Boundaries align to IST midnight (UTC+5:30 = offset +330 min).
 */
export function getRangeBounds(range: Range): { from: string | null; to: string } {
  const now = new Date();
  const to  = now.toISOString();

  // IST offset in ms: +5:30 = 330 * 60 * 1000
  const IST_OFFSET_MS = 330 * 60 * 1000;

  // Start of day/week/month/year in IST — align to midnight IST, then convert back to UTC
  function istMidnight(d: Date): Date {
    // Get current date in IST
    const istMs = d.getTime() + IST_OFFSET_MS;
    const istDate = new Date(istMs);
    // Zero out h/m/s/ms
    istDate.setUTCHours(0, 0, 0, 0);
    // Convert back to UTC
    return new Date(istDate.getTime() - IST_OFFSET_MS);
  }

  switch (range) {
    case "today": {
      return { from: istMidnight(now).toISOString(), to };
    }
    case "week": {
      const d = new Date(now);
      // Go back to Monday (ISO week)
      const day = d.getDay(); // 0=Sun
      const diffToMonday = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diffToMonday);
      return { from: istMidnight(d).toISOString(), to };
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: istMidnight(d).toISOString(), to };
    }
    case "year": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: istMidnight(d).toISOString(), to };
    }
    case "all":
    default:
      return { from: null, to };
  }
}

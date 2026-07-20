import * as React from "react";

// Strips trailing punctuation that is likely not part of the URL.
const TRAIL_RE = /[.,;:!?)\]'"]+$/;

export function linkify(text: string): React.ReactNode {
  // Regex instantiated per-call: /g regexes carry mutable lastIndex state, and
  // a module-level /g regex shared across concurrent React renders causes missed
  // or duplicate matches.
  const LINK_RE = /(?:https?:\/\/|upi:\/\/)\S+|cal\.com\/\S+/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0].replace(TRAIL_RE, "");
    // Advance regex if trailing chars were stripped
    LINK_RE.lastIndex = m.index + raw.length;
    const href = raw.startsWith("cal.com") ? `https://${raw}` : raw;
    parts.push(
      <a
        key={m.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[var(--brand)] hover:opacity-75 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>
    );
    last = m.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : <>{parts}</>;
}

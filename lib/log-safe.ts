/**
 * Log-safe rendering of customer identifiers.
 *
 * Phone numbers and Instagram PSIDs are personal data and were being written to
 * application logs in full by the outbound paths. Logs are retained and widely
 * readable, so they are the wrong place for them — but delivery problems are
 * genuinely hard to debug with nothing at all, so identifiers are masked rather
 * than dropped: enough to correlate two log lines, not enough to identify or
 * contact anyone.
 *
 * Stored values are untouched; this only affects what is printed.
 */

/**
 * Mask an identifier to its last 4 characters: "919812345678" → "…5678".
 * Anything shorter than 6 characters is fully masked, since the tail would
 * otherwise be most of the value.
 */
export function maskId(value: string | null | undefined): string {
  const s = String(value ?? "");
  if (!s) return "(none)";
  const digits = s.replace(/^(wa_|ig_)/, "");
  if (digits.length < 6) return "(masked)";
  return "…" + digits.slice(-4);
}

/** True when a value looks like it carries a phone number or PSID. */
export function hasIdentifier(value: string | null | undefined): boolean {
  return !!String(value ?? "").replace(/^(wa_|ig_)/, "").trim();
}

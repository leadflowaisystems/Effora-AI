/**
 * lib/meta-secrets.ts
 *
 * Candidate-set verification for inbound Meta webhooks.
 *
 * WHY THIS EXISTS
 * The app had a credential-resolution inversion: OAuth — which mints the token
 * that CREATES the Instagram webhook subscription — resolves credentials as
 *   meta_byo → platform_settings → env      (lib/meta-config.ts)
 * while the webhook — which VERIFIES the signature — resolved
 *   env → platform_settings                 (never meta_byo)
 * If those disagree about which Meta App is authoritative, every signature
 * fails. Production evidence: webhook_events showed 69 meta_instagram events,
 * ALL verified=false, and not one verified=true in the table's history.
 *
 * SECURITY POSTURE — this does NOT widen what is accepted.
 * A signature is accepted only if it is a genuine HMAC-SHA256 of the exact raw
 * body under a secret this deployment actually holds. Trying three known
 * secrets instead of one does not help a forger: they must still produce a
 * valid HMAC under one of our real secrets. If none match, the request is
 * rejected. Fail-closed is preserved exactly.
 *
 * Secret values are never logged, returned, or serialised — only the SOURCE
 * name and the associated (non-secret) app id.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export interface MetaSecretCandidate {
  /** Human-readable origin, e.g. "env", "platform_settings", "meta_byo:<orgId>". */
  source: string;
  /** Non-secret Meta App ID associated with this secret, when known. */
  appId:  string | null;
  /** The secret itself. NEVER log, return in a response, or serialise this. */
  secret: string;
}

/** Same shape for the GET handshake token, which had the identical inversion. */
export interface MetaVerifyTokenCandidate {
  source: string;
  token:  string;
}

/**
 * Gather every Meta app secret this deployment knows about, in the order most
 * likely to match first (cheapest first — env needs no DB round-trip).
 * Deduplicated by secret value; the first source to contribute a given secret
 * wins the name.
 */
/**
 * Env-only candidates. Synchronous and DB-free, so the common case costs
 * nothing. Callers try these first and only reach for the DB on a miss.
 */
export function envSecretCandidates(): MetaSecretCandidate[] {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return [];
  return [{ source: "env", appId: process.env.META_APP_ID ?? null, secret }];
}

export async function collectMetaAppSecrets(): Promise<MetaSecretCandidate[]> {
  const out: MetaSecretCandidate[] = [];
  const seen = new Set<string>();

  const add = (source: string, secret: string | null | undefined, appId: string | null) => {
    if (!secret) return;
    if (seen.has(secret)) return;
    seen.add(secret);
    out.push({ source, appId, secret });
  };

  // 1. Environment — no DB round-trip, so the happy path stays fast.
  add("env", process.env.META_APP_SECRET, process.env.META_APP_ID ?? null);

  // 2 + 3. Platform settings and per-tenant BYO apps, loaded together.
  try {
    const svc = createServiceClient();

    const [platformRes, byoRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).from("platform_settings")
        .select("meta_app_id, meta_app_secret_encrypted")
        .eq("id", 1)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).from("integrations")
        .select("org_id, config")
        .eq("provider", "meta_byo")
        .eq("active", true),
    ]);

    const { isEncrypted, decryptSecret } = await import("@/lib/crypto");
    const decode = (raw: string): string | null => {
      try {
        return isEncrypted(raw) ? decryptSecret(raw) : raw;
      } catch {
        // A secret we cannot decrypt is simply not a usable candidate.
        return null;
      }
    };

    const ps = platformRes?.data as
      { meta_app_id?: string | null; meta_app_secret_encrypted?: string | null } | null;
    if (ps?.meta_app_secret_encrypted) {
      add("platform_settings", decode(ps.meta_app_secret_encrypted), ps.meta_app_id ?? null);
    }

    const byoRows = (byoRes?.data ?? []) as { org_id: string; config: Record<string, string> | null }[];
    for (const row of byoRows) {
      const cfg = row.config ?? {};
      if (!cfg.app_secret_enc) continue;
      add(`meta_byo:${row.org_id}`, decode(cfg.app_secret_enc), cfg.app_id ?? null);
    }
  } catch (e) {
    // A DB failure must not silently reduce us to zero candidates without a
    // trace — the env candidate (if any) still stands.
    console.error("[meta-secrets] failed to load DB secret candidates:", e);
  }

  return out;
}

/**
 * Constant-time HMAC check against every candidate.
 * Returns the matching candidate, or null with the list of sources tried.
 */
export function verifyAgainstCandidates(
  rawBody:        string,
  receivedHeader: string,
  candidates:     MetaSecretCandidate[],
): { matched: MetaSecretCandidate | null; tried: string[] } {
  const received = Buffer.from(receivedHeader);
  const tried: string[] = [];

  for (const candidate of candidates) {
    tried.push(candidate.source);
    const expected = Buffer.from(
      "sha256=" + createHmac("sha256", candidate.secret).update(rawBody).digest("hex"),
    );
    // timingSafeEqual throws on length mismatch; an unequal length is already
    // a mismatch, so guard first.
    if (expected.length !== received.length) continue;
    if (timingSafeEqual(expected, received)) return { matched: candidate, tried };
  }

  return { matched: null, tried };
}

/**
 * The GET handshake (hub.verify_token) had the same inversion: it read only
 * process.env.META_WEBHOOK_VERIFY_TOKEN, while getMetaConfig() resolves the
 * token from meta_byo → platform_settings → env. A deployment configured
 * through the admin UI would pass POST but fail Meta's GET re-verification,
 * which itself causes Meta to drop the subscription.
 */
export function envVerifyTokenCandidates(): MetaVerifyTokenCandidate[] {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  return token ? [{ source: "env", token }] : [];
}

export async function collectMetaVerifyTokens(): Promise<MetaVerifyTokenCandidate[]> {
  const out: MetaVerifyTokenCandidate[] = [];
  const seen = new Set<string>();

  const add = (source: string, token: string | null | undefined) => {
    if (!token) return;
    if (seen.has(token)) return;
    seen.add(token);
    out.push({ source, token });
  };

  add("env", process.env.META_WEBHOOK_VERIFY_TOKEN);

  try {
    const svc = createServiceClient();
    const [platformRes, byoRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).from("platform_settings")
        .select("meta_webhook_verify_token")
        .eq("id", 1)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).from("integrations")
        .select("org_id, config")
        .eq("provider", "meta_byo")
        .eq("active", true),
    ]);

    const ps = platformRes?.data as { meta_webhook_verify_token?: string | null } | null;
    add("platform_settings", ps?.meta_webhook_verify_token);

    const byoRows = (byoRes?.data ?? []) as { org_id: string; config: Record<string, string> | null }[];
    for (const row of byoRows) {
      add(`meta_byo:${row.org_id}`, row.config?.webhook_verify_token);
    }
  } catch (e) {
    console.error("[meta-secrets] failed to load DB verify-token candidates:", e);
  }

  return out;
}

/** Constant-time comparison for the GET handshake token. */
export function matchVerifyToken(
  received:   string,
  candidates: MetaVerifyTokenCandidate[],
): MetaVerifyTokenCandidate | null {
  const recv = Buffer.from(received);
  for (const c of candidates) {
    const expected = Buffer.from(c.token);
    if (expected.length !== recv.length) continue;
    if (timingSafeEqual(expected, recv)) return c;
  }
  return null;
}

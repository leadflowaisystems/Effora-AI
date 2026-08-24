/**
 * lib/notify.ts — owner-facing push notifications.
 *
 * Thin, opinionated wrapper over lib/push.ts. Every function here is
 * FIRE-AND-FORGET and GUARANTEED NON-THROWING: a notification failure must
 * never break the message/booking/payment pipeline that triggered it.
 *
 * Copy is written for the person who owns a coaching institute, not a
 * developer: specific, scannable, and actionable from a phone lock screen.
 */

import { sendPushToOrg } from "@/lib/push";
import { createServiceClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";

/** Trim a lead's message to something that fits a lock-screen notification. */
function preview(text: string | null | undefined, max = 70): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** First name only — "Priya Sharma" → "Priya". Falls back gracefully. */
function firstName(name: string | null | undefined): string {
  if (!name) return "Someone";
  const trimmed = name.replace(/^@/, "").trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return "Someone";
  return trimmed.split(/\s+/)[0];
}

/** Resolve the org slug so notifications can deep-link into the right inbox. */
async function resolveOrgSlug(orgId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.from("orgs").select("slug").eq("id", orgId).single();
    return (data as { slug: string } | null)?.slug ?? null;
  } catch {
    return null;
  }
}

/** Build the deep link to a conversation, or the inbox root if unknown. */
async function inboxUrl(orgId: string, conversationId?: string | null): Promise<string> {
  const slug = await resolveOrgSlug(orgId);
  if (!slug) return APP_URL;
  return conversationId
    ? `${APP_URL}/org/${slug}/inbox/${conversationId}`
    : `${APP_URL}/org/${slug}/inbox`;
}

/**
 * Core sender. Swallows everything — callers never need a try/catch.
 * Kept separate so every notification path has identical failure semantics.
 */
async function safeNotify(
  orgId: string,
  title: string,
  body: string,
  conversationId?: string | null,
): Promise<void> {
  try {
    const url = await inboxUrl(orgId, conversationId);
    await sendPushToOrg(orgId, { title, body, url });
  } catch (err) {
    // Deliberately non-fatal: a push failure must not fail the pipeline.
    console.error(`[notify] push failed (non-fatal) org=${orgId} title="${title}":`, err);
  }
}

// ── Public notification builders ────────────────────────────────────────────

/** A brand-new enquiry just arrived from someone we've never spoken to. */
export async function notifyNewLead(args: {
  orgId:           string;
  leadName?:       string | null;
  channel?:        string | null;
  messageText?:    string | null;
  conversationId?: string | null;
}): Promise<void> {
  const who     = firstName(args.leadName);
  const channel = args.channel === "whatsapp_cloud" || args.channel === "whatsapp"
    ? "WhatsApp"
    : args.channel === "instagram" ? "Instagram" : "";
  const title = channel ? `New enquiry on ${channel}: ${who}` : `New enquiry: ${who}`;
  const body  = preview(args.messageText) || "Tap to open the conversation.";
  await safeNotify(args.orgId, title, body, args.conversationId);
}

/** The AI scored this lead HOT — highest-intent, worth a personal reply now. */
export async function notifyHotLead(args: {
  orgId:           string;
  leadName?:       string | null;
  messageText?:    string | null;
  conversationId?: string | null;
}): Promise<void> {
  const who   = firstName(args.leadName);
  const title = `🔥 Hot lead: ${who}`;
  const body  = preview(args.messageText) || "Ready to enrol — reply now.";
  await safeNotify(args.orgId, title, body, args.conversationId);
}

/** A demo class / counselling call was booked. */
export async function notifyBookingCreated(args: {
  orgId:           string;
  leadName?:       string | null;
  startsAt?:       string | null;
  conversationId?: string | null;
}): Promise<void> {
  const who = firstName(args.leadName);
  let when = "";
  if (args.startsAt) {
    try {
      when = new Date(args.startsAt).toLocaleString("en-IN", {
        weekday: "short", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit", hour12: true,
        timeZone: "Asia/Kolkata",
      });
    } catch { /* fall through to empty */ }
  }
  const title = `📅 Call booked: ${who}`;
  const body  = when ? `${when} IST` : "Tap to see the details.";
  await safeNotify(args.orgId, title, body, args.conversationId);
}

/** Money landed. */
export async function notifyPaymentCaptured(args: {
  orgId:           string;
  leadName?:       string | null;
  amountInr?:      number | null;
  conversationId?: string | null;
}): Promise<void> {
  const who = firstName(args.leadName);
  const amt = typeof args.amountInr === "number" && args.amountInr > 0
    ? `₹${args.amountInr.toLocaleString("en-IN")}`
    : "";
  const title = amt ? `💰 Payment received: ${amt}` : "💰 Payment received";
  const body  = `${who} has paid. Tap to view.`;
  await safeNotify(args.orgId, title, body, args.conversationId);
}

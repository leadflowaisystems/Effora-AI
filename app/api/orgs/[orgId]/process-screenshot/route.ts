/**
 * POST /api/orgs/[orgId]/process-screenshot
 *
 * Accepts a PNG/JPG/WEBP screenshot of an Instagram DM inbox,
 * runs Tesseract.js OCR, parses thread structure, then for each
 * detected thread: qualifyLead + draftReply using existing AI pipeline.
 *
 * Rate limit: 20/hr per org (Upstash sliding window).
 * Plan gate: canProcessScreenshot from lib/access.ts.
 * Runtime: nodejs (Tesseract needs Node worker threads), maxDuration: 30.
 */

export const runtime    = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/access";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { qualifyLead, draftReply } from "@/lib/ai";
import { getCalLink } from "@/lib/booking";
import { logError } from "@/lib/log";

interface Params { params: { orgId: string } }

// ── Types ─────────────────────────────────────────────────────
export interface ThreadResult {
  detected_handle:       string;
  detected_name:         string;
  last_message:          string;
  score:                 number;
  label:                 "hot" | "warm" | "cold";
  draft_reply:           string;
  suggested_cal_url:     string | null;
  suggested_payment_url: string | null;
}

// ── Image MIME validation (magic bytes) ──────────────────────
function isAllowedImageType(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
}

// ── OCR helpers ─────────────────────────────────────────────
/**
 * Extract Instagram DM thread previews from raw OCR text.
 * IG DM list format (rough regex-based heuristics):
 *   @handle or Name
 *   Last message preview (truncated)
 *   Time (2h, 1d, etc.) or unread badge
 */
function parseIgThreads(ocrText: string): Array<{ handle: string; name: string; message: string }> {
  const lines = ocrText.split("\n").map((l) => l.trim()).filter(Boolean);
  const threads: Array<{ handle: string; name: string; message: string }> = [];

  // Pattern: lines that look like IG handles or display names followed by message text
  const handlePattern  = /^@[\w._]{1,30}$/;
  const timePattern    = /^(just now|\d+[smhd] ago|\d+[smhd]|yesterday|today|\d{1,2}:\d{2}|[A-Z][a-z]{2} \d+)$/i;
  const badgePattern   = /^(\d+|\s*)$/; // unread count or empty

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Try to detect a handle/name line (starts with @ or looks like a name, 2-40 chars)
    if (
      line.length >= 2 &&
      line.length <= 50 &&
      !timePattern.test(line) &&
      !badgePattern.test(line) &&
      !/[₹$€£]/.test(line) // skip price lines
    ) {
      const isHandle = handlePattern.test(line);
      const handle   = isHandle ? line : line.replace(/[^a-zA-Z0-9._]/, "");
      const name     = line.replace(/^@/, "");

      // Look ahead for a message preview (next 1-3 non-time lines)
      const messageParts: string[] = [];
      let j = i + 1;
      while (j < lines.length && j < i + 4) {
        const next = lines[j];
        if (timePattern.test(next) || badgePattern.test(next)) { j++; continue; }
        if (next.length > 100) { break; } // probably OCR noise
        messageParts.push(next);
        j++;
        if (messageParts.length >= 2) break;
      }

      const message = messageParts.join(" ").trim();
      if (message.length >= 5) {
        threads.push({ handle: handle || name, name, message });
        i = j;
        continue;
      }
    }
    i++;
  }

  // De-duplicate by handle (keep last occurrence — most recent in list)
  const seen = new Map<string, typeof threads[0]>();
  for (const t of threads) seen.set(t.handle.toLowerCase(), t);
  return Array.from(seen.values()).slice(0, 20); // cap at 20 threads per screenshot
}

// ── Route handler ────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = params;

  // ── Auth ──────────────────────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // ── Rate limit: 20/hr per org ─────────────────────────────
  const rl = await rateLimitAsync(`process-screenshot:${orgId}`, { limit: 20 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit: max 20 screenshots/hour" }, { status: 429 });
  }

  // ── Plan gate ─────────────────────────────────────────────
  const access = await getAccessState(orgId);
  if (!access.canProcessScreenshot) {
    return NextResponse.json({
      error: `Screenshot processing requires an active plan (current: ${access.status})`,
      reason: access.reason,
    }, { status: 403 });
  }

  // ── Parse multipart / read image bytes ────────────────────
  let imageBuffer: Buffer;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("screenshot");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No screenshot file in form data" }, { status: 400 });
      }
      const blob = file as Blob;
      if (blob.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Screenshot too large (max 5 MB)" }, { status: 400 });
      }
      imageBuffer = Buffer.from(await blob.arrayBuffer());
    } else {
      // raw body
      const body = await req.arrayBuffer();
      if (body.byteLength > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Screenshot too large (max 5 MB)" }, { status: 400 });
      }
      imageBuffer = Buffer.from(body);
    }
  } catch {
    return NextResponse.json({ error: "Could not read image data" }, { status: 400 });
  }

  // ── Validate image magic bytes (PNG, JPEG, WebP) ──────────
  if (!isAllowedImageType(imageBuffer)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PNG, JPEG, or WebP screenshot." },
      { status: 415 }
    );
  }

  // ── OCR with Tesseract.js ─────────────────────────────────
  let ocrText = "";
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(imageBuffer);
    ocrText = data.text;
    await worker.terminate();
  } catch (e) {
    await logError(e, { orgId, route: "process-screenshot", userId: user.id });
    return NextResponse.json({ error: "OCR failed. Try a higher-quality screenshot." }, { status: 500 });
  }

  if (!ocrText.trim()) {
    return NextResponse.json({ error: "No text detected in screenshot." }, { status: 422 });
  }

  // ── Parse threads ─────────────────────────────────────────
  const rawThreads = parseIgThreads(ocrText);
  if (rawThreads.length === 0) {
    return NextResponse.json({
      threads: [],
      ocrPreview: ocrText.slice(0, 200),
      note: "No Instagram DM threads detected. Try a clear screenshot of your DM list.",
    });
  }

  // ── Fetch voice profile + Cal link ────────────────────────
  const svc = createServiceClient();
  const [voiceRes, calLink] = await Promise.all([
    svc.from("voice_profiles")
       .select("tone, offer, price_range, sells, objections, extra_context")
       .eq("org_id", orgId)
       .maybeSingle(),
    getCalLink(orgId),
  ]);

  const voiceProfile = voiceRes.data as {
    tone: string; offer: string; price_range: string;
    sells: string; objections: string[]; extra_context: string;
  } | null;

  // ── Process each thread ────────────────────────────────────
  const results: ThreadResult[] = [];
  let aiCallsUsed = 0;

  for (const thread of rawThreads.slice(0, 10)) { // cap at 10 per run
    try {
      const messages = [{ direction: "inbound" as const, content: thread.message, sent_at: new Date().toISOString() }];

      // Qualify
      const q = await qualifyLead({ messages, voiceProfile, orgId });
      aiCallsUsed++;

      // Draft (only warm + hot)
      let draft = "";
      if (q.stage === "warm" || q.stage === "hot") {
        try {
          const d = await draftReply({
            messages,
            voiceProfile,
            score: q.score,
            stage: q.stage,
            orgId,
            calLink: q.stage === "hot" ? calLink : null,
          });
          draft = d.content;
          aiCallsUsed++;
        } catch { /* non-fatal: use template */ }
      }

      if (!draft) {
        draft = q.stage === "hot"
          ? `Hi ${thread.name}! Thanks for reaching out. I'd love to chat — grab a time here: ${calLink ?? "let me send you a link"}`
          : q.stage === "warm"
          ? `Hey ${thread.name}! Happy to tell you more. What's your main goal right now?`
          : "";
      }

      results.push({
        detected_handle:       thread.handle,
        detected_name:         thread.name,
        last_message:          thread.message,
        score:                 q.score,
        label:                 q.stage as "hot" | "warm" | "cold",
        draft_reply:           draft,
        suggested_cal_url:     q.stage === "hot" ? calLink : null,
        suggested_payment_url: null,
      });
    } catch (e) {
      await logError(e, { orgId, route: "process-screenshot/thread", userId: user.id });
      // partial result with error
      results.push({
        detected_handle:       thread.handle,
        detected_name:         thread.name,
        last_message:          thread.message,
        score:                 0,
        label:                 "cold",
        draft_reply:           "",
        suggested_cal_url:     null,
        suggested_payment_url: null,
      });
    }
  }

  // ── Log screenshot processing ──────────────────────────────
  try {
    await svc.from("process_screenshots").insert({
      org_id:           orgId,
      user_id:          user.id,
      threads_found:    rawThreads.length,
      drafts_generated: results.filter((r) => r.draft_reply).length,
      ai_calls_used:    aiCallsUsed,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({
    threads:      results,
    total_found:  rawThreads.length,
    processed:    results.length,
    ai_calls:     aiCallsUsed,
  });
}

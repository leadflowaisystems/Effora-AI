/**
 * POST /api/orgs/[orgId]/transcribe
 *
 * Transcribes a voice note using Groq Whisper (whisper-large-v3, free tier).
 * Accepts audio up to 25 MB: mp3, m4a, wav, ogg, webm.
 *
 * Rate limit: 10/hr per org.
 * Plan gate: canSendAi (counts toward monthly AI usage).
 */

export const runtime     = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/access";
import { rateLimitAsync } from "@/lib/ratelimit";
import { logError } from "@/lib/log";

interface Params { params: { orgId: string } }

const ALLOWED_TYPES = ["audio/mp3", "audio/mpeg", "audio/m4a", "audio/mp4",
                        "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm",
                        "audio/x-m4a", "video/mp4", "video/webm"];

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const rl = await rateLimitAsync(`transcribe:${orgId}`, { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit: max 10 transcriptions/hour" }, { status: 429 });
  }

  const access = await getAccessState(orgId);
  if (!access.canSendAi) {
    return NextResponse.json({
      error: `Transcription requires an active plan with AI credits (${access.reason})`,
    }, { status: 403 });
  }

  const llmKey = process.env.LLM_API_KEY;
  const llmBase = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";

  if (!llmKey) {
    return NextResponse.json({ error: "LLM_API_KEY not configured" }, { status: 500 });
  }

  // Parse multipart form
  let audioFile: Blob;
  let fileName = "audio.mp3";
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No audio file in form data (field: 'audio')" }, { status: 400 });
    }
    audioFile = file as Blob;
    if ((file as File).name) fileName = (file as File).name;

    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 25 MB)" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(audioFile.type) && !fileName.match(/\.(mp3|m4a|wav|ogg|webm)$/i)) {
      return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Could not parse audio file" }, { status: 400 });
  }

  try {
    // Call Groq Whisper via FormData
    const formData = new FormData();
    formData.append("file", audioFile, fileName);
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "json");

    const resp = await fetch(`${llmBase.replace("/openai/v1", "")}/openai/v1/audio/transcriptions`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${llmKey}` },
      body:    formData,
      signal:  AbortSignal.timeout(25000),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message ?? `Groq Whisper returned ${resp.status}`);
    }

    const json = await resp.json() as { text: string; duration?: number };
    return NextResponse.json({ transcript: json.text, duration_sec: json.duration ?? null });
  } catch (e) {
    await logError(e, { orgId, route: "transcribe", userId: user.id });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

"use client";

/**
 * ProcessView — screenshot upload + OCR results UI.
 * Mobile-first: full-width drop zone, stacked result cards.
 */

import * as React from "react";
import { Camera, Upload, Loader2, Copy, Check, RefreshCw, Inbox, AlertTriangle, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ThreadResult } from "@/app/api/orgs/[orgId]/process-screenshot/route";

interface Props {
  orgId:   string;
  orgSlug: string;
}

type Status = "idle" | "uploading" | "ocr" | "scoring" | "done" | "error";

const STAGE_COLOR: Record<string, string> = {
  hot:  "bg-red-500/20 border-red-500/40 text-red-400",
  warm: "bg-amber-500/20 border-amber-500/40 text-amber-400",
  cold: "bg-[var(--bg-3)] border-[var(--border)] text-[var(--text-3)]",
};

function LeadCard({ t, orgSlug }: { t: ThreadResult; orgSlug: string }) {
  const [copied,   setCopied]   = React.useState(false);
  const [expanded, setExpanded] = React.useState(t.label !== "cold");
  const [draft,    setDraft]    = React.useState(t.draft_reply);

  function copyReply() {
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={cn(
      "rounded-[var(--radius-lg)] border p-4 space-y-3 transition-all",
      t.label === "hot"  ? "border-red-500/30 bg-red-500/5"    :
      t.label === "warm" ? "border-amber-500/30 bg-amber-500/5" :
                           "border-[var(--border)] bg-[var(--bg-2)]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-bold text-xs",
            STAGE_COLOR[t.label]
          )}>
            {t.detected_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text)] truncate">
              {t.detected_name}
            </p>
            <p className="text-[11px] text-[var(--text-3)] truncate">
              @{t.detected_handle}
              <span className="ml-1 opacity-50">(optional — edit if OCR misread)</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            STAGE_COLOR[t.label]
          )}>
            {t.label}
          </span>
          <span className="font-mono text-xs text-[var(--text-3)]">{t.score}/100</span>
        </div>
      </div>

      {/* Last message */}
      <p className="text-xs text-[var(--text-3)] italic leading-relaxed line-clamp-2">
        &ldquo;{t.last_message}&rdquo;
      </p>

      {/* Draft reply (expandable) */}
      {t.draft_reply && (
        <div className="space-y-2">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-xs text-[var(--brand)] font-medium"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            AI Draft
            <span className="text-[var(--text-3)]">{expanded ? "▲" : "▼"}</span>
          </button>

          {expanded && (
            <div className="rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--border)] p-3 space-y-2">
              <textarea
                className="w-full bg-transparent text-sm text-[var(--text)] leading-relaxed resize-none focus:outline-none min-h-[60px]"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {t.suggested_cal_url && (
                <p className="text-[11px] text-[var(--brand)] font-mono break-all">
                  📅 {t.suggested_cal_url}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={copyReply}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-[#0A0A0C] transition-opacity hover:opacity-90 min-h-[36px]"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy reply"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProcessView({ orgId, orgSlug }: Props) {
  const [status,  setStatus]  = React.useState<Status>("idle");
  const [threads, setThreads] = React.useState<ThreadResult[]>([]);
  const [error,   setError]   = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [step,    setStep]    = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Audio transcription
  const [showVoice,   setShowVoice]   = React.useState(false);
  const [voiceFile,   setVoiceFile]   = React.useState<File | null>(null);
  const [transcript,  setTranscript]  = React.useState<string | null>(null);
  const [voiceLoading,setVoiceLoading]= React.useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("audio/")) {
      setError("Please upload a PNG, JPG, WEBP image or an audio file.");
      return;
    }

    if (file.type.startsWith("audio/")) {
      setVoiceFile(file);
      setShowVoice(true);
      return;
    }

    // Image processing
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setStatus("uploading");
    setError(null);
    setThreads([]);

    const steps = ["Reading screenshot…", "Found threads…", "Scoring leads…", "Drafting replies…"];
    let si = 0;
    const interval = setInterval(() => { setStep(steps[Math.min(si++, steps.length - 1)]); }, 2000);

    try {
      setStep("Reading screenshot…");
      const form = new FormData();
      form.append("screenshot", file);

      const res = await fetch(`/api/orgs/${orgId}/process-screenshot`, {
        method: "POST",
        body:   form,
      });

      clearInterval(interval);

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { threads: ThreadResult[]; total_found: number };
      setThreads(data.threads ?? []);
      setStatus("done");
    } catch (e) {
      clearInterval(interval);
      setError(e instanceof Error ? e.message : "Processing failed");
      setStatus("error");
    }
  }

  async function transcribeVoice() {
    if (!voiceFile) return;
    setVoiceLoading(true);
    try {
      const form = new FormData();
      form.append("audio", voiceFile);
      const res = await fetch(`/api/orgs/${orgId}/transcribe`, { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "Transcription failed");
      }
      const data = await res.json() as { transcript: string };
      setTranscript(data.transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setVoiceLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function copyAll() {
    const text = threads
      .filter((t) => t.draft_reply)
      .map((t) => `@${t.detected_handle}:\n${t.draft_reply}`)
      .join("\n\n───\n\n");
    navigator.clipboard.writeText(text);
  }

  const hotCount  = threads.filter((t) => t.label === "hot").length;
  const warmCount = threads.filter((t) => t.label === "warm").length;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Voice note section */}
      {showVoice && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-[var(--brand)]" />
              <p className="text-sm font-medium text-[var(--text)]">Voice note detected</p>
            </div>
            <button onClick={() => { setShowVoice(false); setVoiceFile(null); setTranscript(null); }}
              className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          {voiceFile && !transcript && (
            <button
              onClick={transcribeVoice}
              disabled={voiceLoading}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 min-h-[44px]"
            >
              {voiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {voiceLoading ? "Transcribing…" : `Transcribe "${voiceFile.name}"`}
            </button>
          )}
          {transcript && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide">Transcript</p>
              <p className="text-sm text-[var(--text)] leading-relaxed bg-[var(--bg-3)] rounded-[var(--radius-sm)] p-3">{transcript}</p>
            </div>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-[var(--radius-xl)] border-2 border-dashed p-8 text-center transition-all",
          status === "uploading" || status === "ocr" || status === "scoring"
            ? "border-[var(--brand)] bg-[var(--brand)]/5"
            : "border-[var(--border)] hover:border-[var(--brand)]/50 hover:bg-[var(--brand)]/5"
        )}
      >
        {status === "idle" || status === "done" || status === "error" ? (
          <>
            <Camera className="h-12 w-12 text-[var(--text-3)]" />
            <div className="space-y-1.5">
              <p className="font-semibold text-[var(--text)]">
                Tap to upload IG DM screenshot
              </p>
              <p className="text-sm text-[var(--text-3)]">
                Or drag &amp; drop · PNG, JPG, WEBP up to 5 MB
              </p>
              <p className="text-xs text-[var(--text-3)]">
                Also accepts voice notes (mp3, m4a, wav)
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--brand)]" />
            <p className="font-medium text-[var(--text)]">{step || "Processing…"}</p>
          </div>
        )}

        {/* Preview thumbnail */}
        {preview && (status === "done" || status === "error") && (
          <img
            src={preview}
            alt="Screenshot preview"
            className="absolute inset-0 w-full h-full object-cover rounded-[calc(var(--radius-xl)-2px)] opacity-10"
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/jpg,audio/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {threads.length > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[var(--text-2)] font-medium">{threads.length} threads found</span>
              {hotCount > 0  && <Badge variant="hot"  className="text-xs">{hotCount} hot</Badge>}
              {warmCount > 0 && <Badge variant="warm" className="text-xs">{warmCount} warm</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setThreads([]); setStatus("idle"); setPreview(null); }}
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-3)] hover:bg-[var(--bg-3)] transition-colors min-h-[36px]"
              >
                <RefreshCw className="h-3 w-3" /> New
              </button>
              {threads.some((t) => t.draft_reply) && (
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-3)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors min-h-[36px]"
                >
                  <Copy className="h-3 w-3" /> Copy all
                </button>
              )}
            </div>
          </div>

          {/* Lead cards */}
          <div className="space-y-3">
            {threads.map((t, i) => (
              <LeadCard key={`${t.detected_handle}-${i}`} t={t} orgSlug={orgSlug} />
            ))}
          </div>

          {/* What next guide */}
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">What next?</p>
            <ol className="space-y-1.5">
              {[
                "Copy each reply using the button above",
                "Open Instagram → go to that person's DM",
                "Paste and send the reply",
                `Hot leads: your Cal.com booking link is already included`,
              ].map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-[var(--text-3)]">
                  <span className="font-mono text-[var(--brand)] shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

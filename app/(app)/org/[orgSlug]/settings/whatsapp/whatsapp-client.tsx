"use client";

import * as React from "react";
import { Copy, Check, ExternalLink, QrCode, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";

interface Props {
  orgId:           string;
  orgSlug:         string;
  initialNumber:   string;
  initialGreeting: string;
  isActive:        boolean;
}

function encode(text: string) { return encodeURIComponent(text); }

export function WhatsAppClient({ orgId, orgSlug, initialNumber, initialGreeting, isActive }: Props) {
  const [number,   setNumber]   = React.useState(initialNumber);
  const [greeting, setGreeting] = React.useState(initialGreeting);
  const [saving,   setSaving]   = React.useState(false);
  const [copied,   setCopied]   = React.useState(false);
  const [qrUrl,    setQrUrl]    = React.useState<string | null>(null);
  const [qrLoading,setQrLoading]= React.useState(false);

  const cleanNumber = number.replace(/\D/g, "");
  const clickUrl    = cleanNumber ? `https://wa.me/${cleanNumber}?text=${encode(greeting)}` : "";

  async function handleSave() {
    if (!cleanNumber) { toast({ title: "Enter a valid phone number", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider: "whatsapp",
          config:   { number: cleanNumber, greeting, click_to_chat_url: clickUrl },
          active:   true,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "WhatsApp saved", variant: "success" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(clickUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function generateQr() {
    if (!clickUrl) return;
    setQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(clickUrl, { width: 256, margin: 2 });
      setQrUrl(url);
    } catch { /* ignore */ }
    finally { setQrLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="wa-number">
          WhatsApp Business number <span className="text-[var(--brand)] font-medium">*</span>
        </Label>
        <Input
          id="wa-number"
          placeholder="+91 98765 43210 (with country code)"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <p className="text-[11px] text-[var(--text-3)]">Include country code. e.g. 919876543210</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wa-greeting">
          Pre-filled message <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
        </Label>
        <Textarea
          id="wa-greeting"
          rows={3}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Hi! I saw your content on Instagram and I'm interested in coaching."
        />
        <p className="text-[11px] text-[var(--text-3)]">
          This message is pre-filled when someone taps your link — they can edit before sending.
        </p>
      </div>

      {clickUrl && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Your Click-to-Chat URL</p>
          <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2.5">
            <span className="flex-1 min-w-0 truncate text-sm font-mono text-[var(--text)]">{clickUrl}</span>
            <button
              onClick={copyUrl}
              className="shrink-0 rounded p-1 text-[var(--text-3)] hover:text-[var(--brand)] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--brand)]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a href={clickUrl} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 text-xs text-[var(--brand)] hover:underline min-h-[36px]">
              <ExternalLink className="h-3.5 w-3.5" /> Test link
            </a>
            <button
              onClick={generateQr}
              disabled={qrLoading}
              className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors min-h-[36px]"
            >
              {qrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Generate QR
            </button>
          </div>

          {qrUrl && (
            <div className="flex flex-col items-center gap-2">
              <img src={qrUrl} alt="WhatsApp QR code" className="rounded-[var(--radius)] border border-[var(--border)] w-48 h-48" />
              <a
                href={qrUrl}
                download="whatsapp-qr.png"
                className="text-xs text-[var(--brand)] hover:underline"
              >
                Download QR code
              </a>
            </div>
          )}
        </div>
      )}

      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 text-sm text-[var(--text-3)]">
        <p className="font-medium text-[var(--text-2)] mb-2">How to use</p>
        <ol className="space-y-1.5 text-xs">
          {[
            "Add this link to your Instagram bio",
            "Paste it in your ManyChat flows as the destination URL",
            "Share it in reels/stories: \"DM me or tap the link in bio\"",
            "Hot leads: Effora AI can include it in AI replies automatically",
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-[var(--brand)] shrink-0">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>
      </div>

      <Button variant="primary" onClick={handleSave} disabled={saving || !cleanNumber} className="w-full sm:w-auto gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Saving…" : "Save WhatsApp settings"}
      </Button>
    </div>
  );
}

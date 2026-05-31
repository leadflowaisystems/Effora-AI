"use client";

import * as React from "react";
import { Copy, Check, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch }   from "@/components/ui/switch";
import { toast }    from "@/components/ui/use-toast";

interface Props {
  orgId:     string;
  orgSlug:   string;
  publicUrl: string;
  initial:   Record<string, unknown> | null;
}

export function FunnelSettingsForm({ orgId, orgSlug, publicUrl, initial }: Props) {
  const [form, setForm] = React.useState({
    headline:        (initial?.headline       as string) ?? "Work with me",
    subheadline:     (initial?.subheadline    as string) ?? "",
    offer_desc:      (initial?.offer_desc     as string) ?? "",
    cta_text:        (initial?.cta_text       as string) ?? "Book a Free Call",
    photo_url:       (initial?.photo_url      as string) ?? "",
    video_url:       (initial?.video_url      as string) ?? "",
    pricing_teaser:  (initial?.pricing_teaser as string) ?? "",
    published:       (initial?.published      as boolean) ?? false,
  });
  const [saving,  setSaving]  = React.useState(false);
  const [copied,  setCopied]  = React.useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.headline.trim()) { toast({ title: "Headline is required", variant: "destructive" }); return; }
    if (!form.offer_desc.trim()) { toast({ title: "Offer description is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/funnel-config`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast({ title: "Funnel page saved", variant: "success" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="space-y-6">
      {/* Public URL */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Your funnel page URL</p>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2">
          <span className="flex-1 min-w-0 truncate text-sm font-mono text-[var(--text)]">{publicUrl}</span>
          <button onClick={copyUrl} className="shrink-0 p-1 text-[var(--text-3)] hover:text-[var(--brand)] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center">
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--brand)]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-3)] hover:text-[var(--brand)] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <p className="text-[11px] text-[var(--text-3)]">Add this to your Instagram bio to capture leads 24/7.</p>
      </div>

      {/* Form */}
      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5">
        <div className="space-y-1.5">
          <Label htmlFor="fn-headline">Headline <span className="text-[var(--brand)]">*</span></Label>
          <Input id="fn-headline" maxLength={120} value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Work with me to transform your fitness in 90 days" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fn-sub">Sub-headline <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span></Label>
          <Input id="fn-sub" maxLength={200} value={form.subheadline} onChange={(e) => set("subheadline", e.target.value)} placeholder="Serious about results? Let's talk." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fn-offer">Offer description <span className="text-[var(--brand)]">*</span></Label>
          <Textarea id="fn-offer" rows={4} maxLength={2000} value={form.offer_desc} onChange={(e) => set("offer_desc", e.target.value)} placeholder="Describe your program, who it's for, and what results they'll get…" />
          <p className="text-[11px] text-[var(--text-3)] text-right">{form.offer_desc.length}/2000</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fn-cta">CTA button text <span className="text-[var(--brand)]">*</span></Label>
          <Input id="fn-cta" maxLength={60} value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} placeholder="Book a Free Call" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fn-photo">Profile photo URL <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span></Label>
            <Input id="fn-photo" type="url" value={form.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn-video">Video/Loom URL <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span></Label>
            <Input id="fn-video" type="url" value={form.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fn-pricing">Pricing teaser <span className="text-xs font-normal text-[var(--text-3)]">(optional, shown below offer)</span></Label>
          <Input id="fn-pricing" maxLength={100} value={form.pricing_teaser} onChange={(e) => set("pricing_teaser", e.target.value)} placeholder="Starting from ₹25,000/month" />
        </div>
        <div className="flex items-center gap-3">
          <Switch id="fn-published" checked={form.published} onCheckedChange={(v) => set("published", v)} />
          <Label htmlFor="fn-published" className="cursor-pointer">
            {form.published ? <span className="text-[var(--brand)]">Published — visible to everyone</span> : "Draft — only you can see the page"}
          </Label>
        </div>
      </div>

      <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full sm:w-auto gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {saving ? "Saving…" : "Save funnel page"}
      </Button>
    </div>
  );
}

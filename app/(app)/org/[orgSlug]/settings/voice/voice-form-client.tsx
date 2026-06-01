"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly",     label: "Friendly" },
  { value: "direct",       label: "Direct" },
  { value: "energetic",    label: "Energetic" },
  { value: "empathetic",   label: "Empathetic" },
];

interface VoiceState {
  tone:         string;
  offer:        string;
  price_range:  string;
  sells:        string;
  objections:   string[];
  extra_context:string;
}

interface DeepContextState {
  target_audience:         string;
  transformation_stories:  [string, string, string];
  unique_methodology:      string;
  pricing_philosophy:      string;
  content_pillars:         string;
  calendar_preferences:    string;
  extra_context:           string;
}

interface Props {
  orgId:               string;
  orgSlug:             string;
  initial:             VoiceState | null;
  initialDeepContext?: Record<string, unknown>;
}

export function VoiceProfileForm({ orgId, orgSlug, initial, initialDeepContext }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [savingDeep, setSavingDeep] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [objInput, setObjInput] = useState("");

  const dc = initialDeepContext ?? {};
  const stories = (dc.transformation_stories as string[] | undefined) ?? [];
  const [deepForm, setDeepForm] = useState<DeepContextState>({
    target_audience:        (dc.target_audience as string) ?? "",
    transformation_stories: [stories[0] ?? "", stories[1] ?? "", stories[2] ?? ""],
    unique_methodology:     (dc.unique_methodology as string) ?? "",
    pricing_philosophy:     (dc.pricing_philosophy as string) ?? "",
    content_pillars:        Array.isArray(dc.content_pillars) ? (dc.content_pillars as string[]).join(", ") : ((dc.content_pillars as string) ?? ""),
    calendar_preferences:   (dc.calendar_preferences as string) ?? "",
    extra_context:          (dc.extra_context as string) ?? "",
  });

  const [form, setForm] = useState<VoiceState>({
    tone:          initial?.tone          ?? "professional",
    offer:         initial?.offer         ?? "",
    price_range:   initial?.price_range   ?? "",
    sells:         initial?.sells         ?? "",
    objections:    initial?.objections    ?? [],
    extra_context: initial?.extra_context ?? "",
  });

  function set<K extends keyof VoiceState>(k: K, v: VoiceState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function addObjection() {
    const t = objInput.trim();
    if (!t || form.objections.includes(t)) return;
    set("objections", [...form.objections, t]);
    setObjInput("");
  }

  function removeObjection(obj: string) {
    set("objections", form.objections.filter((o) => o !== obj));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch(`/api/orgs/${orgId}/voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Failed to save");
      }
      toast({ variant: "success", title: "Voice profile saved" });
      router.refresh();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDeep() {
    setSavingDeep(true);
    try {
      const payload = {
        target_audience:        deepForm.target_audience || undefined,
        transformation_stories: deepForm.transformation_stories.filter(Boolean),
        unique_methodology:     deepForm.unique_methodology || undefined,
        pricing_philosophy:     deepForm.pricing_philosophy || undefined,
        content_pillars:        deepForm.content_pillars ? deepForm.content_pillars.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        calendar_preferences:   deepForm.calendar_preferences || undefined,
        extra_context:          deepForm.extra_context || undefined,
      };
      const r = await fetch(`/api/orgs/${orgId}/deep-context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Failed to save");
      }
      toast({ variant: "success", title: "Deep context saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSavingDeep(false);
    }
  }

  return (
    <Card elevated>
      <CardContent className="space-y-5 pt-5">

        {/* Tone */}
        <div className="space-y-1.5">
          <Label>
            Communication tone{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <Select value={form.tone} onValueChange={(v) => set("tone", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose tone…" />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Offer */}
        <div className="space-y-1.5">
          <Label htmlFor="vf-offer">
            What do you offer?{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <Textarea
            id="vf-offer"
            rows={2}
            value={form.offer}
            onChange={(e) => set("offer", e.target.value)}
            placeholder="e.g., 1:1 fitness coaching for busy professionals who want to lose 10kg in 90 days"
          />
        </div>

        {/* Price range */}
        <div className="space-y-1.5">
          <Label htmlFor="vf-price">
            Price range{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <Input
            id="vf-price"
            value={form.price_range}
            onChange={(e) => set("price_range", e.target.value)}
            placeholder="e.g., ₹25,000 – ₹50,000 / month"
          />
        </div>

        {/* What you solve */}
        <div className="space-y-1.5">
          <Label htmlFor="vf-sells">
            What problem do you solve?{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <Textarea
            id="vf-sells"
            rows={2}
            value={form.sells}
            onChange={(e) => set("sells", e.target.value)}
            placeholder="e.g., Busy professionals stuck in poor habits who need accountability"
          />
        </div>

        {/* Objections */}
        <div className="space-y-2">
          <Label>
            Common objections{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              value={objInput}
              onChange={(e) => setObjInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addObjection())}
              placeholder="e.g., Too expensive…"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={addObjection}
              disabled={!objInput.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {form.objections.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {form.objections.map((obj) => (
                <span
                  key={obj}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1 text-xs text-[var(--text-2)]"
                >
                  {obj}
                  <button
                    type="button"
                    onClick={() => removeObjection(obj)}
                    className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Extra context */}
        <div className="space-y-1.5">
          <Label htmlFor="vf-extra">
            Extra context{" "}
            <span className="text-[var(--text-3)] font-normal">(optional)</span>
          </Label>
          <Textarea
            id="vf-extra"
            rows={2}
            value={form.extra_context}
            onChange={(e) => set("extra_context", e.target.value)}
            placeholder="Anything else the AI should know about your style, boundaries, or approach…"
          />
        </div>

        {/* Deep context collapsible */}
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setDeepOpen((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium text-[var(--text)] hover:text-[var(--brand)] transition-colors"
          >
            <span>Deep context <span className="text-xs font-normal text-[var(--text-3)]">(optional — powers Ace copilot)</span></span>
            {deepOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {deepOpen && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dc-audience">Target audience</Label>
                <Textarea id="dc-audience" rows={2} value={deepForm.target_audience}
                  onChange={(e) => setDeepForm((f) => ({ ...f, target_audience: e.target.value }))}
                  placeholder="Who do you serve? Their struggles, desires, demographics…" />
              </div>
              <div className="space-y-1.5">
                <Label>Transformation stories <span className="text-xs font-normal text-[var(--text-3)]">(up to 3)</span></Label>
                {([0,1,2] as const).map((i) => (
                  <Textarea key={i} rows={2} value={deepForm.transformation_stories[i]}
                    onChange={(e) => setDeepForm((f) => {
                      const stories = [...f.transformation_stories] as [string,string,string];
                      stories[i] = e.target.value;
                      return { ...f, transformation_stories: stories };
                    })}
                    placeholder={`Story ${i + 1}: client result or transformation…`} />
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-method">Unique methodology</Label>
                <Input id="dc-method" value={deepForm.unique_methodology}
                  onChange={(e) => setDeepForm((f) => ({ ...f, unique_methodology: e.target.value }))}
                  placeholder="e.g., The 90-Day Blueprint, CLARITY Framework…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-pricing">Pricing philosophy</Label>
                <Input id="dc-pricing" value={deepForm.pricing_philosophy}
                  onChange={(e) => setDeepForm((f) => ({ ...f, pricing_philosophy: e.target.value }))}
                  placeholder="e.g., Value-based, no discounts, payment plans available…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-pillars">Content pillars <span className="text-xs font-normal text-[var(--text-3)]">(comma-separated)</span></Label>
                <Input id="dc-pillars" value={deepForm.content_pillars}
                  onChange={(e) => setDeepForm((f) => ({ ...f, content_pillars: e.target.value }))}
                  placeholder="e.g., Mindset, Nutrition, Accountability, Business" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-calendar">Calendar preferences</Label>
                <Input id="dc-calendar" value={deepForm.calendar_preferences}
                  onChange={(e) => setDeepForm((f) => ({ ...f, calendar_preferences: e.target.value }))}
                  placeholder="e.g., Tue/Thu calls only, no Mondays, IST timezone…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-extra">Extra context</Label>
                <Textarea id="dc-extra" rows={3} value={deepForm.extra_context}
                  onChange={(e) => setDeepForm((f) => ({ ...f, extra_context: e.target.value.slice(0, 2000) }))}
                  placeholder="Anything else Ace should know about you and your business…" />
                <p className="text-[10px] text-[var(--text-3)] text-right">{deepForm.extra_context.length}/2000</p>
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={handleSaveDeep} disabled={savingDeep} className="gap-2">
                  {savingDeep ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Saving…</> : "Save deep context"}
                </Button>
              </div>
            </div>
          )}
        </div>

      </CardContent>

      <CardFooter className="justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/org/${orgSlug}/health`)}
          disabled={saving}
        >
          Back to health
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          {saving ? (
            <>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save changes
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2, MessageSquare, Calendar, CreditCard, Mic,
  Zap, ArrowRight, ArrowLeft, SkipForward, Check, Plus, X,
  Wifi,
} from "lucide-react";

import { StepIndicator } from "@/components/onboarding/step-indicator";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Textarea }   from "@/components/ui/textarea";
import { Badge }      from "@/components/ui/badge";
import { JadeGlow }   from "@/components/atmosphere/grain";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChannelId } from "@/lib/channel/types";

/* ── Types ─────────────────────────────────────────────── */
interface WizardData {
  orgName:         string;
  channel:         ChannelId;
  manychatApiKey:  string;
  calApiKey:       string;
  calBookingUrl:   string;
  calEnabled:      boolean;
  razorpayKeyId:   string;
  razorpaySecret:  string;
  razorpayEnabled: boolean;
  tone:            string;
  offer:           string;
  priceRange:      string;
  sells:           string;
  objections:      string[];
  extraContext:    string;
}

interface Props {
  orgId:     string;
  orgSlug:   string;
  orgName:   string;
  userEmail: string;
}

/* ── Wizard step metadata ───────────────────────────────── */
const STEPS = [
  { label: "Workspace",  icon: Building2  },
  { label: "Channel",    icon: MessageSquare },
  { label: "Cal.com",    icon: Calendar   },
  { label: "Razorpay",   icon: CreditCard },
  { label: "Voice",      icon: Mic        },
] as const;

/* ── Slide variants ─────────────────────────────────────── */
const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 56 : -56,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -56 : 56,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  }),
};

/* ────────────────────────────────────────────────────────
   WIZARD CLIENT
──────────────────────────────────────────────────────── */
export function WizardClient({ orgId, orgSlug, orgName, userEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<WizardData>({
    orgName,
    channel:         "manual",
    manychatApiKey:  "",
    calApiKey:       "",
    calBookingUrl:   "",
    calEnabled:      false,
    razorpayKeyId:   "",
    razorpaySecret:  "",
    razorpayEnabled: false,
    tone:            "professional",
    offer:           "",
    priceRange:      "",
    sells:           "",
    objections:      [],
    extraContext:    "",
  });

  // Objection tag input
  const [objInput, setObjInput] = useState("");

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  /* ── Navigation ─────────────────────────────────────── */
  async function handleNext() {
    setError(null);
    setSaving(true);
    try {
      await saveStep(step, data);
      if (step < STEPS.length - 1) {
        setDir(1);
        setStep((s) => s + 1);
      } else {
        await finish();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
    setError(null);
  }

  function handleSkip() {
    setDir(1);
    setStep((s) => s + 1);
    setError(null);
  }

  /* ── Per-step save ──────────────────────────────────── */
  async function saveStep(stepIdx: number, d: WizardData) {
    switch (stepIdx) {
      case 0: {
        // Save updated org name
        if (d.orgName.trim() && d.orgName !== orgName) {
          const r = await fetch(`/api/orgs/${orgId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: d.orgName.trim() }),
          });
          if (!r.ok) {
            let msg = "Failed to save workspace";
            try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
            throw new Error(msg);
          }
        }
        break;
      }
      case 1: {
        // Save channel selection
        const r = await fetch(`/api/orgs/${orgId}/channel`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: d.channel,
            settings: d.channel === "manychat" && d.manychatApiKey
              ? { api_key: d.manychatApiKey }
              : {},
          }),
        });
        if (!r.ok) {
          let msg = "Failed to save channel";
          try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
          throw new Error(msg);
        }
        break;
      }
      case 2: {
        // Save Cal.com integration (if enabled and key provided)
        if (d.calEnabled && d.calApiKey.trim()) {
          const r = await fetch(`/api/orgs/${orgId}/integrations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "calcom",
              config: {
                api_key:     d.calApiKey.trim(),
                booking_url: d.calBookingUrl.trim(),
              },
              active: true,
            }),
          });
          if (!r.ok) {
            let msg = "Failed to save Cal.com";
            try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
            throw new Error(msg);
          }
        }
        break;
      }
      case 3: {
        // Save Razorpay integration (if enabled and keys provided)
        if (d.razorpayEnabled && d.razorpayKeyId.trim() && d.razorpaySecret.trim()) {
          const r = await fetch(`/api/orgs/${orgId}/integrations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "razorpay",
              config: {
                key_id: d.razorpayKeyId.trim(),
                key_secret: d.razorpaySecret.trim(),
              },
              active: true,
            }),
          });
          if (!r.ok) {
            let msg = "Failed to save Razorpay";
            try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
            throw new Error(msg);
          }
        }
        break;
      }
      case 4: {
        // Save voice profile
        const r = await fetch(`/api/orgs/${orgId}/voice`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tone:          d.tone,
            offer:         d.offer,
            price_range:   d.priceRange,
            sells:         d.sells,
            objections:    d.objections,
            extra_context: d.extraContext,
          }),
        });
        if (!r.ok) {
          let msg = "Failed to save voice profile";
          try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
          throw new Error(msg);
        }
        break;
      }
    }
  }

  async function finish() {
    // Mark onboarding complete
    const r = await fetch(`/api/orgs/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      let msg = "Failed to complete onboarding";
      try { msg = (await r.json()).error ?? msg; } catch { /* non-JSON body */ }
      throw new Error(msg);
    }
    router.push(`/org/${orgSlug}/process`);
  }

  const isLastStep = step === STEPS.length - 1;
  const canSkip = step === 2 || step === 3; // Cal.com and Razorpay are optional

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg)] overflow-y-auto">
      <JadeGlow className="fixed inset-0 pointer-events-none" size="lg" />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--brand)]" />
          <span className="font-display text-sm font-semibold text-[var(--text)]">
            Effora AI
          </span>
        </div>
        <span className="text-xs text-[var(--text-3)]">
          Step {step + 1} of {STEPS.length}
        </span>
      </header>

      {/* ── Body ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pt-6 pb-16">
        <div className="w-full max-w-lg space-y-8">

          {/* Progress */}
          <StepIndicator
            steps={STEPS.map((s) => ({ label: s.label }))}
            currentStep={step}
          />

          {/* Animated step content */}
          <div className="relative overflow-hidden" style={{ minHeight: 380 }}>
            <AnimatePresence custom={dir} mode="wait">
              <motion.div
                key={step}
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {step === 0 && (
                  <StepOrgInfo data={data} set={set} />
                )}
                {step === 1 && (
                  <StepChannel data={data} set={set} />
                )}
                {step === 2 && (
                  <StepCalcom data={data} set={set} />
                )}
                {step === 3 && (
                  <StepRazorpay data={data} set={set} />
                )}
                {step === 4 && (
                  <StepVoice
                    data={data}
                    set={set}
                    objInput={objInput}
                    setObjInput={setObjInput}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-[var(--danger)] text-center">{error}</p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={step === 0 || saving}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>

            <div className="flex items-center gap-2">
              {canSkip && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={saving}
                  className="gap-1.5 text-[var(--text-3)]"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Skip for now
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={handleNext}
                disabled={saving}
                className="gap-2 min-w-[140px]"
              >
                {saving ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Saving…
                  </>
                ) : isLastStep ? (
                  <>
                    <Wifi className="h-4 w-4" />
                    Launch Effora AI
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP COMPONENTS
══════════════════════════════════════════════════════════ */

type SetFn = <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;

/* ── Step 1: Org Info ─────────────────────────────────── */
function StepOrgInfo({ data, set }: { data: WizardData; set: SetFn }) {
  return (
    <StepShell
      icon={<Building2 className="h-5 w-5" />}
      title="Your workspace"
      desc="Confirm your workspace details. You can always change these later."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="w-name">
            Workspace name{" "}
            <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
          </Label>
          <Input
            id="w-name"
            value={data.orgName}
            onChange={(e) => set("orgName", e.target.value)}
            placeholder="My Coaching Business"
          />
        </div>
      </div>
    </StepShell>
  );
}

/* ── Step 2: Channel ──────────────────────────────────── */
const CHANNELS: {
  id: ChannelId;
  name: string;
  desc: string;
  initials: string;
  live: boolean;
  recommended?: boolean;
}[] = [
  {
    id: "manual",
    name: "Manual (In-App)",
    desc: "Manage conversations directly inside Effora AI. No external account needed — works out of the box.",
    initials: "DM",
    live: true,
    recommended: true,
  },
  {
    id: "manychat",
    name: "ManyChat",
    desc: "Connect your ManyChat account for at-scale Instagram automation. Requires a ManyChat Pro plan.",
    initials: "MC",
    live: false,
  },
  {
    id: "meta",
    name: "Meta (Instagram API)",
    desc: "Official Instagram Business API. Requires Meta App review and a Business account.",
    initials: "IG",
    live: false,
  },
];

function StepChannel({ data, set }: { data: WizardData; set: SetFn }) {
  return (
    <StepShell
      icon={<MessageSquare className="h-5 w-5" />}
      title="Instagram DM channel"
      desc="How should Effora AI receive Instagram DMs? You can switch later."
    >
      <div className="space-y-3">
        {CHANNELS.map((ch) => {
          const selected = data.channel === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              disabled={!ch.live}
              onClick={() => ch.live && set("channel", ch.id)}
              className={cn(
                "w-full text-left rounded-[var(--radius-md)] border p-4 transition-all duration-[160ms]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                selected
                  ? "border-[var(--brand)] bg-[rgba(54,230,160,0.06)] shadow-jade"
                  : "border-[var(--border)] bg-[var(--bg-2)] hover:border-[var(--border-strong)]"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Monogram */}
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-mono text-xs font-bold",
                    selected
                      ? "bg-[var(--brand)] text-[#0A0A0C]"
                      : "bg-[var(--bg-3)] text-[var(--text-2)]"
                  )}
                >
                  {ch.initials}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text)]">{ch.name}</span>
                    {ch.recommended && (
                      <Badge variant="hot" className="text-[9px] py-0">Recommended</Badge>
                    )}
                    {!ch.live && (
                      <Badge variant="muted" className="text-[9px] py-0">Coming soon</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-3)] leading-relaxed">{ch.desc}</p>
                </div>

                {/* Checkmark */}
                {selected && (
                  <div className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)]">
                    <Check className="h-3 w-3 text-[#0A0A0C]" />
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* ManyChat API key if selected */}
        {data.channel === "manychat" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-1.5 overflow-hidden"
          >
            <Label htmlFor="mc-key">ManyChat API Key</Label>
            <Input
              id="mc-key"
              type="password"
              value={data.manychatApiKey}
              onChange={(e) => set("manychatApiKey", e.target.value)}
              placeholder="mc-api-key-..."
            />
          </motion.div>
        )}
      </div>
    </StepShell>
  );
}

/* ── Step 3: Cal.com ──────────────────────────────────── */
function StepCalcom({ data, set }: { data: WizardData; set: SetFn }) {
  return (
    <StepShell
      icon={<Calendar className="h-5 w-5" />}
      title="Connect Cal.com"
      desc="Auto-create booking links and sync appointments when a lead is ready to book a discovery call."
      optional
    >
      <div className="space-y-4">
        <ToggleCard
          enabled={data.calEnabled}
          onToggle={(v) => set("calEnabled", v)}
          label="Connect Cal.com"
          desc="Your API key is encrypted before storage — never stored in plain text."
        />

        {data.calEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-3 overflow-hidden"
          >
            <div className="space-y-1.5">
              <Label htmlFor="cal-key">
                Cal.com API Key{" "}
                <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
              </Label>
              <Input
                id="cal-key"
                type="password"
                value={data.calApiKey}
                onChange={(e) => set("calApiKey", e.target.value)}
                placeholder="cal_live_..."
              />
              <p className="text-[11px] text-[var(--text-3)]">
                Find it at cal.com/settings/developer/api-keys
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-booking-url">
                Booking Page URL{" "}
                <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
              </Label>
              <Input
                id="cal-booking-url"
                value={data.calBookingUrl}
                onChange={(e) => set("calBookingUrl", e.target.value)}
                placeholder="https://cal.com/yourname/30min"
              />
              <p className="text-[11px] text-[var(--text-3)]">
                The link Effora AI will include in hot-lead replies
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </StepShell>
  );
}

/* ── Step 4: Razorpay ─────────────────────────────────── */
function StepRazorpay({ data, set }: { data: WizardData; set: SetFn }) {
  return (
    <StepShell
      icon={<CreditCard className="h-5 w-5" />}
      title="Connect Razorpay"
      desc="Accept payments directly from your leads — no separate payment page needed."
      optional
    >
      <div className="space-y-4">
        <ToggleCard
          enabled={data.razorpayEnabled}
          onToggle={(v) => set("razorpayEnabled", v)}
          label="Connect Razorpay"
          desc="Your Key Secret is encrypted before storage."
        />

        {data.razorpayEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-3 overflow-hidden"
          >
            <div className="space-y-1.5">
              <Label htmlFor="rp-id">
                Key ID{" "}
                <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
              </Label>
              <Input
                id="rp-id"
                value={data.razorpayKeyId}
                onChange={(e) => set("razorpayKeyId", e.target.value)}
                placeholder="rzp_live_..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-secret">
                Key Secret{" "}
                <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
              </Label>
              <Input
                id="rp-secret"
                type="password"
                value={data.razorpaySecret}
                onChange={(e) => set("razorpaySecret", e.target.value)}
                placeholder="••••••••••••••••"
              />
            </div>
            <p className="text-[11px] text-[var(--text-3)]">
              Find them at dashboard.razorpay.com/app/website-app-settings/api-keys
            </p>
          </motion.div>
        )}
      </div>
    </StepShell>
  );
}

/* ── Step 5: Voice Profile ────────────────────────────── */
const TONES = [
  { value: "professional", label: "Professional — clear, authoritative, results-focused" },
  { value: "friendly",     label: "Friendly — warm, approachable, conversational" },
  { value: "direct",       label: "Direct — no fluff, straight to the point" },
  { value: "energetic",    label: "Energetic — motivational, high-vibe, inspiring" },
  { value: "empathetic",   label: "Empathetic — nurturing, understanding, supportive" },
];

function StepVoice({
  data,
  set,
  objInput,
  setObjInput,
}: {
  data: WizardData;
  set: SetFn;
  objInput: string;
  setObjInput: (v: string) => void;
}) {
  function addObjection() {
    const trimmed = objInput.trim();
    if (!trimmed || data.objections.includes(trimmed)) return;
    set("objections", [...data.objections, trimmed]);
    setObjInput("");
  }

  function removeObjection(obj: string) {
    set("objections", data.objections.filter((o) => o !== obj));
  }

  return (
    <StepShell
      icon={<Mic className="h-5 w-5" />}
      title="Your coaching voice"
      desc="Help the AI understand how you communicate and what you sell."
    >
      <div className="space-y-4">
        {/* Tone */}
        <div className="space-y-1.5">
          <Label>Communication tone</Label>
          <Select value={data.tone} onValueChange={(v) => set("tone", v)}>
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
          <Label htmlFor="v-offer">What do you offer?</Label>
          <Textarea
            id="v-offer"
            rows={2}
            value={data.offer}
            onChange={(e) => set("offer", e.target.value)}
            placeholder="e.g., 1:1 fitness coaching for busy professionals who want to lose 10kg in 90 days"
          />
        </div>

        {/* Price range */}
        <div className="space-y-1.5">
          <Label htmlFor="v-price">Price range</Label>
          <Input
            id="v-price"
            value={data.priceRange}
            onChange={(e) => set("priceRange", e.target.value)}
            placeholder="e.g., ₹25,000 – ₹50,000 / month"
          />
        </div>

        {/* What you solve */}
        <div className="space-y-1.5">
          <Label htmlFor="v-sells">What problem do you solve?</Label>
          <Textarea
            id="v-sells"
            rows={2}
            value={data.sells}
            onChange={(e) => set("sells", e.target.value)}
            placeholder="e.g., Professionals who are stuck in poor habits and need accountability to build a sustainable routine"
          />
        </div>

        {/* Objections */}
        <div className="space-y-2">
          <Label>Common objections</Label>
          <div className="flex gap-2">
            <Input
              value={objInput}
              onChange={(e) => setObjInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addObjection())}
              placeholder="e.g., I don't have time…"
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
          {data.objections.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {data.objections.map((obj) => (
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
          <p className="text-[11px] text-[var(--text-3)]">
            Press Enter or + to add each objection. The AI uses these to handle pushback naturally.
          </p>
        </div>
      </div>
    </StepShell>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
══════════════════════════════════════════════════════════ */

function StepShell({
  icon,
  title,
  desc,
  optional,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-2)] p-6 space-y-5 shadow-elevated">
      {/* Step heading */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-3)] text-[var(--brand)]">
          {icon}
        </div>
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--text)] leading-tight">
              {title}
            </h2>
            {optional && (
              <Badge variant="muted" className="text-[9px] py-0 shrink-0">Optional</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--text-3)] leading-relaxed">{desc}</p>
        </div>
      </div>

      <div className="border-t border-[var(--border)]" />

      {children}
    </div>
  );
}

function ToggleCard({
  enabled,
  onToggle,
  label,
  desc,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={cn(
        "w-full text-left rounded-[var(--radius-md)] border p-4 transition-all duration-[160ms]",
        enabled
          ? "border-[var(--brand)] bg-[rgba(54,230,160,0.06)]"
          : "border-[var(--border)] bg-[var(--bg-3)] hover:border-[var(--border-strong)]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">{label}</p>
          <p className="text-xs text-[var(--text-3)] mt-0.5">{desc}</p>
        </div>
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-[160ms]",
            enabled
              ? "border-[var(--brand)] bg-[var(--brand)]"
              : "border-[var(--border-strong)] bg-transparent"
          )}
        >
          {enabled && <Check className="h-3 w-3 text-[#0A0A0C]" />}
        </div>
      </div>
    </button>
  );
}

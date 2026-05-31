"use client";

/**
 * /org/[slug]/settings/security — Two-factor authentication (Supabase TOTP MFA)
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shield, ShieldCheck, Smartphone, Copy, Check, AlertTriangle } from "lucide-react";
import Image from "next/image";

export default function SecuritySettingsPage() {
  const supabase = createClient();

  const [factors, setFactors]     = useState<{ id: string; type: string; status: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri]         = useState<string | null>(null);
  const [secret, setSecret]       = useState<string | null>(null);
  const [factorId, setFactorId]   = useState<string | null>(null);
  const [code, setCode]           = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  useEffect(() => {
    loadFactors();
  }, []);

  async function loadFactors() {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFactors((data?.all ?? []) as any as { id: string; type: string; status: string }[]);
    setLoading(false);
  }

  async function startEnroll() {
    setError(null);
    setEnrolling(true);
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (err || !data) {
      setError(err?.message ?? "Could not start 2FA setup. Try again.");
      setEnrolling(false);
      return;
    }
    setQrUri(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setEnrolling(false);
  }

  async function verifyAndEnable() {
    if (!factorId || !code) return;
    setVerifying(true);
    setError(null);

    const { error: challengeErr, data: challengeData } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challengeData) {
      setError(challengeErr?.message ?? "Challenge failed. Try again.");
      setVerifying(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    setVerifying(false);
    if (verifyErr) {
      setError("Invalid code. Check your authenticator app and try again.");
      return;
    }

    setQrUri(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    await loadFactors();
  }

  async function unenroll(id: string) {
    setUnenrolling(true);
    await supabase.auth.mfa.unenroll({ factorId: id });
    setUnenrolling(false);
    await loadFactors();
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const has2FA = verifiedFactors.length > 0;

  if (loading) {
    return (
      <div className="space-y-7">
        <div>
          <div className="h-7 w-40 rounded bg-[var(--bg-3)] animate-pulse" />
          <div className="mt-1 h-4 w-64 rounded bg-[var(--bg-3)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7 max-w-lg">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Security</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Manage two-factor authentication and account security settings.
        </p>
      </div>

      {/* 2FA Status card */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4">
        <div className="flex items-center gap-3">
          {has2FA
            ? <ShieldCheck className="h-5 w-5 text-[var(--brand)]" />
            : <Shield className="h-5 w-5 text-[var(--text-3)]" />
          }
          <div>
            <p className="font-semibold text-[var(--text)]">Two-factor authentication</p>
            <p className="text-xs text-[var(--text-3)]">
              {has2FA
                ? "2FA is enabled. Your account requires a one-time code when signing in."
                : "Add a second layer of security using an authenticator app."
              }
            </p>
          </div>
          {has2FA && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--brand)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--brand)]">
              <ShieldCheck className="h-3 w-3" /> Enabled
            </span>
          )}
        </div>

        {/* Enrolled factors */}
        {verifiedFactors.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
              <Smartphone className="h-4 w-4" />
              Authenticator app
            </div>
            <button
              onClick={() => unenroll(f.id)}
              disabled={unenrolling}
              className="text-xs text-red-400 hover:text-red-500 disabled:opacity-50 transition-colors"
            >
              {unenrolling ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}

        {/* Enroll flow */}
        {!qrUri && !has2FA && (
          <button
            onClick={startEnroll}
            disabled={enrolling}
            className="w-full rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {enrolling ? "Setting up…" : "Enable 2FA"}
          </button>
        )}

        {/* QR code step */}
        {qrUri && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-2)]">
              Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):
            </p>
            <div className="flex justify-center">
              {/* QR URI from Supabase — render as <img> since it's a data: URI */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUri} alt="2FA QR code" className="h-48 w-48 rounded border border-[var(--border)]" />
            </div>

            {secret && (
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-3)]">Or enter this secret manually:</p>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2">
                  <code className="flex-1 font-mono text-xs text-[var(--text-2)] break-all">{secret}</code>
                  <button onClick={copySecret} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
                    {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text)]">
                Enter the 6-digit code from your app <span className="text-[var(--brand)]">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm font-mono tracking-widest placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-[var(--radius)] border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={verifyAndEnable}
                disabled={verifying || code.length !== 6}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {verifying ? "Verifying…" : "Verify and enable"}
              </button>
              <button
                onClick={() => { setQrUri(null); setSecret(null); setFactorId(null); setCode(""); setError(null); }}
                className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--bg-2)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

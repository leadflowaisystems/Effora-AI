export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgForm } from "@/components/org/create-org-form";

export const metadata = { title: "Create your workspace — Effora AI" };

export default async function OnboardingPage() {
  // ── Auth (with timeout so production never hangs) ─────────────
  let userId: string | null = null;
  let userEmail: string | undefined;
  let userName: string | undefined;

  try {
    const supabase = createClient();
    const timeout5s = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));

    const authResult = await Promise.race([
      supabase.auth.getUser(),
      timeout5s,
    ]);

    // null = timeout fired
    const user = (authResult as Awaited<ReturnType<typeof supabase.auth.getUser>> | null)
      ?.data?.user ?? null;

    if (!user) {
      console.warn("[onboarding] auth timeout or no user — redirecting to login");
      redirect("/login");
    }

    userId    = user.id;
    userEmail = user.email;
    userName  = user.user_metadata?.full_name || user.user_metadata?.name;

  } catch (authErr) {
    console.error("[onboarding] auth error:", authErr);
    redirect("/login");
  }

  // ── Check if user already has an org (best-effort, non-blocking) ─
  try {
    const supabase = createClient();
    const orgTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));

    const orgResult = await Promise.race([
      supabase
        .from("org_members")
        .select("org_id, orgs(slug)")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle(),
      orgTimeout,
    ]);

    const slug = (
      orgResult as { data?: { orgs?: { slug?: string } | null } | null } | null
    )?.data?.orgs?.slug ?? null;

    if (slug) {
      // User already has an org — skip onboarding
      redirect(`/org/${slug}`);
    }
  } catch (orgErr) {
    // Non-fatal: if the org check fails or times out, show the onboarding form.
    // The user will create their org via the form below.
    console.warn("[onboarding] org check failed (non-fatal):", orgErr);
  }

  // ── Render onboarding form ────────────────────────────────────
  // CreateOrgForm calls POST /api/orgs and redirects to /org/[slug]/onboarding
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-0,#0A0A0C)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
            Create your workspace
          </h1>
          <p className="text-sm text-[var(--text-3)]">
            You&apos;re in.{userName ? ` Welcome, ${userName.split(" ")[0]}.` : ""} Let&apos;s set up your coaching business.
          </p>
          {userEmail && (
            <p className="text-xs text-[var(--text-3)] mt-1">Signed in as {userEmail}</p>
          )}
        </div>
        <CreateOrgForm />
      </div>
    </main>
  );
}

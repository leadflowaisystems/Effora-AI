/**
 * Root page — the public-facing landing page.
 * Authenticated users are redirected straight to their org.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata = {
  title: "Effora AI — Revenue OS for Instagram Coaches",
  description:
    "Stop losing leads to slow replies, no-shows, and payment ghosting. Effora AI qualifies your DMs, books your calls, and chases your payments while you sleep.",
};

export default async function Home() {
  // If the user is already logged in, send them to their dashboard
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: memberships } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const orgId = (memberships as { org_id: string }[] | null)?.[0]?.org_id;
    if (orgId) {
      const { data: org } = await supabase.from("orgs").select("slug").eq("id", orgId).single();
      const slug = (org as { slug: string } | null)?.slug;
      if (slug) redirect(`/org/${slug}`);
    }
    redirect("/onboarding");
  }

  return <LandingPage />;
}

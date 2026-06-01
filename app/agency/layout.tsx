import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Zap, LayoutGrid, PlusCircle } from "lucide-react";

export const metadata = { title: "Agency — Effora AI" };

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check is_agency flag
  const svc = createServiceClient();
  const { data: flagRow } = await svc
    .from("user_flags").select("is_agency").eq("user_id", user.id).single();

  const isAgency = (flagRow as { is_agency: boolean } | null)?.is_agency ?? false;
  if (!isAgency) redirect("/");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-1)] p-3 gap-0.5">
        <Link href="/agency" className="flex items-center gap-2 px-2 py-1.5 mb-3">
          <Zap className="h-4 w-4 text-[var(--brand)]" />
          <span className="font-display font-bold text-sm">Agency</span>
        </Link>
        <NavLink href="/agency" icon={LayoutGrid} label="All clients" />
        <NavLink href="/agency/onboard-client" icon={PlusCircle} label="Onboard client" />
      </aside>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

function NavLink({ href, icon: Icon, label }: { href: string; icon: React.FC<{ className?: string }>; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

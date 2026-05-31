import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = { title: "Admin — Effora AI" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-1)] px-6 py-3">
        <Link href="/admin" className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--brand)]" />
          <span className="font-display font-bold text-sm">Admin</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-[var(--text-3)]">
          <Link href="/admin"           className="hover:text-[var(--text)] transition-colors">Orgs</Link>
          <Link href="/admin/revenue"   className="hover:text-[var(--text)] transition-colors">Revenue</Link>
          <Link href="/admin/ai-costs"  className="hover:text-[var(--text)] transition-colors">AI Costs</Link>
          <Link href="/admin/waitlist"  className="hover:text-[var(--text)] transition-colors">Waitlist</Link>
          <Link href="/admin/audit-log" className="hover:text-[var(--text)] transition-colors">Audit Log</Link>
          <Link href="/admin/health"             className="hover:text-[var(--text)] transition-colors">Health</Link>
          <Link href="/admin/errors"             className="hover:text-[var(--text)] transition-colors">Errors</Link>
          <Link href="/admin/platform-settings"  className="hover:text-[var(--text)] transition-colors">Platform</Link>
        </nav>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}

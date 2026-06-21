// Force all auth pages to be server-rendered on demand.
// The reset and login pages call createBrowserClient() which requires
// NEXT_PUBLIC_SUPABASE_* env vars. Static prerendering (SSG) on Vercel
// fails when those vars are not present at build time.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

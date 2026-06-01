import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = createClient();

    // Race the auth check against a 5-second timeout.
    // Without this, a slow/hung Supabase auth call on Vercel cold-start
    // will hang the entire layout (and every page under it) indefinitely.
    const timeout5s = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const authResult = await Promise.race([
      supabase.auth.getUser(),
      timeout5s,
    ]);

    // null = timeout fired; no user object = unauthenticated
    const user = (authResult as Awaited<ReturnType<typeof supabase.auth.getUser>> | null)
      ?.data?.user ?? null;

    if (!user) redirect("/login");
  } catch {
    // Any error in auth (network failure, cookie parse error, etc.) → login
    redirect("/login");
  }

  return <>{children}</>;
}

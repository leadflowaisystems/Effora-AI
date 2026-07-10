import { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Data Deletion Status — Effora AI",
  description: "Check the status of a Meta data deletion request.",
};

const CONTACT = "leadflowai.systems@gmail.com";

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const code = searchParams?.id ?? null;

  let status: string | null = null;
  let createdAt: string | null = null;

  if (code) {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (svc as any)
      .from("meta_data_deletion_requests")
      .select("status, created_at")
      .eq("confirmation_code", code)
      .maybeSingle();
    status = data?.status ?? null;
    createdAt = data?.created_at ?? null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="font-display text-lg font-bold text-[var(--brand)]">Effora AI</Link>
          <Link href="/" className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Data Deletion Status</h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">Status of a data deletion request submitted via Meta.</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-3">
          {!code && (
            <p className="text-sm text-[var(--text-2)]">No confirmation code was provided.</p>
          )}
          {code && !status && (
            <p className="text-sm text-[var(--text-2)]">No request found for confirmation code <strong>{code}</strong>.</p>
          )}
          {code && status && (
            <>
              <p className="text-sm text-[var(--text-2)]">
                Confirmation code: <strong>{code}</strong>
              </p>
              <p className="text-sm text-[var(--text-2)]">
                Status: <strong>{status === "completed" ? "Completed" : "Pending"}</strong>
              </p>
              {createdAt && (
                <p className="text-sm text-[var(--text-3)]">
                  Requested on {new Date(createdAt).toDateString()}.
                </p>
              )}
              <p className="text-sm text-[var(--text-3)] mt-2">
                We process data deletion requests within 30 days.
              </p>
            </>
          )}
        </div>

        <p className="text-sm text-[var(--text-3)]">
          Questions? Contact <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> · <Link href="/data-deletion" className="text-[var(--brand)] underline">Data Deletion Instructions</Link>
        </p>
      </main>
    </div>
  );
}

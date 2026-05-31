"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugEdited) setSlug(slugify(val));
  }

  function handleSlugChange(val: string) {
    setSlugEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    // Redirect into the onboarding wizard (not the dashboard)
    router.push(`/org/${data.org.slug}/onboarding`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="org-name">Workspace name</Label>
        <Input
          id="org-name"
          type="text"
          required
          minLength={2}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Coaching Business"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-slug">URL slug</Label>
        <div className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--brand)] focus-within:border-[var(--brand)] transition-colors">
          <span className="bg-[var(--bg-3)] px-3 py-2 text-xs text-[var(--text-3)] border-r border-[var(--border)] select-none whitespace-nowrap">
            Effora AI.app/org/
          </span>
          <input
            id="org-slug"
            type="text"
            required
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="my-coaching-biz"
            pattern="[a-z0-9-]+"
            className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading || !name || !slug}
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Creating…
          </>
        ) : (
          "Create workspace →"
        )}
      </Button>
    </form>
  );
}

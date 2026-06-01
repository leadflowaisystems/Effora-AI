"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { toast }  from "@/components/ui/use-toast";

interface Props {
  orgId:          string;
  orgSlug:        string;
  initialCalLink: string;
}

export function CalSettingsForm({ orgId, orgSlug, initialCalLink }: Props) {
  const router  = useRouter();
  const [link,   setLink]   = React.useState(initialCalLink);
  const [saving, setSaving] = React.useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider: "calcom",
          config:   { cal_link: link.trim() },
          active:   !!link.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Failed to save");
      }
      toast({ title: "Saved", description: "Cal.com link updated.", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title:       "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant:     "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cal-link">
          Your Cal.com booking URL{" "}
          <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
        </Label>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
          <Input
            id="cal-link"
            type="url"
            placeholder="https://cal.com/yourname/discovery"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-[var(--text-3)]">
          The AI includes this link when a lead scores hot and is ready to book.
        </p>
      </div>

      <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : (
          <><Check className="h-4 w-4" /> Save link</>
        )}
      </Button>
    </form>
  );
}

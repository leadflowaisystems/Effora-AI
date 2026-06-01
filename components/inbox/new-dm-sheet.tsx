"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label }    from "@/components/ui/label";
import { toast }    from "@/components/ui/use-toast";

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  orgId:        string;
  orgSlug:      string;
}

export function NewDmSheet({ open, onOpenChange, orgId, orgSlug }: Props) {
  const router   = useRouter();
  const [name,    setName]    = React.useState("");
  const [handle,  setHandle]  = React.useState("");
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/inbox/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ senderName: name, senderHandle: handle, content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");

      toast({ title: "DM queued", description: "AI is qualifying the lead…", variant: "success" });
      onOpenChange(false);
      setName(""); setHandle(""); setContent("");
      router.push(`/org/${orgSlug}/inbox/${json.conversationId}`);
      router.refresh();
    } catch (err) {
      toast({
        title:   "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md overflow-hidden">
        {/* Sticky header */}
        <SheetHeader className="shrink-0 border-b border-[var(--border)] px-5 py-4">
          <SheetTitle>Simulate a DM</SheetTitle>
          <SheetDescription>
            Sends a manual test message through the AI pipeline — qualify, score, and draft a reply.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-4 px-5 py-5">
            {/* Sender name + handle — stacked on mobile, side-by-side on sm+ */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sender-name">
                  Sender name{" "}
                  <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
                </Label>
                <Input
                  id="sender-name"
                  placeholder="Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sender-handle">
                  Handle / ID{" "}
                  <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
                </Label>
                <Input
                  id="sender-handle"
                  placeholder="@priya_fitness"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">
                Message{" "}
                <span className="text-[var(--brand)] font-medium">*</span>
              </Label>
              <Textarea
                id="content"
                placeholder="Hi! I saw your post about scaling to ₹1L/month. I'm a fitness coach doing about ₹20k right now. Can we talk?"
                className="min-h-[120px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="shrink-0 flex flex-col sm:flex-row sm:justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="w-full sm:w-auto gap-2"
              disabled={loading || !content.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send DM
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

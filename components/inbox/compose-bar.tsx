"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Send, Loader2, Smile, ImagePlus, X } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { cn }       from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { InboxMessage } from "@/types/inbox";

// Lazy-load emoji picker so it doesn't bloat the initial bundle
const EmojiPicker = dynamic(
  () => import("@emoji-mart/react").then((m) => m.default),
  { ssr: false },
);

interface Props {
  orgId:    string;
  convId:   string;
  onSent:   (msg: InboxMessage) => void;
  disabled?: boolean;
}

export function ComposeBar({ orgId, convId, onSent, disabled }: Props) {
  const [text,         setText]         = React.useState("");
  const [loading,      setLoading]      = React.useState(false);
  const [showEmoji,    setShowEmoji]    = React.useState(false);
  const [imageFile,    setImageFile]    = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [uploading,    setUploading]    = React.useState(false);

  const textareaRef  = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const emojiRef     = React.useRef<HTMLDivElement>(null);
  const { toast }    = useToast();

  // Auto-grow textarea
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // Close emoji picker on outside click
  React.useEffect(() => {
    if (!showEmoji) return;
    function handler(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji]);

  function handleEmojiSelect(emoji: { native: string }) {
    const el = textareaRef.current;
    if (!el) { setText((t) => t + emoji.native); return; }
    const start = el.selectionStart ?? text.length;
    const end   = el.selectionEnd   ?? text.length;
    const next  = text.slice(0, start) + emoji.native + text.slice(end);
    setText(next);
    // Restore cursor after state update
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.native.length;
      el.setSelectionRange(pos, pos);
      autoGrow(el);
    });
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 8 MB", variant: "destructive" });
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  async function send() {
    const content = text.trim();
    if ((!content && !imageFile) || loading) return;
    setLoading(true);
    try {
      let attachmentUrl: string | undefined;

      // Upload image first if one is queued
      if (imageFile) {
        setUploading(true);
        const form = new FormData();
        form.append("file", imageFile);
        const upRes = await fetch(`/api/orgs/${orgId}/conversations/${convId}/upload-attachment`, {
          method: "POST",
          body:   form,
        });
        setUploading(false);
        if (!upRes.ok) {
          const upJson = await upRes.json().catch(() => ({})) as { error?: string };
          throw new Error(upJson.error ?? "Image upload failed");
        }
        const upData = await upRes.json() as { url: string };
        attachmentUrl = upData.url;
      }

      const res = await fetch(`/api/orgs/${orgId}/conversations/${convId}/reply`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content, attachment_url: attachmentUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");

      setText("");
      clearImage();
      if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

      const sentAt = json.message.sent_at as string;
      onSent({
        id:        json.message.id,
        direction: "outbound",
        content:   content || (attachmentUrl ? "📷 Image" : ""),
        sent_at:   sentAt,
        metadata:  { source: "manual", attachment_url: attachmentUrl ?? null },
      });

      // Optimistic sort: move conversation to top immediately, before realtime fires
      window.dispatchEvent(new CustomEvent("conversation-updated", {
        detail: { convId, timestamp: sentAt },
      }));

      // Surface delivery failures
      if (json.delivery_failed) {
        const reason = json.delivery_error ?? "unknown";
        if (reason === "meta_permission_development_mode") {
          toast({
            title:       "Instagram blocked — App Review required",
            description: "Your Meta app is in Development Mode. Only App testers can receive messages.",
            variant:     "destructive",
          });
        } else if (reason === "outside_24h_window") {
          toast({
            title:       "Message saved — 24h window expired",
            description: "Instagram only allows replies within 24h of the lead's last message.",
            variant:     "destructive",
          });
        } else {
          toast({
            title:       "Message saved but not delivered",
            description: `Instagram delivery failed: ${reason}`,
            variant:     "destructive",
          });
        }
      }

      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      setUploading(false);
      console.error("[compose]", err);
      toast({
        title:       "Failed to send",
        description: err instanceof Error ? err.message : "Please try again.",
        variant:     "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  const canSend = (!!text.trim() || !!imageFile) && !loading;

  return (
    <div className={cn(
      "relative shrink-0 border-t border-[var(--border)] bg-[var(--bg-1)]",
      disabled && "opacity-50 pointer-events-none",
    )}>
      {/* Image preview strip */}
      {imagePreview && (
        <div className="flex items-center gap-2 px-3 pt-3">
          <div className="relative inline-flex shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-lg object-cover border border-[var(--border)]"
            />
            <button
              onClick={clearImage}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-3)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
              aria-label="Remove image"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
          {uploading && (
            <span className="text-xs text-[var(--text-3)] flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
            </span>
          )}
        </div>
      )}

      {/* Main compose row */}
      <div className="flex items-end gap-1.5 px-3 py-2.5">
        {/* Emoji picker trigger */}
        <div className="relative" ref={emojiRef}>
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--text)]",
              showEmoji && "bg-[var(--bg-3)] text-[var(--text)]",
            )}
            aria-label="Emoji picker"
          >
            <Smile className="h-4.5 w-4.5" />
          </button>

          {/* Emoji picker popover */}
          {showEmoji && (
            <div className="absolute bottom-10 left-0 z-50 shadow-xl rounded-xl overflow-hidden">
              <EmojiPicker
                data={async () => {
                  const m = await import("@emoji-mart/data");
                  return m.default;
                }}
                onEmojiSelect={handleEmojiSelect}
                theme="dark"
                previewPosition="none"
                skinTonePosition="none"
                set="native"
                perLine={8}
              />
            </div>
          )}
        </div>

        {/* Image attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--text)]"
          aria-label="Attach image"
        >
          <ImagePlus className="h-4.5 w-4.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
          className="sr-only"
          onChange={handleImageSelect}
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
          onKeyDown={handleKeyDown}
          placeholder={imageFile ? "Add a caption…" : "Message…"}
          rows={1}
          className={cn(
            "flex-1 min-h-[36px] max-h-[160px] resize-none rounded-2xl border border-[var(--border)]",
            "bg-[var(--bg-2)] px-3.5 py-2 text-sm leading-relaxed text-[var(--text)]",
            "placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--brand)]/50",
            "transition-colors scrollbar-thin",
          )}
          style={{ height: "36px" }}
        />

        {/* Send button */}
        <Button
          size="icon"
          variant="primary"
          disabled={!canSend}
          onClick={send}
          aria-label="Send"
          className="h-9 w-9 shrink-0 rounded-full"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="px-4 pb-1.5 text-[10px] text-[var(--text-3)]">
        Ctrl+Enter to send
      </p>
    </div>
  );
}

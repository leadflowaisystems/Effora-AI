import type { LeadStage } from "./database";

export interface InboxLead {
  id:         string;
  name:       string | null;
  external_id: string;
  channel:    string;
  score:      number;
  stage:      LeadStage;
  avatar_url: string | null;
  created_at?: string;
}

export interface InboxConversation {
  id:                   string;
  channel_provider:     string;
  last_message_at:      string | null;
  last_message_preview: string | null;
  hasPendingDraft:      boolean;
  lead:                 InboxLead | null;
}

export interface InboxMessage {
  id:        string;
  direction: "inbound" | "outbound";
  content:   string;
  sent_at:   string;
  metadata?: { source?: string; model?: string; [key: string]: unknown };
  /** Provider delivery state (migration 038). Null until a callback arrives. */
  status?:         "pending" | "sent" | "delivered" | "read" | "failed" | null;
  /** Short provider failure description when status is "failed". */
  failure_reason?: string | null;
}

export interface InboxDraft {
  id:             string;
  content:        string;
  status:         "pending" | "approved" | "sent" | "rejected" | "edited";
  edited_content: string | null;
  created_at:     string;
}

export interface ThreadData {
  conversation: {
    id:               string;
    channel_provider: string;
    last_message_at:  string | null;
    lead:             InboxLead | null;
  };
  messages:     InboxMessage[];
  pendingDraft: InboxDraft | null;
}

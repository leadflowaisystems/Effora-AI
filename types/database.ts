export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          slug: string;
          name: string;
          plan: "trial" | "starter" | "growth" | "pro" | "cancelled";
          ai_tokens_used: number;
          ai_cost_inr: number;
          active_channel: string;
          channel_config: Json;
          onboarding_completed_at: string | null;
          auto_send_replies: boolean;
          created_at: string;
          trial_ends_at: string;
          subscription_id: string | null;
          subscription_status: string;
          current_period_end: string | null;
          monthly_ai_msg_count: number;
          ai_msgs_reset_at: string;
          agency_owner_id: string | null;
          referral_code: string | null;
          referred_by: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          plan?: string;
          ai_tokens_used?: number;
          ai_cost_inr?: number;
          active_channel?: string;
          channel_config?: Json;
          onboarding_completed_at?: string | null;
          auto_send_replies?: boolean;
          created_at?: string;
          trial_ends_at?: string;
          subscription_id?: string | null;
          subscription_status?: string;
          current_period_end?: string | null;
          monthly_ai_msg_count?: number;
          ai_msgs_reset_at?: string;
          agency_owner_id?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          plan?: string;
          ai_tokens_used?: number;
          ai_cost_inr?: number;
          active_channel?: string;
          channel_config?: Json;
          onboarding_completed_at?: string | null;
          auto_send_replies?: boolean;
          created_at?: string;
          trial_ends_at?: string;
          subscription_id?: string | null;
          subscription_status?: string;
          current_period_end?: string | null;
          monthly_ai_msg_count?: number;
          ai_msgs_reset_at?: string;
          agency_owner_id?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      funnel_configs: {
        Row:    { org_id: string; headline: string; subheadline: string; offer_desc: string; cta_text: string; photo_url: string | null; video_url: string | null; pricing_teaser: string | null; published: boolean; updated_at: string };
        Insert: { org_id: string; headline?: string; subheadline?: string; offer_desc?: string; cta_text?: string; photo_url?: string | null; video_url?: string | null; pricing_teaser?: string | null; published?: boolean; updated_at?: string };
        Update: { org_id?: string; headline?: string; subheadline?: string; offer_desc?: string; cta_text?: string; photo_url?: string | null; video_url?: string | null; pricing_teaser?: string | null; published?: boolean; updated_at?: string };
        Relationships: [];
      };
      user_push_subscriptions: {
        Row:    { id: string; org_id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string };
        Insert: { id?: string; org_id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at?: string };
        Update: { id?: string; org_id?: string; user_id?: string; endpoint?: string; p256dh?: string; auth?: string; created_at?: string };
        Relationships: [];
      };
      process_screenshots: {
        Row:    { id: string; org_id: string; user_id: string | null; threads_found: number; drafts_generated: number; ai_calls_used: number; created_at: string };
        Insert: { id?: string; org_id: string; user_id?: string | null; threads_found?: number; drafts_generated?: number; ai_calls_used?: number; created_at?: string };
        Update: { id?: string; org_id?: string; user_id?: string | null; threads_found?: number; drafts_generated?: number; ai_calls_used?: number; created_at?: string };
        Relationships: [];
      };
      error_log: {
        Row: {
          id:            string;
          org_id:        string | null;
          user_id:       string | null;
          route:         string | null;
          error_message: string;
          stack:         string | null;
          created_at:    string;
        };
        Insert: {
          id?:           string;
          org_id?:       string | null;
          user_id?:      string | null;
          route?:        string | null;
          error_message: string;
          stack?:        string | null;
          created_at?:   string;
        };
        Update: {
          id?:           string;
          org_id?:       string | null;
          user_id?:      string | null;
          route?:        string | null;
          error_message?: string;
          stack?:        string | null;
          created_at?:   string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string | null;
          user_id: string | null;
          event: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          user_id?: string | null;
          event: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string | null;
          user_id?: string | null;
          event?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_flags: {
        Row: {
          user_id: string;
          is_agency: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          is_agency?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          is_agency?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      org_members: {
        Row: {
          org_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          created_at: string;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string;
          org_id: string;
          provider: string;
          config: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          provider: string;
          config?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          provider?: string;
          config?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_profiles: {
        Row: {
          id: string;
          org_id: string;
          tone: string;
          offer: string;
          price_range: string;
          sells: string;
          objections: Json;
          extra_context: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tone?: string;
          offer?: string;
          price_range?: string;
          sells?: string;
          objections?: Json;
          extra_context?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          tone?: string;
          offer?: string;
          price_range?: string;
          sells?: string;
          objections?: Json;
          extra_context?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          org_id: string;
          channel: string;
          external_id: string;
          name: string | null;
          avatar_url: string | null;
          score: number;
          stage: "cold" | "warm" | "hot" | "booking_sent" | "booked" | "qualified" | "won" | "paid" | "churned";
          source: string;
          instagram_handle: string | null;
          metadata: Json;
          last_seen_at: string;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          channel?: string;
          external_id?: string;
          name?: string | null;
          avatar_url?: string | null;
          score?: number;
          stage?: "cold" | "warm" | "hot" | "booking_sent" | "booked" | "qualified" | "won" | "paid" | "churned";
          source?: string;
          instagram_handle?: string | null;
          metadata?: Json;
          last_seen_at?: string;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          channel?: string;
          external_id?: string;
          name?: string | null;
          avatar_url?: string | null;
          score?: number;
          stage?: "cold" | "warm" | "hot" | "booking_sent" | "booked" | "qualified" | "won" | "paid" | "churned";
          source?: string;
          instagram_handle?: string | null;
          metadata?: Json;
          last_seen_at?: string;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          org_id: string;
          lead_id: string;
          channel_provider: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          lead_id: string;
          channel_provider?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          lead_id?: string;
          channel_provider?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          org_id: string;
          direction: "inbound" | "outbound";
          content: string;
          sent_at: string;
          provider_message_id: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          org_id: string;
          direction: "inbound" | "outbound";
          content: string;
          sent_at?: string;
          provider_message_id?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          org_id?: string;
          direction?: "inbound" | "outbound";
          content?: string;
          sent_at?: string;
          provider_message_id?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      ai_drafts: {
        Row: {
          id: string;
          conversation_id: string;
          org_id: string;
          message_id: string | null;
          content: string;
          status: "pending" | "approved" | "sent" | "rejected" | "edited";
          edited_content: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          org_id: string;
          message_id?: string | null;
          content: string;
          status?: "pending" | "approved" | "sent" | "rejected" | "edited";
          edited_content?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          org_id?: string;
          message_id?: string | null;
          content?: string;
          status?: "pending" | "approved" | "sent" | "rejected" | "edited";
          edited_content?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          id: string;
          org_id: string;
          month: string;
          tokens_in: number;
          tokens_out: number;
          cost_inr: number;
        };
        Insert: {
          id?: string;
          org_id: string;
          month: string;
          tokens_in?: number;
          tokens_out?: number;
          cost_inr?: number;
        };
        Update: {
          id?: string;
          org_id?: string;
          month?: string;
          tokens_in?: number;
          tokens_out?: number;
          cost_inr?: number;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          org_id: string;
          lead_id: string;
          conversation_id: string | null;
          cal_event_id: string | null;
          cal_booking_uid: string | null;
          attendee_name: string | null;
          attendee_email: string | null;
          meeting_url: string | null;
          status: "pending" | "confirmed" | "no_show" | "completed" | "cancelled";
          starts_at: string | null;
          ends_at: string | null;
          recovery_attempt: number;
          recovery_sent_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          lead_id: string;
          conversation_id?: string | null;
          cal_event_id?: string | null;
          cal_booking_uid?: string | null;
          attendee_name?: string | null;
          attendee_email?: string | null;
          meeting_url?: string | null;
          status?: "pending" | "confirmed" | "no_show" | "completed" | "cancelled";
          starts_at?: string | null;
          ends_at?: string | null;
          recovery_attempt?: number;
          recovery_sent_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          lead_id?: string;
          conversation_id?: string | null;
          cal_event_id?: string | null;
          cal_booking_uid?: string | null;
          attendee_name?: string | null;
          attendee_email?: string | null;
          meeting_url?: string | null;
          status?: "pending" | "confirmed" | "no_show" | "completed" | "cancelled";
          starts_at?: string | null;
          ends_at?: string | null;
          recovery_attempt?: number;
          recovery_sent_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          org_id: string;
          lead_id: string;
          conversation_id: string | null;
          amount_inr: number;
          status: "pending" | "paid" | "failed" | "refunded";
          payment_link_id: string | null;
          payment_link_url: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          lead_id: string;
          conversation_id?: string | null;
          amount_inr?: number;
          status?: "pending" | "paid" | "failed" | "refunded";
          payment_link_id?: string | null;
          payment_link_url?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          lead_id?: string;
          conversation_id?: string | null;
          amount_inr?: number;
          status?: "pending" | "paid" | "failed" | "refunded";
          payment_link_id?: string | null;
          payment_link_url?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sequence_runs: {
        Row: {
          id: string;
          org_id: string;
          lead_id: string;
          conversation_id: string | null;
          type: "dunning" | "ghost_revival";
          status: "active" | "completed" | "stopped" | "flagged";
          step_current: number;
          step_total: number;
          metadata: Json;
          started_at: string;
          updated_at: string;
          stopped_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          lead_id: string;
          conversation_id?: string | null;
          type: "dunning" | "ghost_revival";
          status?: "active" | "completed" | "stopped" | "flagged";
          step_current?: number;
          step_total?: number;
          metadata?: Json;
          started_at?: string;
          updated_at?: string;
          stopped_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          lead_id?: string;
          conversation_id?: string | null;
          type?: "dunning" | "ghost_revival";
          status?: "active" | "completed" | "stopped" | "flagged";
          step_current?: number;
          step_total?: number;
          metadata?: Json;
          started_at?: string;
          updated_at?: string;
          stopped_at?: string | null;
        };
        Relationships: [];
      };
      sequences: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          trigger: string;
          steps: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          trigger: string;
          steps?: Json;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          trigger?: string;
          steps?: Json;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      metrics_daily: {
        Row: {
          id:                  string;
          org_id:              string;
          date:                string;
          dms_received:        number;
          leads_qualified:     number;
          leads_booked:        number;
          leads_showed:        number;
          leads_paid:          number;
          revenue_paid_inr:    number;
          revenue_dunning_inr: number;
          revenue_revival_inr: number;
          revenue_noshow_inr:  number;
          pipeline_inr:        number;
          speed_sum_ms:        number;
          speed_count:         number;
          messages_ai:         number;
          tokens_used:         number;
          source_breakdown:    Json;
          created_at:          string;
          updated_at:          string;
        };
        Insert: {
          id?:                  string;
          org_id:               string;
          date:                 string;
          dms_received?:        number;
          leads_qualified?:     number;
          leads_booked?:        number;
          leads_showed?:        number;
          leads_paid?:          number;
          revenue_paid_inr?:    number;
          revenue_dunning_inr?: number;
          revenue_revival_inr?: number;
          revenue_noshow_inr?:  number;
          pipeline_inr?:        number;
          speed_sum_ms?:        number;
          speed_count?:         number;
          messages_ai?:         number;
          tokens_used?:         number;
          source_breakdown?:    Json;
          created_at?:          string;
          updated_at?:          string;
        };
        Update: {
          id?:                  string;
          org_id?:              string;
          date?:                string;
          dms_received?:        number;
          leads_qualified?:     number;
          leads_booked?:        number;
          leads_showed?:        number;
          leads_paid?:          number;
          revenue_paid_inr?:    number;
          revenue_dunning_inr?: number;
          revenue_revival_inr?: number;
          revenue_noshow_inr?:  number;
          pipeline_inr?:        number;
          speed_sum_ms?:        number;
          speed_count?:         number;
          messages_ai?:         number;
          tokens_used?:         number;
          source_breakdown?:    Json;
          created_at?:          string;
          updated_at?:          string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          org_id: string;
          type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_org_member: { Args: { check_org_id: string }; Returns: boolean };
      is_org_owner:  { Args: { check_org_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// ── Convenience row types ──────────────────────────────────
export type Org           = Database["public"]["Tables"]["orgs"]["Row"];
export type OrgMember     = Database["public"]["Tables"]["org_members"]["Row"];
export type Integration   = Database["public"]["Tables"]["integrations"]["Row"];
export type VoiceProfile  = Database["public"]["Tables"]["voice_profiles"]["Row"];
export type Lead          = Database["public"]["Tables"]["leads"]["Row"];
export type Conversation  = Database["public"]["Tables"]["conversations"]["Row"];
export type Message       = Database["public"]["Tables"]["messages"]["Row"];
export type AiDraft       = Database["public"]["Tables"]["ai_drafts"]["Row"];
export type AiUsage       = Database["public"]["Tables"]["ai_usage"]["Row"];
export type Booking       = Database["public"]["Tables"]["bookings"]["Row"];
export type Payment       = Database["public"]["Tables"]["payments"]["Row"];
export type SequenceRun   = Database["public"]["Tables"]["sequence_runs"]["Row"];
export type Sequence      = Database["public"]["Tables"]["sequences"]["Row"];
export type MetricsDaily  = Database["public"]["Tables"]["metrics_daily"]["Row"];
export type OrgEvent      = Database["public"]["Tables"]["events"]["Row"];

// ── Lead stage ─────────────────────────────────────────────
export type LeadStage = Lead["stage"];

-- 028_automation_intake.sql
-- Stores each coach's automation preferences/intake answers.
-- One row per org (upsert on org_id).

create table if not exists automation_intake (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references orgs(id) on delete cascade,

  -- Business / Offer
  what_you_sell         text,
  ideal_customer        text,
  avg_price             text,

  -- Lead Qualification
  qualifies_lead        text,
  disqualifies_lead     text,

  -- Booking Flow
  booking_reminder_tone text,
  preferred_tone        text,

  -- Payment Flow
  payment_reminder_tone text,
  payment_reminder_freq text,

  -- FAQ
  common_questions      text,
  common_objections     text,

  -- Escalation Rules
  escalation_rules      text,

  -- Additional
  additional_notes      text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One intake record per org
create unique index if not exists automation_intake_org_id_idx
  on automation_intake(org_id);

-- RLS
alter table automation_intake enable row level security;

-- Org members may read/write their own org's intake
create policy "org member can manage automation_intake"
  on automation_intake
  for all
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = automation_intake.org_id
        and org_members.user_id = auth.uid()
    )
  );

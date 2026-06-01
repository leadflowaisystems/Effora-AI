/**
 * GET /api/orgs/[orgId]/email-preview?template=bookingConfirmation
 * Returns { subject, html } for a preview with sample data.
 *
 * POST /api/orgs/[orgId]/email-preview   { template, sendTo }
 * Sends a test email to sendTo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  bookingConfirmation, bookingReminder24h, paymentLink,
  paymentReceived, dunningEmail, revivalNudge,
} from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role").eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const SAMPLE: Record<string, { subject: string; html: string }> = {
  bookingConfirmation: {
    subject: "Your call with Your Coach is confirmed — Friday, 6 Jun at 3:00 PM",
    html: bookingConfirmation({ leadName: "Priya", meetingTime: "Friday, 6 Jun at 3:00 PM IST", meetingUrl: "https://cal.com/coach/30min", coachName: "Your Coach" }),
  },
  bookingReminder24h: {
    subject: "Reminder: your call is tomorrow",
    html: bookingReminder24h({ leadName: "Priya", meetingTime: "Friday, 6 Jun at 3:00 PM IST", meetingUrl: "https://cal.com/coach/30min", coachName: "Your Coach" }),
  },
  paymentLink: {
    subject: "Your payment link is ready",
    html: paymentLink({ leadName: "Priya", amount: "₹15,000", description: "3-month coaching program", paymentUrl: "https://rzp.io/l/example", coachName: "Your Coach" }),
  },
  paymentReceived: {
    subject: "Payment received — welcome!",
    html: paymentReceived({ leadName: "Priya", amount: "₹15,000", description: "3-month coaching program", coachName: "Your Coach" }),
  },
  dunningEmail: {
    subject: "Payment reminder",
    html: dunningEmail({ leadName: "Priya", daysOverdue: 3, paymentUrl: "https://rzp.io/l/example", coachName: "Your Coach" }),
  },
  revivalNudge: {
    subject: "Still interested in the program?",
    html: revivalNudge({ leadName: "Priya", programName: "3-month coaching", ctaUrl: "https://cal.com/coach/30min", coachName: "Your Coach" }),
  },
};

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const template = req.nextUrl.searchParams.get("template") ?? "bookingConfirmation";
  const preview  = SAMPLE[template] ?? SAMPLE.bookingConfirmation;
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body     = await req.json().catch(() => ({}));
  const template = (body.template as string) ?? "bookingConfirmation";
  const sendTo   = (body.sendTo as string) ?? user.email;
  if (!sendTo) return NextResponse.json({ error: "No email address" }, { status: 400 });
  const preview  = SAMPLE[template] ?? SAMPLE.bookingConfirmation;
  await sendEmail({ to: sendTo, subject: `[Test] ${preview.subject}`, html: preview.html, orgId: params.orgId, template: `preview_${template}` });
  return NextResponse.json({ ok: true, sentTo: sendTo });
}

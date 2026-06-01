/**
 * lib/milestones.ts — detect and record achievement milestones.
 */
import { createServiceClient } from "@/lib/supabase/server";

export interface Milestone {
  type:  string;
  value: number;
  label: string;
}

const LEAD_MILESTONES    = [1, 10, 25, 50, 100, 250, 500];
const REVENUE_MILESTONES = [10000, 50000, 100000, 500000, 1000000]; // in INR

export async function detectMilestones(orgId: string): Promise<Milestone[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const [leadsRes, paymentsRes, existingRes] = await Promise.all([
    svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "paid"),
    svc.from("milestones").select("type, value").eq("org_id", orgId),
  ]);

  const leadCount   = leadsRes.count   ?? 0;
  const totalRevInr = ((paymentsRes.data ?? []) as { amount_inr: number }[]).reduce((s: number, r: { amount_inr: number }) => s + r.amount_inr, 0);
  const existing    = new Set(
    ((existingRes.data ?? []) as { type: string; value: number }[]).map((m) => `${m.type}:${m.value}`)
  );

  const newMilestones: Milestone[] = [];

  for (const n of LEAD_MILESTONES) {
    const key = `leads:${n}`;
    if (leadCount >= n && !existing.has(key)) {
      newMilestones.push({ type: "leads", value: n, label: n === 1 ? "First lead added to CRM." : `${n} leads in CRM.` });
    }
  }

  for (const r of REVENUE_MILESTONES) {
    const key = `revenue:${r}`;
    if (totalRevInr >= r && !existing.has(key)) {
      const fmt = r >= 100000 ? `₹${(r / 100000).toFixed(0)}L` : `₹${(r / 1000).toFixed(0)}k`;
      newMilestones.push({ type: "revenue", value: r, label: `${fmt} collected. Consistent.` });
    }
  }

  if (newMilestones.length > 0) {
    await svc.from("milestones").insert(
      newMilestones.map((m) => ({
        org_id:      orgId,
        type:        m.type,
        value:       m.value,
        achieved_at: new Date().toISOString(),
        metadata:    { label: m.label },
      }))
    );
  }

  return newMilestones;
}

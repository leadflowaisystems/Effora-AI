/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import * as React from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar,
} from "recharts";
import { cn } from "@/lib/utils";

interface Lead    { created_at: string; source?: string | null; stage?: string }
interface Booking { created_at: string; status?: string; starts_at?: string | null }
interface Payment { created_at: string; status?: string; amount_inr?: number }

interface Props {
  orgId:    string;
  leads:    Lead[];
  bookings: Booking[];
  payments: Payment[];
}

type Range = 30 | 60 | 90;

const DAYS_OF_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function bucket(items: { created_at: string }[], days: number): { date: string; count: number }[] {
  const now   = Date.now();
  const since = now - days * 86400000;
  const map   = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const key = new Date(now - (days - 1 - d) * 86400000).toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const item of items) {
    const ts = new Date(item.created_at).getTime();
    if (ts < since) continue;
    const key = new Date(ts).toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([date, count]) => ({ date: date.slice(5), count }));
}

function revenueBucket(payments: Payment[], days: number): { date: string; amount: number }[] {
  const now   = Date.now();
  const since = now - days * 86400000;
  const map   = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const key = new Date(now - (days - 1 - d) * 86400000).toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const ts = new Date(p.created_at).getTime();
    if (ts < since) continue;
    const key = new Date(ts).toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + (p.amount_inr ?? 0));
  }
  return Array.from(map.entries()).map(([date, amount]) => ({ date: date.slice(5), amount }));
}

function dowHeatmap(items: { created_at: string }[]): { day: string; count: number }[] {
  const counts = Array(7).fill(0) as number[];
  for (const item of items) counts[new Date(item.created_at).getDay()]++;
  return DAYS_OF_WEEK.map((day, i) => ({ day, count: counts[i] }));
}

function sourceSplit(leads: Lead[]): { source: string; count: number }[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    const s = l.source ?? "organic";
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function SectionInsight({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--text-3)] border-t border-[var(--border)] pt-3 mt-3 leading-relaxed">
      {children}
    </p>
  );
}

function ChartCard({ title, children, insight }: { title: string; children: React.ReactNode; insight?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-5 space-y-4">
      <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">{title}</p>
      {children}
      {insight && <SectionInsight>{insight}</SectionInsight>}
    </div>
  );
}

const JADE = "var(--brand)";
const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-1)",
  border: "1px solid var(--border)",
  fontSize: 11,
  color: "var(--text)",
};

export function TrendsView({ leads, bookings, payments }: Props) {
  const [range, setRange] = React.useState<Range>(30);

  const since     = new Date(Date.now() - range * 86400000).toISOString();
  const rLeads    = leads.filter((l) => l.created_at >= since);
  const rBookings = bookings.filter((b) => b.created_at >= since);
  const rPayments = payments.filter((p) => p.created_at >= since);

  const leadData = bucket(rLeads, range);
  const bookData = bucket(rBookings, range);
  const revData  = revenueBucket(rPayments, range);

  const dowLeads    = dowHeatmap(rLeads);
  const dowBookings = dowHeatmap(rBookings);
  const srcData     = sourceSplit(rLeads);

  const totalRev = rPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + (p.amount_inr ?? 0), 0);

  const peakDow      = [...dowBookings].sort((a, b) => b.count - a.count)[0] ?? { day: "—", count: 0 };
  const peakLeadDow  = [...dowLeads].sort((a, b) => b.count - a.count)[0]    ?? { day: "—", count: 0 };
  const tickInterval = Math.max(1, Math.floor(range / 6));

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Range selector */}
      <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-1 w-fit">
        {([30, 60, 90] as Range[]).map((d) => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors",
              range === d
                ? "bg-[var(--bg-3)] text-[var(--text)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Revenue */}
      <ChartCard
        title={`Revenue — ${range}d (total ₹${(totalRev / 1000).toFixed(1)}k)`}
        insight={
          totalRev > 0
            ? `₹${(totalRev / 1000).toFixed(1)}k collected in ${range} days.`
            : "No captured payments in this window yet."
        }
      >
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={revData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} interval={tickInterval} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-3)" }}
              width={52}
              tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]}
            />
            <Line type="monotone" dataKey="amount" stroke={JADE} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Leads */}
      <ChartCard
        title={`New leads — ${range}d (${rLeads.length} total)`}
        insight={
          peakLeadDow.count > 0
            ? `Most leads arrive on ${peakLeadDow.day}s. Front-load outreach then.`
            : "Keep publishing content to drive inbound."
        }
      >
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={leadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} interval={tickInterval} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} width={30} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke={JADE} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Bookings */}
      <ChartCard
        title={`Bookings — ${range}d (${rBookings.length} total)`}
        insight={
          peakDow.count > 0
            ? `Bookings peak on ${peakDow.day}s. Concentrate outreach 2 days before.`
            : "No bookings in this window. Check your Cal.com link is live."
        }
      >
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={bookData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} interval={tickInterval} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} width={30} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke={JADE} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Day-of-week heatmap */}
      <ChartCard
        title="Day-of-week — booking distribution"
        insight={
          peakDow.count > 0
            ? `${peakDow.count} booking${peakDow.count !== 1 ? "s" : ""} on ${peakDow.day}s — your best conversion day.`
            : undefined
        }
      >
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={dowBookings}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} width={24} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={JADE} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Source breakdown */}
      {srcData.length > 0 && (
        <ChartCard
          title={`Lead sources — ${range}d`}
          insight="Focus effort on whichever source converts to paid, not just volume."
        >
          <ResponsiveContainer width="100%" height={Math.max(100, srcData.length * 28)}>
            <BarChart data={srcData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
              <YAxis
                dataKey="source"
                type="category"
                tick={{ fontSize: 10, fill: "var(--text-3)" }}
                width={96}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={JADE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

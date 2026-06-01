"use client";

import React, { useState } from "react";
import {
  Zap, Mail, Lock, Search, ArrowRight, Plus, Trash2,
  Users, TrendingUp, DollarSign, Calendar, Star,
  Bell, Settings, LayoutDashboard, ChevronDown,
  Info, AlertTriangle, CheckCircle2,
} from "lucide-react";

/* ── Components ── */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton, MetricTileSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricTile } from "@/components/ui/metric-tile";
import { Sparkline } from "@/components/ui/sparkline";
import { FadeUp, StaggerList, StaggerItem, CountUp } from "@/components/motion/primitives";
import { JadeGlow } from "@/components/atmosphere/grain";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

/* ── Section wrapper ── */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-6 scroll-mt-20">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--text)]">{title}</h2>
        <div className="mt-1 h-px bg-[var(--border)]" />
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-[var(--text-3)] font-mono">{label}</p>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function TokenSwatch({ name, value, textColor }: { name: string; value: string; textColor?: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[88px]">
      <div
        className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border)]"
        style={{ background: value }}
      />
      <p className="text-[10px] font-mono text-[var(--text-2)]">{name}</p>
      <p className="text-[10px] font-mono text-[var(--text-3)]">{value}</p>
    </div>
  );
}

/* ── TOC nav ── */
const toc = [
  { id: "tokens",       label: "Tokens" },
  { id: "typography",   label: "Typography" },
  { id: "buttons",      label: "Buttons" },
  { id: "inputs",       label: "Inputs" },
  { id: "badges",       label: "Badges" },
  { id: "cards",        label: "Cards" },
  { id: "metrics",      label: "Metric Tiles" },
  { id: "table",        label: "Data Table" },
  { id: "tabs",         label: "Tabs" },
  { id: "avatar",       label: "Avatars" },
  { id: "overlays",     label: "Dialog / Sheet" },
  { id: "dropdown",     label: "Dropdown" },
  { id: "motion",       label: "Motion" },
  { id: "empty",        label: "Empty State" },
  { id: "skeletons",    label: "Skeletons" },
  { id: "atmosphere",   label: "Atmosphere" },
];

/* ── Sample data ── */
const sparkData = [12, 18, 14, 22, 20, 28, 25, 31, 29, 36, 34, 40];
const sparkDown  = [40, 36, 34, 30, 28, 22, 20, 17, 15, 12, 10, 8];

const tableLeads = [
  { name: "Ava Chen",      score: "Hot",   revenue: "$4,200", stage: "Closed",    date: "May 24" },
  { name: "Marcus Webb",   score: "Warm",  revenue: "$2,100", stage: "Discovery", date: "May 23" },
  { name: "Priya Sharma",  score: "Hot",   revenue: "$3,800", stage: "Proposal",  date: "May 22" },
  { name: "Liam Torres",   score: "Cold",  revenue: "—",      stage: "Lead",      date: "May 21" },
  { name: "Mei Lin",       score: "Warm",  revenue: "$1,500", stage: "Nurture",   date: "May 20" },
];

/* ────────────────────────────────────────────
   STYLEGUIDE CLIENT
──────────────────────────────────────────── */
export function StyleguideClient() {
  const [switchVal, setSwitchVal] = useState(true);
  const [switchVal2, setSwitchVal2] = useState(false);
  const [themeClass, setThemeClass] = useState<"" | "light">("");

  return (
    <div className={themeClass} style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Toaster />

      {/* ── Topbar ── */}
      <div className="sticky top-0 z-30 flex items-center justify-between h-14 px-8 border-b border-[var(--border)] bg-[var(--bg-1)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--brand)]" />
          <span className="font-display font-semibold text-sm text-[var(--text)]">
            Effora AI Design System
          </span>
          <Badge variant="brand" className="ml-2 text-[10px]">v0.5</Badge>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-3)]">
            {themeClass === "light" ? "Light" : "Dark"}
          </span>
          <Switch
            checked={themeClass === "light"}
            onCheckedChange={(v) => setThemeClass(v ? "light" : "")}
          />
        </div>
      </div>

      <div className="flex max-w-[1280px] mx-auto">
        {/* ── Sidebar TOC ── */}
        <aside className="hidden lg:block w-48 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pl-4 pr-6">
          <p className="text-[10px] font-mono font-medium text-[var(--text-3)] uppercase tracking-widest mb-3">
            Sections
          </p>
          <nav className="space-y-0.5">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-xs text-[var(--text-3)] py-1 hover:text-[var(--text)] transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 py-10 px-6 space-y-16">

          {/* ══════════════════════════════════════════════
              TOKENS
          ══════════════════════════════════════════════ */}
          <Section id="tokens" title="Design Tokens">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Surface</p>
                <div className="flex flex-wrap gap-4">
                  <TokenSwatch name="--bg"   value="#0A0A0C" />
                  <TokenSwatch name="--bg-1" value="#121216" />
                  <TokenSwatch name="--bg-2" value="#1A1A20" />
                  <TokenSwatch name="--bg-3" value="#232329" />
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Brand</p>
                <div className="flex flex-wrap gap-4">
                  <TokenSwatch name="--brand"      value="#36E6A0" />
                  <TokenSwatch name="--brand-deep" value="#0FAE73" />
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Text</p>
                <div className="flex flex-wrap gap-4">
                  <TokenSwatch name="--text"   value="#F4F0E8" />
                  <TokenSwatch name="--text-2" value="#B6B4AE" />
                  <TokenSwatch name="--text-3" value="#7C7A75" />
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Status</p>
                <div className="flex flex-wrap gap-4">
                  <TokenSwatch name="--warn"   value="#F6B860" />
                  <TokenSwatch name="--danger" value="#FF5D5D" />
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Radii</p>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["sm", "8px"],
                    ["md", "12px"],
                    ["lg", "16px"],
                    ["pill", "999px"],
                  ].map(([name, val]) => (
                    <div key={name} className="flex flex-col gap-1.5">
                      <div
                        className="h-12 w-20 bg-[var(--bg-3)] border border-[var(--border)]"
                        style={{ borderRadius: val }}
                      />
                      <p className="text-[10px] font-mono text-[var(--text-2)]">{name}</p>
                      <p className="text-[10px] font-mono text-[var(--text-3)]">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              TYPOGRAPHY
          ══════════════════════════════════════════════ */}
          <Section id="typography" title="Typography">
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[var(--text-3)]">Display — Bricolage Grotesque</p>
                <p className="font-display text-5xl font-bold text-[var(--text)] leading-[1.1] tracking-tight">$48,200</p>
                <p className="font-display text-3xl font-semibold text-[var(--text)]">Revenue this month</p>
                <p className="font-display text-xl font-medium text-[var(--text-2)]">Quiet Money Terminal</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[var(--text-3)]">Body — Hanken Grotesk</p>
                <p className="text-base text-[var(--text)]">Your coaches earn while you sleep. Every DM, every booking, every payment — automated.</p>
                <p className="text-sm text-[var(--text-2)]">Secondary body copy. Used for descriptions, captions, and supporting content.</p>
                <p className="text-xs text-[var(--text-3)]">Micro copy — labels, timestamps, helper text.</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-[var(--text-3)]">Mono — Geist Mono (numbers)</p>
                <p className="font-mono text-4xl font-semibold text-[var(--brand)] tabular-nums">48,291</p>
                <p className="font-mono text-xl text-[var(--text)] tabular-nums">+12.4% — $4,820.00</p>
                <p className="font-mono text-xs text-[var(--text-3)] tabular-nums">2026-05-27  09:41:33 UTC</p>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              BUTTONS
          ══════════════════════════════════════════════ */}
          <Section id="buttons" title="Buttons">
            <div className="space-y-6">
              <Row label="variant">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </Row>
              <Row label="size">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="xl">Extra Large</Button>
                <Button size="icon"><Plus className="h-4 w-4" /></Button>
              </Row>
              <Row label="with icon">
                <Button variant="primary"><Mail className="h-4 w-4" /> Send invite</Button>
                <Button variant="secondary"><Plus className="h-4 w-4" /> New lead</Button>
                <Button variant="ghost"><Settings className="h-4 w-4" /></Button>
              </Row>
              <Row label="disabled">
                <Button variant="primary" disabled>Primary</Button>
                <Button variant="secondary" disabled>Secondary</Button>
                <Button variant="ghost" disabled>Ghost</Button>
              </Row>
              <Row label="loading (simulated)">
                <Button variant="primary" disabled>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Saving…
                </Button>
              </Row>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              INPUTS
          ══════════════════════════════════════════════ */}
          <Section id="inputs" title="Inputs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-xl">
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input type="email" placeholder="coach@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" placeholder="••••••••" leftIcon={<Lock className="h-3.5 w-3.5" />} />
              </div>
              <div className="space-y-1.5">
                <Label>Search</Label>
                <Input placeholder="Search leads…" leftIcon={<Search className="h-3.5 w-3.5" />} />
              </div>
              <div className="space-y-1.5">
                <Label>Error state</Label>
                <Input placeholder="Invalid value" error />
              </div>
              <div className="space-y-1.5">
                <Label>Disabled</Label>
                <Input placeholder="Cannot edit" disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Select</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose plan…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Message</Label>
                <Textarea placeholder="Write your follow-up message…" rows={3} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-mono text-[var(--text-3)]">Switch</p>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch id="s1" checked={switchVal} onCheckedChange={setSwitchVal} />
                    <Label htmlFor="s1">Auto-follow up</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="s2" checked={switchVal2} onCheckedChange={setSwitchVal2} />
                    <Label htmlFor="s2">Email notifications</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="s3" disabled checked />
                    <Label htmlFor="s3" className="opacity-40">Disabled on</Label>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              BADGES
          ══════════════════════════════════════════════ */}
          <Section id="badges" title="Badges & Pills">
            <div className="space-y-4">
              <Row label="generic">
                <Badge>Default</Badge>
                <Badge variant="brand">Brand</Badge>
                <Badge variant="brand-outline">Brand outline</Badge>
                <Badge variant="warn">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="muted">Muted</Badge>
              </Row>
              <Row label="lead score variants">
                <Badge variant="hot">🔥 Hot</Badge>
                <Badge variant="warm">Warm</Badge>
                <Badge variant="cold">Cold</Badge>
              </Row>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              CARDS
          ══════════════════════════════════════════════ */}
          <Section id="cards" title="Cards">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Standard Card</CardTitle>
                  <CardDescription>Default card with hairline border.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--text-2)]">
                    Cards are the primary container. Used for content grouping.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="ghost">Cancel</Button>
                  <Button size="sm">Save</Button>
                </CardFooter>
              </Card>

              <Card elevated>
                <CardHeader>
                  <CardTitle>Elevated Card</CardTitle>
                  <CardDescription>Stronger border + deeper shadow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--text-2)]">
                    Used for modals, popovers, or prominent content that needs to float.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-[var(--brand)] shadow-jade">
                <CardHeader>
                  <CardTitle className="text-[var(--brand)]">Jade Accent</CardTitle>
                  <CardDescription>Brand-accented border + jade glow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--text-2)]">
                    For featured or highlighted actions.
                  </p>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              METRIC TILES
          ══════════════════════════════════════════════ */}
          <Section id="metrics" title="Metric Tiles">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricTile
                label="Revenue"
                value={48291}
                prefix="$"
                delta={12.4}
                deltaLabel="vs last month"
                sparkline={sparkData}
                glow
              />
              <MetricTile
                label="New leads"
                value={142}
                delta={8.1}
                deltaLabel="this week"
                sparkline={sparkData}
              />
              <MetricTile
                label="Conversion"
                value={24.7}
                decimals={1}
                suffix="%"
                delta={-2.3}
                deltaLabel="vs avg"
                sparkline={sparkDown}
              />
              <MetricTile
                label="Bookings"
                value={38}
                delta={0}
                deltaLabel="flat"
                sparkline={[22, 24, 22, 23, 24, 22, 23, 24, 22, 23, 22, 22]}
              />
            </div>

            <div className="mt-4">
              <p className="text-xs font-mono text-[var(--text-3)] mb-3">Sparkline standalone</p>
              <div className="flex items-end gap-6">
                <div className="space-y-1">
                  <Sparkline data={sparkData} />
                  <p className="text-[10px] text-[var(--text-3)]">Ascending</p>
                </div>
                <div className="space-y-1">
                  <Sparkline data={sparkDown} color="var(--danger)" />
                  <p className="text-[10px] text-[var(--text-3)]">Descending</p>
                </div>
                <div className="space-y-1">
                  <Sparkline data={[22, 24, 22, 23, 24, 22, 23, 24, 22, 23, 22, 22]} color="var(--warn)" width={100} height={32} />
                  <p className="text-[10px] text-[var(--text-3)]">Flat / warn</p>
                </div>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              TABLE
          ══════════════════════════════════════════════ */}
          <Section id="table" title="Data Table">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableLeads.map((lead) => (
                    <TableRow key={lead.name} interactive>
                      <TableCell className="font-medium text-[var(--text)]">{lead.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            lead.score === "Hot"
                              ? "hot"
                              : lead.score === "Warm"
                              ? "warm"
                              : "cold"
                          }
                        >
                          {lead.score}
                        </Badge>
                      </TableCell>
                      <TableCell>{lead.stage}</TableCell>
                      <TableCell mono className="text-right">{lead.revenue}</TableCell>
                      <TableCell className="text-[var(--text-3)]">{lead.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>

          {/* ══════════════════════════════════════════════
              TABS
          ══════════════════════════════════════════════ */}
          <Section id="tabs" title="Tabs">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="bookings">Bookings</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <Card>
                  <CardContent>
                    <p className="text-sm text-[var(--text-2)]">Overview tab content — dashboard metrics, charts, etc.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="leads">
                <Card>
                  <CardContent>
                    <p className="text-sm text-[var(--text-2)]">Leads tab — pipeline view.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="bookings">
                <Card>
                  <CardContent>
                    <p className="text-sm text-[var(--text-2)]">Bookings tab — calendar view.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="payments">
                <Card>
                  <CardContent>
                    <p className="text-sm text-[var(--text-2)]">Payments tab — revenue table.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </Section>

          {/* ══════════════════════════════════════════════
              AVATARS
          ══════════════════════════════════════════════ */}
          <Section id="avatar" title="Avatars">
            <Row>
              <Avatar size="sm"><AvatarFallback>AC</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>MW</AvatarFallback></Avatar>
              <Avatar size="lg"><AvatarFallback>PS</AvatarFallback></Avatar>
              <Avatar size="md">
                <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=coach1" />
                <AvatarFallback>OC</AvatarFallback>
              </Avatar>
              <Avatar size="md">
                <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=coach2" />
                <AvatarFallback>LT</AvatarFallback>
              </Avatar>
            </Row>
            <div className="flex -space-x-2 mt-2">
              {["AC", "MW", "PS", "LT", "ML"].map((init) => (
                <Avatar key={init} size="sm" className="border-2 border-[var(--bg)]">
                  <AvatarFallback className="text-[10px]">{init}</AvatarFallback>
                </Avatar>
              ))}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--bg-3)] text-[10px] font-medium text-[var(--text-3)]">
                +8
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              DIALOG / SHEET
          ══════════════════════════════════════════════ */}
          <Section id="overlays" title="Dialog / Sheet">
            <Row>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete lead</DialogTitle>
                  </DialogHeader>
                  <DialogDescription>
                    This will permanently delete Ava Chen and all associated data. This action cannot be undone.
                  </DialogDescription>
                  <DialogBody>
                    <Card className="border-[rgba(255,93,93,0.2)] bg-[rgba(255,93,93,0.04)]">
                      <CardContent className="py-3">
                        <p className="text-xs text-[var(--danger)]">
                          ⚠ 3 conversations and 1 payment record will also be deleted.
                        </p>
                      </CardContent>
                    </Card>
                  </DialogBody>
                  <DialogFooter>
                    <Button variant="ghost" size="sm">Cancel</Button>
                    <Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Row>
          </Section>

          {/* ══════════════════════════════════════════════
              DROPDOWN
          ══════════════════════════════════════════════ */}
          <Section id="dropdown" title="Dropdown Menu">
            <Row>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    Actions <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Lead actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem><Mail className="h-4 w-4" /> Send DM</DropdownMenuItem>
                  <DropdownMenuItem><Calendar className="h-4 w-4" /> Book call</DropdownMenuItem>
                  <DropdownMenuItem><Star className="h-4 w-4" /> Mark hot</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
          </Section>

          {/* ══════════════════════════════════════════════
              TOAST
          ══════════════════════════════════════════════ */}
          <Section id="toast" title="Toast Notifications">
            <Row label="click to fire">
              {(
                [
                  { variant: "success",     label: "Success",     title: "Lead closed!",     description: "Ava Chen moved to Closed Won." },
                  { variant: "destructive", label: "Error",       title: "Something broke",  description: "Could not reach Razorpay API." },
                  { variant: "warning",     label: "Warning",     title: "Rate limit",       description: "Groq API at 90% of hourly quota." },
                  { variant: "info",        label: "Info",        title: "Sync complete",    description: "48 new DMs imported from Instagram." },
                  { variant: "default",     label: "Default",     title: "Settings saved",   description: undefined },
                ] as const
              ).map(({ variant, label, title, description }) => (
                <Button
                  key={variant}
                  variant="ghost"
                  size="sm"
                  onClick={() => toast({ variant, title, description })}
                >
                  {label}
                </Button>
              ))}
            </Row>
          </Section>

          {/* ══════════════════════════════════════════════
              MOTION
          ══════════════════════════════════════════════ */}
          <Section id="motion" title="Motion Primitives">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-mono text-[var(--text-3)]">CountUp number</p>
                <div className="flex flex-wrap gap-8">
                  <p className="font-mono text-4xl font-semibold text-[var(--brand)] tabular-nums">
                    <CountUp value={48291} prefix="$" />
                  </p>
                  <p className="font-mono text-3xl font-semibold text-[var(--text)] tabular-nums">
                    <CountUp value={24.7} decimals={1} suffix="%" />
                  </p>
                  <p className="font-mono text-3xl font-semibold text-[var(--warn)] tabular-nums">
                    <CountUp value={142} />
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-mono text-[var(--text-3)]">StaggerList + FadeUp</p>
                <StaggerList className="grid grid-cols-3 gap-3 max-w-sm">
                  {["Leads", "Bookings", "Revenue", "Sequences", "Analytics", "Settings"].map((label) => (
                    <StaggerItem key={label}>
                      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--text-2)] text-center">
                        {label}
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              EMPTY STATE
          ══════════════════════════════════════════════ */}
          <Section id="empty" title="Empty State">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No leads yet"
                description="Connect your Instagram account to start importing DMs automatically."
                action={<Button size="sm"><Plus className="h-4 w-4" /> Import leads</Button>}
              />
              <EmptyState
                icon={<DollarSign className="h-5 w-5" />}
                title="No payments recorded"
                description="Payments will appear here once your first client completes checkout."
              />
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              SKELETONS
          ══════════════════════════════════════════════ */}
          <Section id="skeletons" title="Skeleton Loaders">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Metric tile skeletons</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricTileSkeleton />
                  <MetricTileSkeleton />
                  <MetricTileSkeleton />
                  <MetricTileSkeleton />
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Table row skeletons</p>
                <Card>
                  <CardContent className="py-2">
                    {[...Array(4)].map((_, i) => <TableRowSkeleton key={i} cols={5} />)}
                  </CardContent>
                </Card>
              </div>
              <div>
                <p className="text-xs font-mono text-[var(--text-3)] mb-3">Generic</p>
                <div className="space-y-2 max-w-xs">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            </div>
          </Section>

          {/* ══════════════════════════════════════════════
              ATMOSPHERE
          ══════════════════════════════════════════════ */}
          <Section id="atmosphere" title="Atmosphere">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Jade glow card */}
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-2)] p-6">
                <JadeGlow size="lg" />
                <div className="relative z-10 space-y-2">
                  <p className="text-xs font-mono text-[var(--text-3)]">Jade Glow radial</p>
                  <p className="font-display text-2xl font-bold text-[var(--text)]">
                    $48,291
                  </p>
                  <p className="text-sm text-[var(--text-2)]">Revenue this month</p>
                  <Badge variant="hot">+12.4% 🔥</Badge>
                </div>
              </div>

              {/* Film grain demo */}
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6">
                {/* inline grain */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-[1] select-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                    backgroundSize: "200px 200px",
                    opacity: 0.05,
                    mixBlendMode: "overlay",
                  }}
                />
                <div className="relative z-10 space-y-2">
                  <p className="text-xs font-mono text-[var(--text-3)]">Film grain overlay (5%)</p>
                  <p className="font-display text-2xl font-bold text-[var(--text)]">Texture adds depth</p>
                  <p className="text-sm text-[var(--text-2)]">Subtle noise overlay to break flatness. Default is 3%, strong is 5%.</p>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Footer ── */}
          <div className="pt-8 pb-16 text-center space-y-1">
            <p className="text-xs text-[var(--text-3)]">Effora AI Design System — Phase 0.5</p>
            <p className="text-xs text-[var(--text-3)] font-mono">Quiet Money Terminal</p>
          </div>
        </main>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Plus, CheckCircle2, Circle, Minus, X, Lock, Target,
  MoreVertical, Pencil, Archive, Trash2, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface Goal {
  id: string;
  title: string;
  metric_type: string;
  target_value: number | null;
  target_date: string | null;
  current_value: number;
  status: string;
}

interface Commitment {
  id: string;
  title: string;
  due_date: string;
  status: string;
  notes: string | null;
}

interface Scorecard {
  id: string;
  week_start: string;
  score: number;
  metrics_json: Record<string, number>;
  ai_insights: string | null;
}

interface Props {
  orgId: string;
  orgSlug: string;
  canUse: boolean;
  initialGoals: Goal[];
  initialCommitments: Commitment[];
  initialScorecards: Scorecard[];
}

const METRIC_TYPES = [
  { value: "revenue",  label: "Revenue"  },
  { value: "leads",    label: "Leads"    },
  { value: "calls",    label: "Calls"    },
  { value: "bookings", label: "Bookings" },
  { value: "other",    label: "Other"    },
];

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, description, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 w-80 space-y-4 shadow-xl">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          <p className="text-xs text-[var(--text-3)] mt-1">{description}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[var(--radius)] bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
          >
            {confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small inline 3-dot dropdown ───────────────────────────────────────────────
function ThreeDotMenu({ items }: {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-3)] transition-colors"
          aria-label="More options"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[140px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] shadow-lg py-1"
        >
          {items.map((item, i) => (
            <DropdownMenu.Item
              key={i}
              onSelect={item.onClick}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer select-none outline-none transition-colors",
                item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]",
              )}
            >
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function CoachView({ orgId, canUse, initialGoals, initialCommitments, initialScorecards }: Props) {
  const [goals,       setGoals]       = React.useState<Goal[]>(initialGoals);
  const [commitments, setCommitments] = React.useState<Commitment[]>(initialCommitments);
  const [scorecards]                  = React.useState<Scorecard[]>(initialScorecards);

  const [showGoalForm,   setShowGoalForm]   = React.useState(false);
  const [showCommitForm, setShowCommitForm] = React.useState(false);
  const [savingGoal,     setSavingGoal]     = React.useState(false);
  const [savingCommit,   setSavingCommit]   = React.useState(false);
  const [showArchived,   setShowArchived]   = React.useState(false);

  const [goalForm,   setGoalForm]   = React.useState({ title: "", metric_type: "other", target_value: "", target_date: "" });
  const [commitForm, setCommitForm] = React.useState({ title: "", due_date: "" });

  // Edit state
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null);
  const [editGoalForm, setEditGoalForm] = React.useState({ title: "", metric_type: "other", target_value: "", target_date: "" });
  const [editingCommit, setEditingCommit] = React.useState<Commitment | null>(null);
  const [editCommitForm, setEditCommitForm] = React.useState({ title: "", due_date: "" });

  // Delete confirm
  const [deleteGoalId,   setDeleteGoalId]   = React.useState<string | null>(null);
  const [deleteCommitId, setDeleteCommitId] = React.useState<string | null>(null);

  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
          <Lock className="h-7 w-7 text-[var(--text-3)]" />
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="font-display text-base font-semibold text-[var(--text)]">Growth feature</p>
          <p className="text-sm text-[var(--text-3)]">Upgrade to Growth to unlock Accountability Coach — goals, commitments, and weekly scorecards.</p>
        </div>
      </div>
    );
  }

  // ── Goal actions ────────────────────────────────────────────────
  async function addGoal() {
    if (!goalForm.title.trim()) return;
    setSavingGoal(true);
    try {
      const r = await fetch(`/api/orgs/${orgId}/coach/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:        goalForm.title,
          metric_type:  goalForm.metric_type,
          target_value: goalForm.target_value ? Number(goalForm.target_value) : undefined,
          target_date:  goalForm.target_date || undefined,
        }),
      });
      const data = await r.json();
      if (data.goal) {
        setGoals((g) => [data.goal, ...g]);
        setGoalForm({ title: "", metric_type: "other", target_value: "", target_date: "" });
        setShowGoalForm(false);
      }
    } finally {
      setSavingGoal(false);
    }
  }

  async function updateGoalStatus(id: string, status: string) {
    setGoals((g) => g.map((x) => x.id === id ? { ...x, status } : x));
    await fetch(`/api/orgs/${orgId}/coach/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function saveGoalEdit() {
    if (!editingGoal || !editGoalForm.title.trim()) return;
    const r = await fetch(`/api/orgs/${orgId}/coach/goals/${editingGoal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:        editGoalForm.title,
        metric_type:  editGoalForm.metric_type,
        target_value: editGoalForm.target_value ? Number(editGoalForm.target_value) : null,
        target_date:  editGoalForm.target_date || null,
      }),
    });
    const data = await r.json();
    if (data.goal) {
      setGoals((g) => g.map((x) => x.id === editingGoal.id ? data.goal : x));
      setEditingGoal(null);
    }
  }

  async function deleteGoal(id: string) {
    await fetch(`/api/orgs/${orgId}/coach/goals/${id}`, { method: "DELETE" });
    setGoals((g) => g.filter((x) => x.id !== id));
    setDeleteGoalId(null);
  }

  // ── Commitment actions ──────────────────────────────────────────
  async function addCommitment() {
    if (!commitForm.title.trim() || !commitForm.due_date) return;
    setSavingCommit(true);
    try {
      const r = await fetch(`/api/orgs/${orgId}/coach/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commitForm),
      });
      const data = await r.json();
      if (data.commitment) {
        setCommitments((c) => [...c, data.commitment].sort((a, b) => a.due_date.localeCompare(b.due_date)));
        setCommitForm({ title: "", due_date: "" });
        setShowCommitForm(false);
      }
    } finally {
      setSavingCommit(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setCommitments((c) => c.map((x) => x.id === id ? { ...x, status } : x));
    await fetch(`/api/orgs/${orgId}/coach/commitments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function saveCommitEdit() {
    if (!editingCommit || !editCommitForm.title.trim()) return;
    const r = await fetch(`/api/orgs/${orgId}/coach/commitments/${editingCommit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editCommitForm.title, due_date: editCommitForm.due_date }),
    });
    const data = await r.json();
    if (data.commitment) {
      setCommitments((c) => c.map((x) => x.id === editingCommit.id ? data.commitment : x));
      setEditingCommit(null);
    }
  }

  async function deleteCommitment(id: string) {
    await fetch(`/api/orgs/${orgId}/coach/commitments/${id}`, { method: "DELETE" });
    setCommitments((c) => c.filter((x) => x.id !== id));
    setDeleteCommitId(null);
  }

  // ── Derived lists ───────────────────────────────────────────────
  const visibleGoals = goals.filter((g) =>
    showArchived ? true : g.status !== "archived"
  );
  const visibleCommitments = commitments.filter((c) =>
    showArchived ? true : c.status !== "archived"
  );
  const lastScorecards = scorecards.slice(0, 4).reverse();

  const inputCls = "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  return (
    <div className="space-y-6">

      {/* Show archived toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Goals ── */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--brand)]" />
              <span className="text-sm font-semibold text-[var(--text)]">Goals</span>
            </div>
            <button
              onClick={() => setShowGoalForm((v) => !v)}
              className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--brand)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {/* Add goal form */}
          {showGoalForm && (
            <div className="space-y-2 border border-[var(--border)] rounded-[var(--radius)] p-3 bg-[var(--bg-2)]">
              <input autoFocus value={goalForm.title}
                onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Goal title…" className={inputCls} />
              <div className="flex gap-2">
                <select value={goalForm.metric_type}
                  onChange={(e) => setGoalForm((f) => ({ ...f, metric_type: e.target.value }))}
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none">
                  {METRIC_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input type="number" value={goalForm.target_value}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_value: e.target.value }))}
                  placeholder="Target"
                  className="w-24 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none" />
                <input type="date" value={goalForm.target_date}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_date: e.target.value }))}
                  className="w-28 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowGoalForm(false)} className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
                <button onClick={addGoal} disabled={savingGoal || !goalForm.title.trim()}
                  className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[#0A0A0C] disabled:opacity-50">
                  {savingGoal ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {visibleGoals.length === 0 && !showGoalForm && (
              <p className="text-xs text-[var(--text-3)] text-center py-4">No active goals. Add one above.</p>
            )}
            {visibleGoals.map((g) => (
              <div key={g.id}>
                {editingGoal?.id === g.id ? (
                  /* Inline edit form */
                  <div className="space-y-2 border border-[var(--brand)]/30 rounded-[var(--radius)] p-3 bg-[var(--bg-2)]">
                    <input autoFocus value={editGoalForm.title}
                      onChange={(e) => setEditGoalForm((f) => ({ ...f, title: e.target.value }))}
                      className={inputCls} />
                    <div className="flex gap-2">
                      <select value={editGoalForm.metric_type}
                        onChange={(e) => setEditGoalForm((f) => ({ ...f, metric_type: e.target.value }))}
                        className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none">
                        {METRIC_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input type="number" value={editGoalForm.target_value}
                        onChange={(e) => setEditGoalForm((f) => ({ ...f, target_value: e.target.value }))}
                        placeholder="Target"
                        className="w-24 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" />
                      <input type="date" value={editGoalForm.target_date}
                        onChange={(e) => setEditGoalForm((f) => ({ ...f, target_date: e.target.value }))}
                        className="w-28 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingGoal(null)} className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
                      <button onClick={saveGoalEdit} className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[#0A0A0C]">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5",
                    g.status === "archived" && "opacity-50",
                  )}>
                    <Target className="h-3.5 w-3.5 text-[var(--brand)] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium text-[var(--text)] truncate", g.status === "completed" && "line-through text-[var(--text-3)]")}>{g.title}</p>
                      <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                        {g.metric_type}{g.target_value ? ` · Target: ${g.target_value}` : ""}{g.target_date ? ` · Due: ${g.target_date}` : ""}
                        {g.status === "archived" && " · Archived"}
                        {g.status === "completed" && " · Completed"}
                      </p>
                    </div>
                    <ThreeDotMenu items={[
                      {
                        label: "Edit", icon: <Pencil className="h-3 w-3" />,
                        onClick: () => {
                          setEditingGoal(g);
                          setEditGoalForm({
                            title: g.title, metric_type: g.metric_type,
                            target_value: g.target_value?.toString() ?? "",
                            target_date: g.target_date ?? "",
                          });
                        },
                      },
                      {
                        label: g.status === "completed" ? "Mark active" : "Mark completed",
                        icon: <CheckCheck className="h-3 w-3" />,
                        onClick: () => updateGoalStatus(g.id, g.status === "completed" ? "active" : "completed"),
                      },
                      {
                        label: g.status === "archived" ? "Unarchive" : "Archive",
                        icon: <Archive className="h-3 w-3" />,
                        onClick: () => updateGoalStatus(g.id, g.status === "archived" ? "active" : "archived"),
                      },
                      {
                        label: "Delete", icon: <Trash2 className="h-3 w-3" />,
                        danger: true,
                        onClick: () => setDeleteGoalId(g.id),
                      },
                    ]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Commitments ── */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />
              <span className="text-sm font-semibold text-[var(--text)]">Commitments</span>
            </div>
            <button
              onClick={() => setShowCommitForm((v) => !v)}
              className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--brand)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {showCommitForm && (
            <div className="space-y-2 border border-[var(--border)] rounded-[var(--radius)] p-3 bg-[var(--bg-2)]">
              <input autoFocus value={commitForm.title}
                onChange={(e) => setCommitForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Commitment title…" className={inputCls} />
              <input type="date" value={commitForm.due_date}
                onChange={(e) => setCommitForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCommitForm(false)} className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
                <button onClick={addCommitment} disabled={savingCommit || !commitForm.title.trim() || !commitForm.due_date}
                  className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[#0A0A0C] disabled:opacity-50">
                  {savingCommit ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {visibleCommitments.length === 0 && !showCommitForm && (
              <p className="text-xs text-[var(--text-3)] text-center py-4">No commitments. Add one above.</p>
            )}
            {visibleCommitments.map((c) => (
              <div key={c.id}>
                {editingCommit?.id === c.id ? (
                  <div className="space-y-2 border border-[var(--brand)]/30 rounded-[var(--radius)] p-3 bg-[var(--bg-2)]">
                    <input autoFocus value={editCommitForm.title}
                      onChange={(e) => setEditCommitForm((f) => ({ ...f, title: e.target.value }))}
                      className={inputCls} />
                    <input type="date" value={editCommitForm.due_date}
                      onChange={(e) => setEditCommitForm((f) => ({ ...f, due_date: e.target.value }))}
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingCommit(null)} className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
                      <button onClick={saveCommitEdit} className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[#0A0A0C]">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5",
                    c.status === "archived" && "opacity-50",
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium truncate", c.status === "done" ? "line-through text-[var(--text-3)]" : "text-[var(--text)]")}>{c.title}</p>
                      <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                        Due: {c.due_date}
                        {c.status === "archived" && " · Archived"}
                      </p>
                    </div>
                    {/* Status buttons */}
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => updateStatus(c.id, "done")} title="Done"
                        className={cn("rounded p-1 transition-colors", c.status === "done" ? "text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--brand)]")}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateStatus(c.id, "partial")} title="Partial"
                        className={cn("rounded p-1 transition-colors", c.status === "partial" ? "text-amber-400" : "text-[var(--text-3)] hover:text-amber-400")}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateStatus(c.id, "missed")} title="Missed"
                        className={cn("rounded p-1 transition-colors", c.status === "missed" ? "text-red-400" : "text-[var(--text-3)] hover:text-red-400")}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateStatus(c.id, "pending")} title="Reset"
                        className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
                        <Circle className="h-3.5 w-3.5" />
                      </button>
                      <ThreeDotMenu items={[
                        {
                          label: "Edit", icon: <Pencil className="h-3 w-3" />,
                          onClick: () => {
                            setEditingCommit(c);
                            setEditCommitForm({ title: c.title, due_date: c.due_date });
                          },
                        },
                        {
                          label: c.status === "archived" ? "Unarchive" : "Archive",
                          icon: <Archive className="h-3 w-3" />,
                          onClick: () => updateStatus(c.id, c.status === "archived" ? "pending" : "archived"),
                        },
                        {
                          label: "Delete", icon: <Trash2 className="h-3 w-3" />,
                          danger: true,
                          onClick: () => setDeleteCommitId(c.id),
                        },
                      ]} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly scorecards */}
      {lastScorecards.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
          <span className="text-sm font-semibold text-[var(--text)]">Weekly Scorecard</span>
          <div className="flex items-end gap-3">
            {lastScorecards.map((sc) => (
              <div key={sc.id} className="flex-1 space-y-1.5 text-center">
                <div className="relative h-20 bg-[var(--bg-3)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div className="absolute bottom-0 left-0 right-0 bg-[var(--brand)]/70 rounded-[var(--radius-sm)] transition-all"
                    style={{ height: `${sc.score}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text)]">{sc.score}</span>
                </div>
                <p className="text-[10px] text-[var(--text-3)]">{sc.week_start}</p>
              </div>
            ))}
          </div>
          {lastScorecards[lastScorecards.length - 1]?.ai_insights && (
            <p className="text-xs text-[var(--text-2)] border-t border-[var(--border)] pt-3">
              {lastScorecards[lastScorecards.length - 1].ai_insights}
            </p>
          )}
        </div>
      )}

      {/* Delete confirms */}
      <ConfirmDialog
        open={!!deleteGoalId}
        title="Delete this goal?"
        description="This cannot be undone."
        onConfirm={() => deleteGoalId && deleteGoal(deleteGoalId)}
        onCancel={() => setDeleteGoalId(null)}
      />
      <ConfirmDialog
        open={!!deleteCommitId}
        title="Delete this commitment?"
        description="This cannot be undone."
        onConfirm={() => deleteCommitId && deleteCommitment(deleteCommitId)}
        onCancel={() => setDeleteCommitId(null)}
      />
    </div>
  );
}

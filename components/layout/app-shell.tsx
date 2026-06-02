"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronDown,
  Menu,
  Bell,
  Zap,
  Activity,
  GitBranch,
  LogOut,
  Mic,
  Check,
  Gift,
  Wand2,
  Users,
  Target,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ── Types ── */
interface OrgOption {
  id:   string;
  slug: string;
  name: string;
}

interface AppShellProps {
  children:  React.ReactNode;
  orgSlug:   string;
  orgName?:  string;
  orgs?:     OrgOption[];
  user?:     { name?: string; email?: string; avatarUrl?: string } | null;
  pageTitle?: string;
}

/* ── Nav items — exactly per spec ── */
const mainNav = [
  { href: "process",   label: "Assistant",  icon: Wand2           },
  { href: "inbox",     label: "Inbox",      icon: Inbox           },
  { href: "crm",       label: "CRM",        icon: Users           },
  { href: "leads",     label: "Leads",      icon: UserCircle      },
  { href: "bookings",  label: "Bookings",   icon: CalendarDays    },
  { href: "payments",  label: "Payments",   icon: CreditCard      },
  { href: "sequences", label: "Sequences",  icon: GitBranch       },
  { href: "coach",     label: "Coach",      icon: Target          },
  { href: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
] as const;

const bottomNav = [
  { href: "referrals",        label: "Referrals", icon: Gift         },
  { href: "health",           label: "Health",    icon: Activity     },
  { href: "settings/billing", label: "Billing",   icon: CreditCard   },
  { href: "settings",         label: "Settings",  icon: Settings     },
] as const;

/* ────────────────────────────────────────────
   APP SHELL
──────────────────────────────────────────── */
export function AppShell({
  children,
  orgSlug,
  orgName,
  orgs = [],
  user,
  pageTitle,
}: AppShellProps) {
  const [collapsed, setCollapsed]             = React.useState(false);
  const [mobileSidebarOpen, setMobileOpen]    = React.useState(false);
  const pathname = usePathname();
  const router   = useRouter();

  const sidebarWidth = collapsed ? 64 : 220;

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  /* ── Home link active = exact match on /org/[slug] ── */
  const homeHref = `/org/${orgSlug}`;
  const isHome   = pathname === homeHref;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">

      {/* ══════════════════════════════════════
          DESKTOP SIDEBAR
      ══════════════════════════════════════ */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden md:flex flex-col shrink-0 border-r border-[var(--border)] bg-[var(--bg-1)] overflow-hidden"
      >
        {/* Logo / org name */}
        <div className="flex h-14 items-center justify-between px-4 shrink-0">
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.div
                key="icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="mx-auto"
              >
                <Link href={homeHref}>
                  <Zap className="h-5 w-5 text-[var(--brand)]" />
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="full"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.16 }}
                className="flex items-center gap-2 min-w-0"
              >
                <Zap className="h-4 w-4 text-[var(--brand)] shrink-0" />
                <Link
                  href={homeHref}
                  className="font-display font-semibold text-sm text-[var(--text)] truncate hover:text-[var(--brand)] transition-colors"
                >
                  {orgName ?? "Effora AI"}
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)] transition-colors rounded p-0.5"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <Separator />

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-0.5">
          {mainNav.map((item) => {
            const href   = `/org/${orgSlug}/${item.href}`;
            const active = pathname.startsWith(href);
            return (
              <NavItem
                key={item.href}
                href={href}
                label={item.label}
                icon={<item.icon className="h-4 w-4 shrink-0" />}
                active={active}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        {/* Bottom nav + user chip */}
        <div className="p-2 space-y-0.5">
          <Separator className="mb-2" />
          {bottomNav.map((item) => {
            const href   = `/org/${orgSlug}/${item.href}`;
            const active = pathname.startsWith(href);
            return (
              <NavItem
                key={item.href}
                href={href}
                label={item.label}
                icon={<item.icon className="h-4 w-4 shrink-0" />}
                active={active}
                collapsed={collapsed}
              />
            );
          })}

          {/* User chip */}
          <button
            className={cn(
              "w-full flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors hover:bg-[var(--bg-3)] mt-2",
              collapsed && "justify-center px-0"
            )}
            onClick={handleSignOut}
            title={collapsed ? "Sign out" : undefined}
          >
            <Avatar size="sm">
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex items-center justify-between overflow-hidden min-w-0 flex-1"
                >
                  <span className="text-xs font-medium text-[var(--text)] truncate max-w-[100px]">
                    {user?.name ?? user?.email ?? "Account"}
                  </span>
                  <LogOut className="h-3.5 w-3.5 text-[var(--text-3)] shrink-0" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Expand handle */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute bottom-[120px] -right-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text)] shadow-card transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronLeft className="h-3 w-3 rotate-180" />
          </button>
        )}
      </motion.aside>

      {/* ══════════════════════════════════════
          MOBILE SIDEBAR OVERLAY
      ══════════════════════════════════════ */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="mobile-sidebar"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col border-r border-[var(--border)] bg-[var(--bg-1)] md:hidden"
            >
              {/* Sidebar header */}
              <div className="flex h-14 items-center justify-between gap-2 px-4 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="h-4 w-4 text-[var(--brand)] shrink-0" />
                  <span className="font-display font-semibold text-sm text-[var(--text)] truncate">
                    {orgName ?? "Effora AI"}
                  </span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="h-9 w-9 flex items-center justify-center shrink-0 rounded-[var(--radius-sm)] text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <Separator />
              <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {mainNav.map((item) => {
                  const href   = `/org/${orgSlug}/${item.href}`;
                  const active = pathname.startsWith(href);
                  return (
                    <NavItem
                      key={item.href}
                      href={href}
                      label={item.label}
                      icon={<item.icon className="h-4 w-4 shrink-0" />}
                      active={active}
                      collapsed={false}
                      onClick={() => setMobileOpen(false)}
                    />
                  );
                })}
                <Separator className="my-1" />
                {bottomNav.map((item) => {
                  const href   = `/org/${orgSlug}/${item.href}`;
                  const active = pathname.startsWith(href);
                  return (
                    <NavItem
                      key={item.href}
                      href={href}
                      label={item.label}
                      icon={<item.icon className="h-4 w-4 shrink-0" />}
                      active={active}
                      collapsed={false}
                      onClick={() => setMobileOpen(false)}
                    />
                  );
                })}
              </nav>
              {/* Sign out at bottom of mobile sidebar */}
              <div className="p-2 border-t border-[var(--border)]">
                <button
                  onClick={() => { setMobileOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════
          MAIN AREA
      ══════════════════════════════════════ */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* ── Topbar ── */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-1)] px-4">

          {/* Left: hamburger (mobile) + org switcher */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden shrink-0 flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Org switcher */}
            <OrgSwitcherMenu
              orgs={orgs}
              currentSlug={orgSlug}
              currentName={orgName ?? orgSlug}
            />
          </div>

          {/* Right: bell + user menu */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4 text-[var(--text-3)]" />
            </Button>

            <UserMenu
              initials={initials}
              email={user?.email}
              orgSlug={orgSlug}
              onSignOut={handleSignOut}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   ORG SWITCHER MENU
──────────────────────────────────────────── */
function OrgSwitcherMenu({
  orgs,
  currentSlug,
  currentName,
}: {
  orgs: OrgOption[];
  currentSlug: string;
  currentName: string;
}) {
  const router = useRouter();

  if (orgs.length <= 1) {
    return (
      <span className="font-display text-sm font-semibold text-[var(--text)] truncate max-w-[160px]">
        {currentName}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-semibold font-display text-[var(--text)] hover:bg-[var(--bg-3)] transition-colors max-w-[200px]">
          <span className="truncate">{currentName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-3)] shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => router.push(`/org/${org.slug}`)}
            className="justify-between"
          >
            <span className="truncate">{org.name}</span>
            {org.slug === currentSlug && (
              <Check className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ────────────────────────────────────────────
   USER MENU
──────────────────────────────────────────── */
function UserMenu({
  initials,
  email,
  orgSlug,
  onSignOut,
}: {
  initials: string;
  email?: string;
  orgSlug: string;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {email && (
          <>
            <DropdownMenuLabel className="font-normal truncate text-[var(--text-3)]">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/org/${orgSlug}/settings/voice`}>
            <Mic className="h-4 w-4" /> Voice profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/org/${orgSlug}/health`}>
            <Activity className="h-4 w-4" /> Integration health
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/org/${orgSlug}/settings`}>
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} destructive>
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ────────────────────────────────────────────
   NAV ITEM
──────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
  onClick,
}: {
  href:      string;
  label:     string;
  icon:      React.ReactNode;
  active:    boolean;
  collapsed: boolean;
  onClick?:  () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors duration-[120ms]",
        active
          ? "bg-[var(--bg-3)] text-[var(--text)] font-medium"
          : "text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text-2)]",
        collapsed && "justify-center px-0 py-2"
      )}
    >
      <span className={cn(active && "text-[var(--brand)]")}>{icon}</span>
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden whitespace-nowrap"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

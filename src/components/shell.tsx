"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Camera, Check, Command, FileText, FlaskConical, GitCompareArrows, History, LayoutGrid, Menu, Moon,
  ScanSearch, Search, Sun, Hammer, Undo2, X, Grid3x3, Cpu, Sparkles, Map as MapIcon, Wand2, Play, LogOut, Loader2, AlertTriangle, Radio, ShieldCheck,
} from "lucide-react";
import { useStudio } from "./providers";
import { usePermissions } from "@/hooks/usePermissions";
import type { Capability } from "@/lib/permissions";
import { Kbd } from "./ui";
import { cn } from "@/lib/utils";
import { getMeta, getProperties, getProperty, getWorkOrders, reportPair } from "@/lib/view";
import { HoodDrawer } from "./hood";

interface NavItem {
  href: string;
  label: string;
  ownerLabel?: string;
  tenantLabel?: string;
  icon: any;
  key: string;
  badge?: boolean;
  repairs?: boolean;
  capability: Capability;
}

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, key: "G O", capability: "property:view" },
  { href: "/map", label: "Home map", icon: MapIcon, key: "G H", capability: "room:view" },
  { href: "/memory", label: "Property memory", icon: Grid3x3, key: "G M", capability: "room:view" },
  { href: "/capture", label: "Capture", icon: Camera, key: "G C", capability: "capture:use" },
  { href: "/review", label: "Review", ownerLabel: "Review", tenantLabel: "Findings", icon: ScanSearch, key: "G R", badge: true, capability: "finding:view" },
  { href: "/compare", label: "Compare", icon: GitCompareArrows, key: "G D", capability: "finding:view" },
  { href: "/repairs", label: "Repairs", icon: Hammer, key: "G W", repairs: true, capability: "repair:view" },
  { href: "/timeline", label: "Timeline", icon: History, key: "G T", capability: "property:view" },
  { href: "/search", label: "Search", icon: Search, key: "/", capability: "property:view" },
  { href: "/report", label: "Evidence report", icon: FileText, key: "G E", capability: "report:view" },
  { href: "/relet", label: "Re-let studio", icon: Wand2, key: "G S", capability: "relet:access" },
  { href: "/lab", label: "Media lab", icon: FlaskConical, key: "G L", capability: "media:transform" },
];

function Logo() {
  return (
    <Link href="/welcome" className="group flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-[9px] bg-ink text-bg">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <rect x="9" y="12" width="6" height="5" rx=".6" className="stroke-signal" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="block text-[14px] font-semibold tracking-tight">RentalMove</span>
        <span className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-3">property memory</span>
      </span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { observations, user, selectProperty, live, view } = useStudio();
  const { can } = usePermissions();
  const visibleNav = useMemo(() => NAV.filter((n) => can(n.capability)), [can]);
  
  const pending = useMemo(() => {
    const { current } = reportPair();
    return observations.filter((o) => {
      if (!current) return true;
      const a = view?.assets.find((x) => x.id === o.asset_id);
      if (!a) return true;
      if (a.inspection_id !== current.id) return false;

      if (user.role === "tenant") {
        return (o.review_status === "accepted" || o.review_status === "edited") && !o.pre_existing && !view?.stances[o.id]?.tenant;
      }
      return o.review_status === "pending";
    }).length;
  }, [observations, view?.assets, view?.stances, user.role]);

  const openRepairs = getWorkOrders().filter((w) => w.status !== "done").length;
  const prop = getProperty();
  const all = getProperties();
  const meta = getMeta();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5"><Logo /></div>
      <div className="mx-3 mb-4 rounded-xl border border-line bg-surface p-3">
        <div className="eyebrow">{user.role === "tenant" ? "Your home" : "Selected property"}</div>
        {all.length > 1 ? (
          <select value={prop.id} onChange={(e) => selectProperty(e.target.value)} className="mt-1 w-full bg-transparent text-[13px] font-semibold outline-none" aria-label="Property">
            {all.map((p) => <option key={p.id} value={p.id}>{p.address_label}</option>)}
          </select>
        ) : (
          <div className="mt-1 text-[13px] font-semibold">{prop.address_label}</div>
        )}
        <div className="text-[12px] text-ink-3">{prop.unit_label}</div>
        {prop.status === "move_out_in_progress" && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-signal/10 px-1.5 py-0.5 text-[11px] font-medium text-signal">
            <span className="size-1.5 animate-pulse-ring rounded-full bg-signal" /> Move-out recorded
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {visibleNav.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const label = (user.role === "tenant" && n.tenantLabel) || (user.role === "owner" && n.ownerLabel) || n.label;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition",
                active ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:bg-surface/60 hover:text-ink"
              )}
            >
              <n.icon className={cn("size-[16px]", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              {"repairs" in n && openRepairs > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[10.5px] font-medium leading-[18px] text-ink-2">{openRepairs}</span>
              )}
              {"badge" in n && n.badge && pending > 0 && can("finding:triage") && (
                <span className="rounded-full bg-signal px-1.5 font-mono text-[10.5px] font-medium leading-[18px] text-white">{pending}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 space-y-1.5 rounded-xl border border-dashed border-line p-3 text-[11.5px] text-ink-3">
        <div className="flex items-center gap-1.5 font-medium text-ink-2"><ShieldCheck className="size-3.5 text-ok" /> Live system</div>
        <div className="flex items-center justify-between"><span>Media</span><span className="font-mono text-ink-2">Cloudinary</span></div>
        <div className="flex items-center justify-between"><span>Records</span><span className="font-mono text-ink-2">Supabase</span></div>
        <div className="flex items-center justify-between"><span>Event log</span><span className={cn("font-mono", meta.event_store === "supabase" ? "text-ink-2" : "text-warn")}>{meta.event_store}</span></div>
        <div className="flex items-center justify-between"><span>Live sync</span><span className={cn("inline-flex items-center gap-1 font-mono", live ? "text-ok" : "text-ink-3")}><span className={cn("size-1.5 rounded-full", live ? "bg-ok" : "bg-ink-3")} />{live ? "on" : "off"}</span></div>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, theme, toggleTheme, setPaletteOpen, setHoodOpen, setAskOpen, setTour, signOut, live } = useStudio();
  const [menu, setMenu] = useState(false);
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur-xl md:px-6">
      <button className="btn-ghost -ml-2 px-2 lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu className="size-5" /></button>
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-[13px] text-ink-3 transition hover:border-ink-3/40 md:max-w-md"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Search photos, rooms, observations…</span>
        <span className="hidden gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1" />
      <button onClick={() => setAskOpen(true)} className="btn-outline hidden border-signal/30 md:inline-flex" title="Ask RentalMove (⌘J)">
        <Sparkles className="size-4 text-signal" /> Ask
      </button>
      <button onClick={() => setTour({ active: true, step: 0, playing: true })} className="btn-ghost hidden md:inline-flex" title="Present mode">
        <Play className="size-4" /> <span className="hidden xl:inline">Present</span>
      </button>
      <button onClick={() => setHoodOpen(true)} className="btn-ghost hidden sm:inline-flex" title="Under the hood (U)">
        <Cpu className="size-4" /> <span className="hidden xl:inline">Under the hood</span>
      </button>
      <span className={cn("hidden items-center gap-1 font-mono text-[10.5px] sm:inline-flex", live ? "text-ok" : "text-ink-3")} title={live ? "Live: changes from other devices appear instantly" : "Live sync reconnecting"}>
        <Radio className="size-3.5" /> {live ? "live" : "…"}
      </span>
      <button onClick={toggleTheme} className="btn-ghost px-2" aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition hover:bg-surface-2" aria-label="Account">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg">{user.initials}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-[12.5px] font-medium">{user.name}</span>
            <span className="block text-[10.5px] capitalize text-ink-3">{user.role}</span>
          </span>
        </button>
        {menu && (
          <div className="card absolute right-0 top-11 z-40 w-56 p-1.5 shadow-lift animate-fade-up" onMouseLeave={() => setMenu(false)}>
            <div className="px-2.5 py-2">
              <div className="text-[13px] font-medium">{user.name}</div>
              <div className="truncate text-[11.5px] text-ink-3">{user.email}</div>
              <div className="mt-1 inline-flex rounded bg-surface-2 px-1.5 text-[10.5px] font-medium capitalize text-ink-2">{user.role}</div>
            </div>
            <div className="divider my-1" />
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" /> Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Palette() {
  const { paletteOpen, setPaletteOpen, setHoodOpen, toggleTheme, observations, setAskOpen, setTour, signOut, user } = useStudio();
  const { can } = usePermissions();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const visibleNav = NAV.filter((n) => can(n.capability));
    const base = [
      ...visibleNav.map((n) => {
        const label = (user.role === "tenant" && n.tenantLabel) || (user.role === "owner" && n.ownerLabel) || n.label;
        return { group: "Go to", label, icon: n.icon, run: go(n.href), hint: n.key };
      }),
      { group: "Actions", label: "Ask RentalMove", icon: Sparkles, run: () => setAskOpen(true), hint: "⌘J" },
      { group: "Actions", label: "Present — guided tour", icon: Play, run: () => setTour({ active: true, step: 0, playing: true }), hint: "" },
      { group: "Actions", label: "Start move-out capture", icon: Camera, run: go("/capture"), hint: "" },
      { group: "Actions", label: "Compare kitchen: move-in → move-out", icon: GitCompareArrows, run: go("/compare?room=room-kitchen"), hint: "" },
      { group: "Actions", label: "Open under the hood", icon: Cpu, run: () => setHoodOpen(true), hint: "U" },
      { group: "Actions", label: "Toggle dark mode", icon: Moon, run: toggleTheme, hint: "" },
      { group: "Actions", label: "Verify a photo", icon: ShieldCheck, run: go("/verify"), hint: "" },
      { group: "Actions", label: "Sign out", icon: LogOut, run: () => { void signOut(); }, hint: "" },
      ...(can("finding:triage")
        ? observations.filter((o) => o.review_status === "pending").map((o) => ({ group: "Pending observations", label: o.description, icon: ScanSearch, run: go(`/review?o=${o.id}`), hint: "" }))
        : []),
    ];
    const t = q.trim().toLowerCase();
    const filtered = t ? base.filter((b) => b.label.toLowerCase().includes(t)) : base;
    if (t) {
      filtered.push({ group: "Search", label: `Ask: “${q.trim()}”`, icon: Sparkles, run: () => window.dispatchEvent(new CustomEvent("rm:ask", { detail: q.trim() })), hint: "↵" });
      filtered.push({ group: "Search", label: `Search media for “${q.trim()}”`, icon: Search, run: go(`/search?q=${encodeURIComponent(q.trim())}`), hint: "" });
    }
    return filtered;
  }, [q, router, setHoodOpen, toggleTheme, observations, setAskOpen, setTour, signOut, can, user.role]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { if (paletteOpen) { setQ(""); setTimeout(() => inputRef.current?.focus(), 10); } }, [paletteOpen]);

  if (!paletteOpen) return null;
  const run = (k: number) => { items[k]?.run(); setPaletteOpen(false); };
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setPaletteOpen(false)}>
      <div className="card w-full max-w-xl overflow-hidden shadow-lift animate-fade-up" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Command className="size-4 text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); run(i); }
              if (e.key === "Escape") setPaletteOpen(false);
            }}
            placeholder="Type a command or ask: “bathroom stains from 2024”"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && <div className="p-6 text-center text-[13px] text-ink-3">No matches.</div>}
          {items.map((it, k) => {
            const header = it.group !== lastGroup ? ((lastGroup = it.group), <div key={`h-${it.group}`} className="eyebrow px-2.5 pb-1 pt-2.5">{it.group}</div>) : null;
            return (
              <div key={`${it.group}-${it.label}`}>
                {header}
                <button
                  onMouseEnter={() => setI(k)}
                  onClick={() => run(k)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]", k === i ? "bg-surface-2 text-ink" : "text-ink-2")}
                >
                  <it.icon className="size-4 shrink-0 text-ink-3" />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="font-mono text-[10.5px] text-ink-3">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto">Press <Kbd>?</Kbd> for all shortcuts</span>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStudio();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex items-start gap-3 p-3 shadow-lift animate-fade-up">
          <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", t.tone === "signal" ? "bg-signal text-white" : t.tone === "ok" ? "bg-ok text-white" : "bg-ink text-bg")}>
            <Check className="size-3" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{t.title}</div>
            {t.detail && <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{t.detail}</div>}
          </div>
          {t.undo && (
            <button className="btn-ghost h-7 px-2 text-[12px]" onClick={() => { t.undo!(); dismissToast(t.id); }}>
              <Undo2 className="size-3.5" /> Undo
            </button>
          )}
          <button className="text-ink-3 hover:text-ink" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = usePermissions();
  const shortcuts: [string, string][] = useMemo(() => {
    const list: [string, string][] = [
      ["⌘ K", "Command palette"],
      ["/", "Search"],
      ["U", "Under the hood"],
      [can("relet:access") ? "G then O / H / M / C / R / D / T / E / S / L" : "G then O / H / M / C / R / D / T / E / L", "Jump to a page"],
      ["⌘ J", "Ask RentalMove"],
    ];
    if (can("finding:triage")) {
      list.push(["A / R / E", "Review: accept, reject, edit"]);
      list.push(["J / K", "Review: next / previous"]);
    } else {
      list.push(["J / K", "Findings: next / previous"]);
    }
    list.push(["1–4", "Compare: switch mode"]);
    list.push(["?", "This sheet"]);
    return list;
  }, [can]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="card w-full max-w-md p-5 shadow-lift animate-fade-up" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="h-display text-[28px]">Keyboard</div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="divide-y divide-line">
          {shortcuts.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="text-ink-2">{v}</span>
              <span className="flex gap-1">{k.split(" ").map((p, i) => (p === "then" || p === "/" && k.length > 2 ? <span key={i} className="px-1 text-ink-3">{p}</span> : <Kbd key={i}>{p}</Kbd>))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Waits for real data; sends signed-out visitors to login. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, error } = useStudio();
  const path = usePathname();
  useEffect(() => {
    if (status === "anonymous") window.location.replace(`/login?redirectTo=${encodeURIComponent(path || "/")}`);
  }, [status, path]);
  if (status === "ready") return <ShellInner>{children}</ShellInner>;
  return (
    <div className="grid min-h-screen place-items-center p-6">
      {status === "error" ? (
        <div className="card max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 size-6 text-warn" />
          <div className="text-[15px] font-semibold">Could not load your property</div>
          <p className="mt-1 text-[13px] text-ink-3">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn-outline" onClick={() => window.location.reload()}>Retry</button>
            <Link className="btn-ghost" href="/welcome">Home</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-ink-3">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-[13px]">{status === "anonymous" ? "Redirecting to sign in…" : "Loading your property memory…"}</span>
        </div>
      )}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { setPaletteOpen, paletteOpen, setHoodOpen } = useStudio();
  const { can } = usePermissions();
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout>;
    const jump: Record<string, string> = { o: "/", h: "/map", s: "/relet", m: "/memory", c: "/capture", r: "/review", d: "/compare", t: "/timeline", e: "/report", l: "/lab", w: "/repairs" };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(!paletteOpen); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") { setSheet((s) => !s); return; }
      if (e.key === "/") { e.preventDefault(); router.push("/search"); return; }
      if (e.key.toLowerCase() === "u") { setHoodOpen(true); return; }
      if (g && jump[e.key.toLowerCase()]) {
        const dest = jump[e.key.toLowerCase()];
        if (dest === "/relet" && !can("relet:access")) {
          g = false;
          return;
        }
        router.push(dest);
        g = false;
        return;
      }
      if (e.key.toLowerCase() === "g") { g = true; clearTimeout(gTimer); gTimer = setTimeout(() => (g = false), 900); }
      if (e.key === "Escape") { setSheet(false); setHoodOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen, setHoodOpen, router, can]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-line lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute inset-y-0 left-0 w-[272px] border-r border-line bg-bg animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-8 md:px-8">{children}</main>
      </div>
      <Palette />
      <ShortcutSheet open={sheet} onClose={() => setSheet(false)} />
      <HoodDrawer />
      <Toasts />
    </div>
  );
}

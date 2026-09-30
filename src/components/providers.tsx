"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { hasView, setView, toView, type View } from "@/lib/view";
import type { Observation, ReviewStatus, Stance, ThreadComment, SignatureRecord, User } from "@/lib/view-types";

type Toast = { id: number; title: string; detail?: string; tone?: "ok" | "signal" | "neutral" | "danger"; undo?: () => void };

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

/** JSON fetch against our own API; throws ApiError with the server's message. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.message || body?.error || `Request failed (${res.status})`, body);
  return body as T;
}

interface Studio {
  // session + data
  status: "loading" | "anonymous" | "ready" | "error";
  error: string | null;
  sessionUser: User | null;
  view: View | null;
  version: number;
  refresh: () => Promise<void>;
  selectProperty: (id: string) => void;
  signOut: () => Promise<void>;
  // convenience (mirrors the view)
  user: User;
  observations: Observation[];
  stances: View["stances"];
  threads: Record<string, ThreadComment[]>;
  signatures: Partial<Record<"tenant" | "owner", SignatureRecord>>;
  // mutations → API
  review: (id: string, status: ReviewStatus, patch?: Partial<Observation>) => Promise<void>;
  setStance: (obsId: string, s: Stance | null) => Promise<void>;
  addComment: (obsId: string, text: string, voice?: { public_id: string; url: string; duration: number; lang: string; transcribed: boolean }) => Promise<void>;
  sign: (hash: string) => Promise<void>;
  unsign: () => Promise<void>;
  // ui
  theme: "light" | "dark";
  toggleTheme: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  hoodOpen: boolean;
  setHoodOpen: (v: boolean) => void;
  askOpen: boolean;
  setAskOpen: (v: boolean) => void;
  tour: { active: boolean; step: number; playing: boolean };
  setTour: (t: Partial<Studio["tour"]>) => void;
  live: boolean;
}

const Ctx = createContext<Studio | null>(null);

export function useStudio() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudio outside provider");
  return c;
}

const ANON: User = { id: "", name: "Guest", email: "", role: "tenant", initials: "?" };

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export interface InitialStudioData {
  sessionUser?: User | null;
  properties?: any[];
  propertyId?: string | null;
  snapshot?: any | null;
}

export function StudioProvider({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData?: InitialStudioData;
}) {
  const [status, setStatus] = useState<Studio["status"]>(() => {
    if (initialData?.snapshot && initialData?.sessionUser && initialData?.propertyId) return "ready";
    return "loading";
  });
  const [error, setError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<User | null>(() => {
    if (!initialData?.sessionUser) return null;
    const u = initialData.sessionUser;
    return {
      ...u,
      initials: u.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
    };
  });
  const [view, setViewState] = useState<View | null>(() => {
    if (initialData?.snapshot && initialData?.sessionUser && initialData?.propertyId) {
      const v = toView(initialData.snapshot, initialData.sessionUser, initialData.properties ?? []);
      setView(v);
      return v;
    }
    return null;
  });
  const [version, setVersion] = useState(0);
  const [propertyId, setPropertyId] = useState<string | null>(initialData?.propertyId ?? null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [tour, setTourState] = useState({ active: false, step: 0, playing: true });
  const [live, setLive] = useState(false);
  const propsRef = useRef<any[]>(initialData?.properties ?? []);
  const userRef = useRef<any>(initialData?.sessionUser ?? null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4600);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const applyView = useCallback((v: View | null) => {
    setView(v);
    setViewState(v);
    setVersion((n) => n + 1);
  }, []);

  const loadSnapshot = useCallback(async (pid: string) => {
    const snap = await api(`/api/properties/${encodeURIComponent(pid)}/snapshot`);
    applyView(toView(snap, userRef.current, propsRef.current));
  }, [applyView]);

  // Session + properties on mount.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");

    // If pre-hydrated from Server Component, avoid duplicate client waterfall
    if (initialData?.snapshot && initialData?.sessionUser && initialData?.propertyId) {
      return;
    }

    (async () => {
      try {
        const s = await api<{ authenticated: boolean; user: any }>("/api/auth/session");
        if (!s.authenticated || !s.user) { setStatus("anonymous"); return; }
        userRef.current = s.user;
        setSessionUser({ ...s.user, initials: s.user.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() });
        const { properties } = await api<{ properties: any[] }>("/api/properties");
        propsRef.current = properties;
        if (!properties.length) { setStatus("error"); setError("No property is linked to your account yet."); return; }
        const saved = readLS<string | null>("rm.property", null);
        const pid = properties.find((p) => p.id === saved)?.id ?? s.user.assigned_property_id ?? properties[0].id;
        setPropertyId(pid);
        await loadSnapshot(pid);
        setStatus("ready");
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 401) setStatus("anonymous");
        else { setStatus("error"); setError(e?.message || String(e)); }
      }
    })();
  }, [loadSnapshot, initialData]);

  const refresh = useCallback(async () => {
    if (!propertyId) return;
    try { await loadSnapshot(propertyId); } catch (e: any) { toast({ title: "Could not refresh", detail: e?.message, tone: "danger" }); }
  }, [propertyId, loadSnapshot, toast]);

  // Live updates, two transports feeding one debounced refresh:
  //  - Supabase Realtime broadcast (works across server instances and devices; production)
  //  - Server-sent events from this server's in-process bus (local development)
  useEffect(() => {
    if (status !== "ready" || !propertyId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void loadSnapshot(propertyId).catch(() => {}); }, 400);
    };
    let sseOpen = false, rtOpen = false;
    const update = () => setLive(sseOpen || rtOpen);

    const es = new EventSource(`/api/properties/${encodeURIComponent(propertyId)}/stream`);
    es.onopen = () => { sseOpen = true; update(); };
    es.onerror = () => { sseOpen = false; update(); };
    es.onmessage = (m) => {
      try { if (JSON.parse(m.data).type !== "hello") bump(); } catch {}
    };

    let channel: any = null;
    let cancelled = false;
    import("@/lib/supabase-client").then(({ getSupabaseBrowserClient }) => {
      if (cancelled) return;
      const sb = getSupabaseBrowserClient();
      channel = sb.channel(`rm-${propertyId}`).on("broadcast", { event: "change" }, bump).subscribe((st: string) => { rtOpen = st === "SUBSCRIBED"; update(); });
    }).catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(timer);
      es.close();
      if (channel) void channel.unsubscribe();
      setLive(false);
    };
  }, [status, propertyId, loadSnapshot]);

  const selectProperty = useCallback((id: string) => {
    writeLS("rm.property", id);
    setPropertyId(id);
    void loadSnapshot(id).catch((e) => toast({ title: "Could not load property", detail: e?.message, tone: "danger" }));
  }, [loadSnapshot, toast]);

  const signOut = useCallback(async () => {
    try {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase-client");
      await getSupabaseBrowserClient().auth.signOut();
    } catch {}
    await api("/api/auth/session", { method: "DELETE" }).catch(() => {});
    window.location.href = "/welcome";
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", n === "dark");
      writeLS("rm.theme", n);
      return n;
    });
  }, []);

  /** Optimistically patch the in-memory view, run the request, roll back on failure. */
  const optimistic = useCallback(async (mutate: (v: View) => View, request: () => Promise<unknown>, failTitle: string) => {
    const before = hasView() ? view : null;
    if (before) applyView(mutate(before));
    try {
      await request();
      if (propertyId) await loadSnapshot(propertyId);
    } catch (e: any) {
      if (before) applyView(before);
      toast({ title: failTitle, detail: e?.message, tone: "danger" });
      throw e;
    }
  }, [view, applyView, propertyId, loadSnapshot, toast]);

  const review = useCallback(async (id: string, status: ReviewStatus, patch: Partial<Observation> = {}) => {
    await optimistic(
      (v) => ({ ...v, observations: v.observations.map((o) => (o.id === id ? { ...o, ...patch, review_status: status } : o)) }),
      () => api(`/api/observations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: {
          review_status: status,
          reviewer_note: patch.reviewer_note ?? undefined,
          edited_category: status === "edited" ? patch.category : undefined,
          edited_description: status === "edited" ? patch.description : undefined,
        },
      }),
      "Review not saved"
    );
  }, [optimistic]);

  const setStance = useCallback(async (obsId: string, s: Stance | null) => {
    const role = sessionUser?.role ?? "tenant";
    await optimistic(
      (v) => {
        const cur = { ...(v.stances[obsId] ?? {}) };
        if (s) cur[role] = s; else delete cur[role];
        return { ...v, stances: { ...v.stances, [obsId]: cur } };
      },
      () => api(`/api/observations/${encodeURIComponent(obsId)}/stance`, { method: "POST", json: { stance: s } }),
      "Position not saved"
    );
  }, [optimistic, sessionUser]);

  const addComment = useCallback(async (obsId: string, text: string, voice?: { public_id: string; url: string; duration: number; lang: string; transcribed: boolean }) => {
    const me = sessionUser!;
    await optimistic(
      (v) => ({ ...v, threads: { ...v.threads, [obsId]: [...(v.threads[obsId] ?? []), { id: `tmp-${Date.now()}`, author: me.name, role: me.role, text, at: new Date().toISOString(), ...(voice ? { voice: { url: voice.url, duration: voice.duration, lang: voice.lang, transcribed: voice.transcribed } } : {}) }] } }),
      () => api(`/api/observations/${encodeURIComponent(obsId)}/comments`, { method: "POST", json: voice ? { text, voice: { public_id: voice.public_id, lang: voice.lang, transcribed: voice.transcribed } } : { text } }),
      "Comment not posted"
    );
  }, [optimistic, sessionUser]);

  const sign = useCallback(async (hash: string) => {
    if (!view) return;
    await optimistic(
      (v) => ({ ...v, signatures: { ...v.signatures, [v.user.role]: { at: new Date().toISOString(), hash, name: v.user.name } } }),
      () => api("/api/report/sign", { method: "POST", json: { property_id: view.property.id, hash } }),
      "Not signed"
    );
  }, [optimistic, view]);

  const unsign = useCallback(async () => {
    if (!view) return;
    await optimistic(
      (v) => { const s = { ...v.signatures }; delete s[v.user.role]; return { ...v, signatures: s }; },
      () => api("/api/report/sign", { method: "POST", json: { property_id: view.property.id, hash: null } }),
      "Could not withdraw signature"
    );
  }, [optimistic, view]);

  const setTour = useCallback((t: Partial<Studio["tour"]>) => setTourState((s) => ({ ...s, ...t })), []);

  const value = useMemo<Studio>(() => ({
    status, error, sessionUser, view, version, refresh, selectProperty, signOut,
    user: view?.user ?? sessionUser ?? ANON,
    observations: view?.observations ?? [],
    stances: view?.stances ?? {},
    threads: view?.threads ?? {},
    signatures: view?.signatures ?? {},
    review, setStance, addComment, sign, unsign,
    theme, toggleTheme, toast, toasts, dismissToast, paletteOpen, setPaletteOpen, hoodOpen, setHoodOpen, askOpen, setAskOpen, tour, setTour, live,
  }), [status, error, sessionUser, view, version, refresh, selectProperty, signOut, review, setStance, addComment, sign, unsign, theme, toggleTheme, toast, toasts, dismissToast, paletteOpen, hoodOpen, askOpen, tour, setTour, live]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

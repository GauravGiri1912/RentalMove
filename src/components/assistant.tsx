"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, X, ArrowUpRight, RotateCcw } from "lucide-react";
import { useStudio } from "./providers";
import { Crop } from "./ui";
import { answer, SUGGESTED, type Answer, type Block } from "@/lib/assistant";
import { hasView } from "@/lib/view";
import { getAsset } from "@/lib/view";
import { cn } from "@/lib/utils";

type Msg = { id: number; role: "user"; text: string } | { id: number; role: "ai"; answer: Answer };

export function AskPanel() {
  const { askOpen, setAskOpen, observations, stances, threads, setHoodOpen, status } = useStudio();
  const pendingQ = useRef<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [streaming, setStreaming] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (askOpen) setTimeout(() => input.current?.focus(), 30); }, [askOpen]);
  // Deep link: ?ask=<question> opens the panel and asks it.
  useEffect(() => {
    const q0 = new URLSearchParams(window.location.search).get("ask");
    if (q0) setTimeout(() => window.dispatchEvent(new CustomEvent("rm:ask", { detail: q0 })), 300);
  }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, streaming]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setAskOpen(!askOpen); setHoodOpen(false); }
      if (e.key === "Escape" && askOpen) setAskOpen(false);
    };
    const onAsk = (e: Event) => { setAskOpen(true); send((e as CustomEvent<string>).detail); };
    // A question that arrived before the property data loaded is answered once it has.
    if (status === "ready" && pendingQ.current) { const q0 = pendingQ.current; pendingQ.current = null; send(q0); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("rm:ask", onAsk);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("rm:ask", onAsk); };
  });

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    if (!hasView()) { pendingQ.current = t; return; }
    const id = Date.now();
    const a = answer(t, { observations, stances, threads });
    setMsgs((m) => [...m, { id, role: "user", text: t }, { id: id + 1, role: "ai", answer: a }]);
    setStreaming(id + 1);
    setQ("");
  }

  if (!askOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onMouseDown={() => setAskOpen(false)}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
      <aside className="relative flex h-full w-full max-w-[520px] flex-col border-l border-line bg-bg shadow-lift animate-fade-up" onMouseDown={(e) => e.stopPropagation()} aria-label="Ask RentalMove">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-signal text-white"><Sparkles className="size-4" /></span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Ask RentalMove</div>
            <div className="text-[12px] text-ink-3">Answers only from this property&apos;s records, with photo citations.</div>
          </div>
          {msgs.length > 0 && <button onClick={() => setMsgs([])} className="btn-ghost px-2" aria-label="New conversation"><RotateCcw className="size-4" /></button>}
          <button onClick={() => setAskOpen(false)} className="btn-ghost px-2" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          {msgs.length === 0 && (
            <div className="pt-6">
              <h2 className="h-display text-[36px]">What do you want to <em>know</em>?</h2>
              <p className="mt-2 text-[13px] text-ink-3">Try one of these — or ask in your own words.</p>
              <div className="mt-5 grid gap-2">
                {SUGGESTED.map((s, i) => (
                  <button key={s} onClick={() => send(s)} className="card flex items-center justify-between px-4 py-3 text-left text-[13.5px] transition hover:-translate-y-0.5 hover:shadow-lift animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                    {s} <ArrowUpRight className="size-4 text-ink-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end animate-fade-up">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[13.5px] text-bg">{m.text}</div>
              </div>
            ) : (
              <AiMessage key={m.id} answer={m.answer} stream={streaming === m.id} onDone={() => setStreaming(null)} onNavigate={() => setAskOpen(false)} />
            )
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="border-t border-line p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:ring-2 focus-within:ring-signal/30">
            <textarea
              ref={input}
              rows={1}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }}
              placeholder="Ask about any room, visit, or finding…"
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] outline-none placeholder:text-ink-3"
            />
            <button type="submit" disabled={!q.trim()} className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-bg transition disabled:opacity-30" aria-label="Send"><ArrowUp className="size-4" /></button>
          </div>
          <div className="mt-2 px-1 text-[11px] text-ink-3">Preview uses a rule-based engine over demo records. <kbd className="kbd">⌘</kbd> <kbd className="kbd">J</kbd> toggles.</div>
        </form>
      </aside>
    </div>
  );
}

function AiMessage({ answer, stream, onDone, onNavigate }: { answer: Answer; stream: boolean; onDone: () => void; onNavigate: () => void }) {
  const total = answer.blocks.reduce((n, b) => n + (b.kind === "text" ? b.text.split(" ").length : b.kind === "list" ? b.items.join(" ").split(" ").length : 6), 0);
  const [shown, setShown] = useState(stream ? 0 : total);
  useEffect(() => {
    if (!stream) return;
    const t = setInterval(() => setShown((s) => { if (s >= total) { clearInterval(t); onDone(); return s; } return s + 3; }), 28);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let budget = shown;
  const take = (b: Block): Block | null => {
    if (budget <= 0) return null;
    if (b.kind === "text") { const w = b.text.split(" "); const n = Math.min(w.length, budget); budget -= w.length; return { kind: "text", text: w.slice(0, n).join(" ") }; }
    if (b.kind === "list") { budget -= b.items.join(" ").split(" ").length; return b; }
    budget -= 6;
    return b;
  };
  const visible = answer.blocks.map(take).filter(Boolean) as Block[];
  const done = shown >= total;

  return (
    <div className="flex gap-3 animate-fade-up">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-signal/10 text-signal"><Sparkles className="size-3.5" /></span>
      <div className="min-w-0 flex-1 space-y-3">
        {visible.map((b, i) =>
          b.kind === "text" ? (
            <p key={i} className="text-[13.5px] leading-relaxed">{b.text}{!done && i === visible.length - 1 && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ink/60 align-middle" />}</p>
          ) : b.kind === "list" ? (
            <ul key={i} className="space-y-1.5 text-[13px] text-ink-2">{b.items.map((it) => <li key={it} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />{it}</li>)}</ul>
          ) : b.items.length ? (
            <div key={i} className="grid grid-cols-3 gap-2">
              {b.items.map((c, k) => {
                const a = getAsset(c.asset_id);
                return (
                  <Link key={k} href={`/rooms/${a.room_id}`} onClick={onNavigate} className="group animate-fade-up" style={{ animationDelay: `${k * 60}ms` }}>
                    {c.bbox ? <Crop src={a.thumb} bbox={c.bbox} imgW={a.width} imgH={a.height} aspect={4 / 3} className="rounded-lg ring-1 ring-line transition group-hover:ring-ink" /> : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumb} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-line transition group-hover:ring-ink" />
                    )}
                    <div className="mt-1 truncate font-mono text-[10px] text-ink-3"><span className="text-signal">[{k + 1}]</span> {c.caption}</div>
                  </Link>
                );
              })}
            </div>
          ) : null
        )}
        {done && answer.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 animate-fade-up">
            {answer.actions.map((a) => <Link key={a.href + a.label} href={a.href} onClick={onNavigate} className={cn("btn-outline h-8 text-[12px]")}>{a.label} <ArrowUpRight className="size-3.5" /></Link>)}
          </div>
        )}
      </div>
    </div>
  );
}

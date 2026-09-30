"use client";

import { useState } from "react";
import { Handshake, MessageSquare, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useStudio } from "./providers";
import type { Stance } from "@/lib/view-types";
import { cn, relTime } from "@/lib/utils";
import { VoiceClipPlayer, VoiceRecorder } from "./voice-note";

const ROLE_NAME = { tenant: "Alex · tenant", owner: "Sarah · owner" } as const;

export function StanceDot({ s }: { s?: Stance }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium", s === "agree" ? "bg-ok/10 text-ok" : s === "dispute" ? "bg-danger/10 text-danger" : "bg-surface-2 text-ink-3")}>
      {s === "agree" ? <ThumbsUp className="size-3" /> : s === "dispute" ? <ThumbsDown className="size-3" /> : null}
      {s ? (s === "agree" ? "Agrees" : "Disputes") : "No position"}
    </span>
  );
}

export function Parties({ obsId }: { obsId: string }) {
  const { user, stances, setStance, threads, addComment, toast } = useStudio();
  const mine = stances[obsId]?.[user.role];
  const both = stances[obsId]?.tenant === "agree" && stances[obsId]?.owner === "agree";
  const thread = threads[obsId] ?? [];
  const [text, setText] = useState("");

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="eyebrow flex items-center gap-1.5"><Handshake className="size-3" /> Both parties</div>
        {both && <span className="chip border-ok/30 text-ok">Agreed by both</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["tenant", "owner"] as const).map((r) => (
          <div key={r} className={cn("rounded-xl border p-2.5", r === user.role ? "border-ink/30 bg-surface-2/50" : "border-line")}>
            <div className="mb-1.5 text-[11px] text-ink-3">{ROLE_NAME[r]}{r === user.role && " (you)"}</div>
            <StanceDot s={stances[obsId]?.[r]} />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => { setStance(obsId, mine === "agree" ? null : "agree"); if (mine !== "agree") toast({ title: "You agree this is a change", tone: "ok" }); }} className={cn("btn h-8 border text-[12px]", mine === "agree" ? "border-ok bg-ok text-white" : "border-line hover:bg-surface-2")}><ThumbsUp className="size-3.5" /> Agree</button>
        <button onClick={() => { setStance(obsId, mine === "dispute" ? null : "dispute"); if (mine !== "dispute") toast({ title: "Marked as disputed", detail: "Add a note so the other side knows why" }); }} className={cn("btn h-8 border text-[12px]", mine === "dispute" ? "border-danger bg-danger text-white" : "border-line hover:bg-surface-2")}><ThumbsDown className="size-3.5" /> Dispute</button>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-2"><MessageSquare className="size-3.5" /> Discussion {thread.length > 0 && <span className="text-ink-3">· {thread.length}</span>}</div>
        <ol className="space-y-2">
          {thread.map((c) => (
            <li key={c.id} className={cn("flex gap-2", c.role === user.role && "flex-row-reverse text-right")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[9.5px] font-semibold", c.role === "owner" ? "bg-ink text-bg" : "bg-info/15 text-info")}>{c.author.split(" ").map((w) => w[0]).join("")}</span>
              <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed", c.role === user.role ? "bg-ink text-bg" : "bg-surface-2")}>
                {c.voice && <VoiceClipPlayer clip={c.voice} mine={c.role === user.role} />}
                {c.text}
                <div className={cn("mt-0.5 text-[10px]", c.role === user.role ? "text-bg/60" : "text-ink-3")}>{c.author} · {relTime(c.at)}</div>
              </div>
            </li>
          ))}
        </ol>
        <VoiceRecorder obsId={obsId} />
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addComment(obsId, text.trim()); setText(""); } }} className="mt-2 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply as ${user.name.split(" ")[0]}…`} className="input h-8 text-[12px]" />
          <button type="submit" disabled={!text.trim()} className="btn-primary h-8 px-2.5" aria-label="Send"><Send className="size-3.5" /></button>
        </form>
      </div>
    </div>
  );
}

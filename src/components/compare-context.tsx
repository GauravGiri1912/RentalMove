"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, Loader2 } from "lucide-react";
import { RoomMatchBadge } from "./visit";
import { api, useStudio } from "./providers";
import { getRoomMatch } from "@/lib/view";
import { roomCoverage } from "@/lib/insights";
import { MATCH_LABEL } from "@/lib/roommatch";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";
import type { Asset, Inspection } from "@/lib/view-types";

/**
 * What a comparison is, in plain words: which visit is "then" and which is "now", whether the app thinks both photos
 * show the same room (and why), and which parts of the room the two visits' photos actually cover. A comparison can
 * only speak about what is in both photos, so everything else is listed as not compared.
 */
export function CompareContext({ roomId, roomName, priorInsp, currentInsp, prior, current }: { roomId: string; roomName: string; priorInsp: Inspection; currentInsp: Inspection; prior: Asset; current: Asset }) {
  const { refresh, toast } = useStudio();
  const [checking, setChecking] = useState(false);
  const m = getRoomMatch(current.id);
  // Pixels only (no AI call, free): asks the server to compare this photo's framing with the room's earlier photos.
  const runCheck = async () => {
    setChecking(true);
    try { await api(`/api/assets/${current.id}/room-match`, { method: "POST", json: { action: "check" } }); await refresh(); }
    catch (e: any) { toast({ title: "Could not run the room check", detail: e?.message, tone: "danger" }); }
    finally { setChecking(false); }
  };
  const bad = m?.verdict === "mismatch", unsure = m?.verdict === "unclear";
  const covThen = roomCoverage(roomId, priorInsp.id), covNow = roomCoverage(roomId, currentInsp.id);
  const items = covNow?.items ?? covThen?.items ?? [];
  const inThen = new Set((covThen?.items ?? []).filter((i) => i.covered).map((i) => i.key));
  const inNow = new Set((covNow?.items ?? []).filter((i) => i.covered).map((i) => i.key));
  const both = items.filter((i) => inThen.has(i.key) && inNow.has(i.key));
  const notBoth = items.filter((i) => !(inThen.has(i.key) && inNow.has(i.key)));
  const known = !!covThen && !!covNow;

  return (
    <section className="card mt-3 p-4" data-testid="compare-context">
      <div className="grid grid-cols-2 gap-3 text-[12.5px]">
        <div data-testid="ctx-then"><div className="eyebrow">Then</div><div className="mt-0.5 font-semibold">{INSPECTION_LABEL[priorInsp.type]}</div><div className="text-ink-3">{fmtDate(priorInsp.captured_at)}</div></div>
        <div data-testid="ctx-now"><div className="eyebrow">Now</div><div className="mt-0.5 font-semibold">{INSPECTION_LABEL[currentInsp.type]}</div><div className="text-ink-3">{fmtDate(currentInsp.captured_at)}</div></div>
      </div>

      <div className="mt-3 border-t border-line pt-3 text-[12.5px]" data-testid="ctx-roommatch">
        <div className="flex items-start gap-2">
          {bad ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /> : unsure ? <HelpCircle className="mt-0.5 size-4 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
          <div className="min-w-0 flex-1">
            <div className={cn("font-medium", bad && "text-danger", unsure && "text-warn")}>Same room? {m ? MATCH_LABEL[m.verdict] : "Not checked yet"}</div>
            <div className="text-ink-3">{m?.reason ?? (m ? "" : `The check compares the two photos' framing; ${roomName} was filed under it by whoever took them.`)}</div>
            {(bad || unsure) && <div className="mt-1.5"><RoomMatchBadge asset={current} withConfirm /></div>}
            {!m && <button className="btn-outline mt-1.5 h-8 text-[12px]" onClick={runCheck} disabled={checking} data-testid="roomcheck-run">{checking ? <Loader2 className="size-3.5 animate-spin" /> : null} Check now</button>}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3 text-[12.5px]" data-testid="ctx-coverage">
        {known ? (
          <>
            <div className="font-medium">{both.length} of {items.length} areas appear in both visits&apos; photos</div>
            {notBoth.length > 0 ? (
              <p className="mt-0.5 text-ink-3">Not compared (missing from one or both visits): <span className="text-ink-2">{notBoth.map((i) => i.label.toLowerCase()).join(", ")}</span>. This comparison says nothing about them.</p>
            ) : <p className="mt-0.5 text-ink-3">Every checklist area is in both visits&apos; photos.</p>}
          </>
        ) : (
          <p className="text-ink-3"><span className="font-medium text-ink-2">Coverage not recorded for one of these visits</span>, so it is unknown which parts of the room the photos cover. Treat this comparison as covering only what is visible in both photos.</p>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3" data-testid="ctx-howitworks"><Info className="mt-0.5 size-3.5 shrink-0" /> RentalMove compares photos of the same room and flags differences. It does not decide who is responsible: a person decides what counts.</p>
    </section>
  );
}

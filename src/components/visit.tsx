"use client";

// Which photos belong where: the room-match badge on a photo (with "confirm"), all photos of
// a room at one visit, and a completeness summary for a whole visit.

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { assetFor, assetsFor, getInspection, getRoomMatch, getRooms, observationsFor } from "@/lib/view";
import { photoTimeOf, roomCoverage } from "@/lib/insights";
import { MATCH_LABEL } from "@/lib/roommatch";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";
import type { Asset } from "@/lib/view-types";

export function RoomMatchBadge({ asset, onDark, withConfirm }: { asset: Asset; onDark?: boolean; withConfirm?: boolean }) {
  const { refresh, toast } = useStudio();
  const [busy, setBusy] = useState(false);
  const m = getRoomMatch(asset.id);
  if (!m || m.verdict === "first" || m.verdict === "match") return null;
  const bad = m.verdict === "mismatch", unsure = m.verdict === "unclear";
  const confirm = async () => {
    setBusy(true);
    try {
      await api(`/api/assets/${asset.id}/room-match`, { method: "POST", json: { action: "confirm" } });
      await refresh();
      toast({ title: "Confirmed as this room", detail: "The photo can now be used for comparisons and the report.", tone: "ok" });
    } catch (e: any) {
      toast({ title: "Could not confirm", detail: e?.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={cn("inline-flex gap-1.5", onDark ? "items-center" : "flex-col items-start")} data-testid="room-match">
      <span
        title={m.reason ?? undefined}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10.5px]",
          onDark ? "text-white backdrop-blur" : "border",
          bad ? (onDark ? "bg-danger/90" : "border-danger/40 text-danger") : unsure ? (onDark ? "bg-warn/90" : "border-warn/40 text-warn") : onDark ? "bg-black/60" : "border-ok/40 text-ok",
        )}
      >
        {bad ? <AlertTriangle className="size-3" /> : unsure ? <HelpCircle className="size-3" /> : <ShieldCheck className="size-3" />}
        {MATCH_LABEL[m.verdict]}{m.verdict === "confirmed" && m.by ? ` by ${m.by}` : ""}
      </span>
      {withConfirm && (bad || unsure) && (
        <button onClick={confirm} disabled={busy} className={cn("rounded-md px-2 py-1 text-[10.5px] font-medium", onDark ? "bg-white text-black hover:bg-white/90" : "btn-outline h-7")} data-testid="room-confirm">
          {busy ? <Loader2 className="size-3 animate-spin" /> : "It is this room"}
        </button>
      )}
    </span>
  );
}

/** Every photo of a room at one visit, marking the one used for comparisons. */
export function VisitPhotos({ roomId, inspectionId }: { roomId: string; inspectionId: string }) {
  const photos = assetsFor(roomId, inspectionId);
  const primary = assetFor(roomId, inspectionId);
  if (photos.length <= 1 && !photos.some((p) => getRoomMatch(p.id)?.verdict === "mismatch")) return null;
  return (
    <div className="card p-3" data-testid="visit-photos">
      <div className="mb-2 flex items-center justify-between text-[12.5px]">
        <span className="font-semibold">Photos of this room at this visit · {photos.length}</span>
        <span className="text-[11px] text-ink-3">Compared and reported: the best match with earlier photos</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <figure key={p.id} className={cn("w-40 shrink-0 overflow-hidden rounded-lg border", p.id === primary?.id ? "border-ink" : "border-line")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt="" className="aspect-[4/3] w-full object-cover" />
            <figcaption className="space-y-1 p-1.5 text-[10.5px] text-ink-3">
              <div>{p.id === primary?.id ? <span className="font-semibold text-ink">Used for comparison</span> : "Extra evidence"} · {observationsFor(p.id).length} finding{observationsFor(p.id).length === 1 ? "" : "s"}</div>
              <RoomMatchBadge asset={p} withConfirm />
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Is this visit complete? Rooms, checklist items, photos that need a look. */
export function VisitCompleteness({ inspectionId, compact }: { inspectionId: string; compact?: boolean }) {
  const insp = getInspection(inspectionId);
  if (!insp) return null;
  const rooms = getRooms();
  const perRoom = rooms.map((r) => {
    const photos = assetsFor(r.id, insp.id);
    return { room: r, photos, primary: assetFor(r.id, insp.id), cov: roomCoverage(r.id, insp.id) };
  });
  const captured = perRoom.filter((x) => x.primary).length;
  const covTotal = perRoom.reduce((n, x) => n + (x.cov?.total ?? 0), 0), covDone = perRoom.reduce((n, x) => n + (x.cov?.covered ?? 0), 0);
  const all = perRoom.flatMap((x) => x.photos.map((p) => ({ p, room: x.room })));
  const mismatched = all.filter(({ p }) => getRoomMatch(p.id)?.verdict === "mismatch");
  const unclear = all.filter(({ p }) => getRoomMatch(p.id)?.verdict === "unclear");
  const timeWarn = all.filter(({ p }) => photoTimeOf(p)?.level === "warn");
  const failed = all.filter(({ p }) => p.analysis_status === "failed");
  const missingRooms = perRoom.filter((x) => !x.primary);
  const issues: { key: string; text: string; href: string; tone: "warn" | "danger" }[] = [
    ...missingRooms.map((x) => ({ key: `m-${x.room.id}`, text: `${x.room.name}: no usable photo yet`, href: `/capture?room=${x.room.id}`, tone: "danger" as const })),
    ...mismatched.map(({ p, room }) => ({ key: `x-${p.id}`, text: `${room.name}: a photo doesn't match this room`, href: `/capture?room=${room.id}`, tone: "danger" as const })),
    ...unclear.map(({ p, room }) => ({ key: `u-${p.id}`, text: `${room.name}: a photo needs a "this is the room" check`, href: `/capture?room=${room.id}`, tone: "warn" as const })),
    ...timeWarn.map(({ p, room }) => ({ key: `t-${p.id}`, text: `${room.name}: ${photoTimeOf(p)!.label.toLowerCase()}`, href: `/capture?room=${room.id}`, tone: "warn" as const })),
    ...failed.map(({ p, room }) => ({ key: `f-${p.id}`, text: `${room.name}: analysis failed — retry from Compare`, href: `/compare?room=${room.id}`, tone: "warn" as const })),
    ...perRoom.filter((x) => x.cov && x.cov.covered < x.cov.total).map((x) => ({ key: `c-${x.room.id}`, text: `${x.room.name}: ${x.cov!.items.filter((i) => !i.covered).map((i) => i.label.toLowerCase()).join(", ")} not in any photo`, href: `/capture?room=${x.room.id}`, tone: "warn" as const })),
  ];
  const complete = issues.length === 0;
  return (
    <div className={cn("card p-4", compact && "p-3")} data-testid="visit-completeness">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {complete ? <CheckCircle2 className="size-4 text-ok" /> : <CircleDashed className="size-4 text-warn" />}
        <span className="text-[13px] font-semibold">{INSPECTION_LABEL[insp.type]} · {fmtDate(insp.captured_at)}: {complete ? "complete" : "not complete yet"}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-[11.5px]">
        <span className="chip">{captured}/{rooms.length} rooms</span>
        {covTotal > 0 && <span className="chip">{covDone}/{covTotal} checklist items</span>}
        <span className={cn("chip", mismatched.length && "border-danger/40 text-danger")}>{mismatched.length} photo{mismatched.length === 1 ? "" : "s"} not matching</span>
        <span className={cn("chip", timeWarn.length && "border-warn/40 text-warn")}>{timeWarn.length} time warning{timeWarn.length === 1 ? "" : "s"}</span>
      </div>
      {!complete && (
        <ul className="space-y-1 text-[12px]">
          {issues.slice(0, compact ? 4 : 12).map((i) => (
            <li key={i.key}>
              <Link href={i.href} className={cn("hover:underline", i.tone === "danger" ? "text-danger" : "text-warn")}>{i.text}</Link>
            </li>
          ))}
          {issues.length > (compact ? 4 : 12) && <li className="text-ink-3">+{issues.length - (compact ? 4 : 12)} more</li>}
        </ul>
      )}
    </div>
  );
}

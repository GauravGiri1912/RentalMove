// Grounded answer engine for "Ask RentalMove". It never invents facts: every sentence is
// built from this property's live records (the snapshot), and every claim carries a photo
// citation. It is deliberately rule-based: answers are reproducible and cost no model
// tokens; an LLM could be swapped in behind the same contract (text + citations + actions).

import { getAssets, getComparisons, getInspections, getRooms, parseQuery, reportPair, observationsFor } from "./view";
import type { Asset, BBox, Observation, RoomCategory } from "./view-types";
import { CATEGORY_META_LABEL, INSPECTION_LABEL, fmtDate, shortHash } from "./utils";
import { certaintyFor, photoAbstain, photoTimeOf, roomCoverage, trendLabel, trendOf, workOrderOf } from "./insights";

export interface Cite { asset_id: string; bbox?: BBox; caption: string }
export type Block = { kind: "text"; text: string } | { kind: "cites"; items: Cite[] } | { kind: "list"; items: string[] };
export interface Answer { blocks: Block[]; actions: { label: string; href: string }[] }

interface Ctx {
  observations: Observation[];
  stances: Record<string, Partial<Record<"tenant" | "owner", "agree" | "dispute">>>;
  threads: Record<string, { author: string; text: string }[]>;
}

export const SUGGESTED = [
  "What changed in the kitchen?",
  "Summarise the latest inspection",
  "What was already there at move-in?",
  "What's still waiting for review?",
  "Is anything disputed?",
  "What got worse?",
  "What needs repair?",
  "What did the photos miss?",
  "When were the photos taken?",
  "What is the AI not sure about?",
  "How do I know the photos weren't edited?",
];

export function answer(q: string, ctx: Ctx): Answer {
  const s = q.toLowerCase();
  const rooms = getRooms();
  const assets = getAssets();
  const assetById = (id: string) => assets.find((a) => a.id === id);
  const roomName = (assetId: string) => rooms.find((r) => r.id === assetById(assetId)?.room_id)?.name ?? "Room";
  const room: RoomCategory | undefined = parseQuery(q).room;
  const roomIds = room ? rooms.filter((r) => r.category === room).map((r) => r.id) : null;
  const { baseline, current } = reportPair();
  const currentAssets = new Set(assets.filter((a) => a.inspection_id === current?.id).map((a) => a.id));
  const inspLabel = (a?: Asset) => {
    const i = a && getInspections().find((x) => x.id === a.inspection_id);
    return i ? `${INSPECTION_LABEL[i.type]} ${new Date(i.captured_at).getFullYear()}` : "";
  };
  const baselineCite = (o: Observation): Cite[] => {
    const a = assetById(o.asset_id);
    const base = a && baseline && assets.find((x) => x.room_id === a.room_id && x.inspection_id === baseline.id);
    return base ? [{ asset_id: base.id, bbox: o.bbox, caption: `${roomName(base.id)} · ${inspLabel(base)}` }] : [];
  };

  if (/repair|fix|work order|contractor/.test(s)) {
    const confirmed = ctx.observations.filter((o) => currentAssets.has(o.asset_id) && !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited"));
    const open = confirmed.filter((o) => workOrderOf(o) && workOrderOf(o)!.status !== "done");
    const done = ctx.observations.filter((o) => workOrderOf(o)?.status === "done");
    const none = confirmed.filter((o) => !workOrderOf(o));
    if (!open.length && !done.length && !none.length) return { blocks: [{ kind: "text", text: "No confirmed new findings on the latest visit, so nothing is waiting for a repair." }], actions: [{ label: "Open review", href: "/review" }] };
    const cites = (list: Observation[]) => list.slice(0, 3).map((o) => ({ asset_id: o.asset_id, bbox: o.bbox, caption: `${roomName(o.asset_id)} · ${CATEGORY_META_LABEL[o.category]}` }));
    return {
      blocks: [
        { kind: "text", text: `${open.length} repair${open.length === 1 ? " is" : "s are"} open, ${done.length} marked repaired, and ${none.length} confirmed new finding${none.length === 1 ? " has" : "s have"} no work order yet.` },
        ...(open.length ? [{ kind: "cites", items: cites(open) } as Block] : []),
        ...(none.length ? [{ kind: "text", text: "Not requested yet:" } as Block, { kind: "cites", items: cites(none) } as Block] : []),
      ],
      actions: [{ label: "Open repairs", href: "/repairs" }],
    };
  }

  if (/worse|grew|grow|spread|bigger|mou?ld|trend/.test(s)) {
    const measured = ctx.observations
      .filter((o) => currentAssets.has(o.asset_id) && o.review_status !== "rejected" && (!roomIds || roomIds.includes(assetById(o.asset_id)?.room_id ?? "")))
      .map((o) => ({ o, t: trendOf(o) }))
      .filter((x) => x.t && x.t.kind === "grew")
      .sort((a, b) => (b.t!.ratio ?? 0) - (a.t!.ratio ?? 0));
    if (!measured.length) return { blocks: [{ kind: "text", text: "Nothing measured as growing between visits. Growth is measured from changed pixels at each finding's spot, compared with move-in; findings on a room's first follow-up visit can only read as new." }], actions: [{ label: "Open review", href: "/review" }] };
    return {
      blocks: [
        { kind: "text", text: `${measured.length} finding${measured.length === 1 ? "" : "s"} grew since the previous visit:` },
        { kind: "list", items: measured.map(({ o, t }) => `${roomName(o.asset_id)} — ${CATEGORY_META_LABEL[o.category].toLowerCase()} (${o.sub_area}): ${trendLabel(t!).toLowerCase()}`) },
        { kind: "cites", items: measured.slice(0, 3).map(({ o }) => ({ asset_id: o.asset_id, bbox: o.bbox, caption: `${roomName(o.asset_id)} · ${inspLabel(assetById(o.asset_id))}` })) },
      ],
      actions: [{ label: "Look closer", href: `/review?o=${measured[0].o.id}` }],
    };
  }

  if (/not sure|unsure|uncertain|abstain|confiden|could(n't| not) (judge|tell)/.test(s)) {
    const cur = ctx.observations.filter((o) => currentAssets.has(o.asset_id) && o.review_status !== "rejected");
    const unsure = cur.filter((o) => certaintyFor(o as any).unsure);
    const pixelOnly = cur.filter((o) => certaintyFor(o as any).pixel_only);
    const abstained = assets.filter((a) => a.inspection_id === current?.id && photoAbstain(a));
    const blocks: Block[] = [{ kind: "text", text: `On the latest visit the AI is not sure about ${unsure.length} of ${cur.length} finding${cur.length === 1 ? "" : "s"}${abstained.length ? `, and could not judge ${abstained.length} photo${abstained.length === 1 ? "" : "s"}` : ""}. ${pixelOnly.length} more ${pixelOnly.length === 1 ? "is a change" : "are changes"} the pixels found but the model did not describe.` }];
    if (unsure.length) {
      blocks.push({ kind: "list", items: unsure.map((o) => `${roomName(o.asset_id)} — ${CATEGORY_META_LABEL[o.category].toLowerCase()}: ${certaintyFor(o as any).reasons.join("; ").toLowerCase()}`) });
      blocks.push({ kind: "cites", items: unsure.slice(0, 3).map((o) => ({ asset_id: o.asset_id, bbox: o.bbox, caption: `${roomName(o.asset_id)} · not sure` })) });
    }
    for (const a of abstained) blocks.push({ kind: "text", text: `${roomName(a.id)}: ${photoAbstain(a)}.` });
    return { blocks, actions: unsure.length ? [{ label: "Check them", href: `/review?o=${unsure[0].id}` }] : [] };
  }

  if (/when .*taken|photo time|exif|taken before|timestamp|date.*photo/.test(s)) {
    const rows = assets.map((a) => ({ a, c: photoTimeOf(a) })).filter((x) => x.c);
    if (!rows.length) return { blocks: [{ kind: "text", text: "The capture time inside the photo files has not been read yet." }], actions: [] };
    const warn = rows.filter((x) => x.c!.level === "warn");
    const none = rows.filter((x) => x.c!.level === "none").length;
    const ok = rows.filter((x) => x.c!.level === "ok").length;
    return {
      blocks: [
        { kind: "text", text: `${ok} photo${ok === 1 ? "'s" : "s'"} capture time matches its visit, ${warn.length} ${warn.length === 1 ? "needs" : "need"} a look, and ${none} carr${none === 1 ? "ies" : "y"} no capture time in the file (normal for in-app captures, screenshots and messaging apps).` },
        ...(warn.length ? [{ kind: "list", items: warn.map((x) => `${roomName(x.a.id)} · ${inspLabel(x.a)}: ${x.c!.detail}`) } as Block, { kind: "cites", items: warn.slice(0, 3).map((x) => ({ asset_id: x.a.id, caption: `${roomName(x.a.id)} · ${x.c!.label}` })) } as Block] : []),
      ],
      actions: [{ label: "Integrity appendix", href: "/report" }],
    };
  }

  if (/miss|coverage|checklist|not photographed|forgot|gap/.test(s)) {
    const insp = current ?? baseline;
    const rows = rooms.flatMap((r) => {
      const cov = insp ? roomCoverage(r.id, insp.id) : null;
      return cov ? [{ r, cov, gaps: cov.items.filter((i) => !i.covered) }] : [];
    });
    if (!rows.length) return { blocks: [{ kind: "text", text: "No coverage data yet — it is recorded when photos are analysed." }], actions: [{ label: "Capture", href: "/capture" }] };
    const withGaps = rows.filter((x) => x.gaps.length);
    return {
      blocks: [
        { kind: "text", text: withGaps.length ? `${withGaps.length} of ${rows.length} rooms have gaps in the latest visit's photos:` : "Every checklist item is visible in the latest visit's photos." },
        ...(withGaps.length ? [{ kind: "list", items: withGaps.map((x) => `${x.r.name}: ${x.gaps.map((g) => `${g.label.toLowerCase()} (${g.why.replace(/\.$/, "").toLowerCase()})`).join("; ")}`) } as Block] : []),
      ],
      actions: withGaps.length ? [{ label: `Capture ${withGaps[0].r.name}`, href: `/capture?room=${withGaps[0].r.id}` }] : [],
    };
  }

  if (/disput|disagree|argu|contest|object/.test(s)) {
    const disputed = Object.entries(ctx.stances)
      .filter(([, v]) => v.tenant === "dispute" || v.owner === "dispute")
      .map(([id]) => ctx.observations.find((o) => o.id === id))
      .filter((o): o is Observation => !!o);
    if (!disputed.length) return { blocks: [{ kind: "text", text: "Nothing is disputed right now. Both parties either agree or haven't taken a position on each finding." }], actions: [{ label: "Open review", href: "/review" }] };
    return {
      blocks: [
        { kind: "text", text: disputed.length === 1 ? "1 finding is disputed." : `${disputed.length} findings are disputed.` },
        ...disputed.flatMap((o): Block[] => {
          const who = ctx.stances[o.id].tenant === "dispute" && ctx.stances[o.id].owner === "dispute" ? "both parties" : ctx.stances[o.id].tenant === "dispute" ? "the tenant" : "the owner";
          const first = ctx.threads[o.id]?.[0];
          return [
            { kind: "text", text: `${roomName(o.asset_id)} — “${o.description}” is disputed by ${who}.${first ? ` ${first.author} wrote: “${first.text}”` : ""}` },
            { kind: "cites", items: [{ asset_id: o.asset_id, bbox: o.bbox, caption: `${roomName(o.asset_id)} · ${inspLabel(assetById(o.asset_id))}` }, ...baselineCite(o)] },
          ];
        }),
      ],
      actions: [{ label: "Discuss in review", href: `/review?o=${disputed[0].id}` }],
    };
  }

  if (/review|pending|decid|left to|waiting|to do/.test(s)) {
    const pending = ctx.observations.filter((o) => o.review_status === "pending" && currentAssets.has(o.asset_id));
    if (!pending.length) return { blocks: [{ kind: "text", text: "Every finding in the latest inspection has a human decision. The report can be shared." }], actions: [{ label: "Open report", href: "/report" }] };
    const fresh = pending.filter((o) => !o.pre_existing);
    return {
      blocks: [
        { kind: "text", text: `${pending.length} finding${pending.length === 1 ? " is" : "s are"} waiting — ${fresh.length} new since move-in and ${pending.length - fresh.length} matching the move-in photos. The lowest-confidence ones are worth checking first:` },
        { kind: "cites", items: [...pending].sort((a, b) => a.confidence - b.confidence).slice(0, 3).map((o) => ({ asset_id: o.asset_id, bbox: o.bbox, caption: `${CATEGORY_META_LABEL[o.category]} · ${Math.round(o.confidence * 100)}%` })) },
      ],
      actions: [{ label: `Review ${pending.length} finding${pending.length === 1 ? "" : "s"}`, href: "/review" }],
    };
  }

  if (/already|pre-?exist|before (they|the tenant|move)|at move[- ]?in|baseline|was there/.test(s)) {
    const base = ctx.observations.filter((o) => {
      const a = assetById(o.asset_id);
      return a && a.inspection_id === baseline?.id && o.review_status !== "rejected" && (!roomIds || roomIds.includes(a.room_id));
    });
    if (!baseline) return { blocks: [{ kind: "text", text: "There is no move-in inspection recorded yet." }], actions: [{ label: "Start a capture", href: "/capture" }] };
    return {
      blocks: [
        { kind: "text", text: `At move-in on ${fmtDate(baseline.captured_at)}, ${base.length} condition item${base.length === 1 ? " was" : "s were"} recorded${room ? ` in the ${room.replace("_", " ")}` : ""}. Findings at the same spot later are marked pre-existing:` },
        ...(base.length ? [{ kind: "list" as const, items: base.map((o) => `${roomName(o.asset_id)}: ${o.description}`) }] : []),
        { kind: "cites", items: base.slice(0, 4).map((o) => ({ asset_id: o.asset_id, bbox: o.bbox, caption: `${roomName(o.asset_id)} · move-in` })) },
      ],
      actions: [{ label: "See the property memory", href: "/memory" }],
    };
  }

  if (/hash|tamper|edit|alter|proof|trust|verif|fake|genuine|real/.test(s)) {
    const a = assets.find((x) => currentAssets.has(x.id) && x.sha256) ?? assets.find((x) => x.sha256);
    return {
      blocks: [
        { kind: "text", text: "Each photo is hashed with SHA-256 from its original bytes, and the hash is printed in the report. Anyone can recompute it — or drop the file on the Verify page. If a single byte changed, the hash won't match." },
        ...(a ? [{ kind: "text" as const, text: `Example — ${roomName(a.id).toLowerCase()}: ${shortHash(a.sha256, 16)}. Originals in Cloudinary are never modified; every view is a derived URL.` }, { kind: "cites" as const, items: [{ asset_id: a.id, caption: `sha256 ${a.sha256.slice(0, 8)}…` }] }] : []),
      ],
      actions: [{ label: "Verify a photo", href: "/verify" }, { label: "Integrity appendix", href: "/report" }],
    };
  }

  if (/privacy|people|person|face|someone|human/.test(s)) {
    const withPeople = assets.filter((a) => a.people_detected);
    return {
      blocks: [
        { kind: "text", text: `${withPeople.length} photo${withPeople.length === 1 ? "" : "s"} contain a face (detected by Cloudinary). Shared reports use e_pixelate_faces, which hides faces without inventing pixels — so the photo is still evidence. Generative removal is used only for listing photos in the Re-let studio, never for evidence.` },
        { kind: "cites", items: withPeople.map((a) => ({ asset_id: a.id, caption: `${roomName(a.id)} · ${inspLabel(a)}` })) },
      ],
      actions: [{ label: "Try it in the media lab", href: "/lab" }, { label: "Re-let studio", href: "/relet" }],
    };
  }

  if (/re-?used|duplicate|same photo|copied|old photo/.test(s)) {
    const reused = assets.filter((a) => a.reused_of);
    return {
      blocks: [
        { kind: "text", text: reused.length ? `${reused.length} photo${reused.length === 1 ? " is" : "s are"} flagged as re-used — the same image as an earlier photo (Cloudinary perceptual hash, confirmed on aligned pixels).` : "No photo is flagged as re-used. Every capture is compared with earlier ones by perceptual hash, then confirmed on aligned pixels." },
        ...(reused.length ? [{ kind: "cites" as const, items: reused.map((a) => ({ asset_id: a.id, caption: `${roomName(a.id)} · ${inspLabel(a)}` })) }] : []),
      ],
      actions: [{ label: "Open property memory", href: "/memory" }],
    };
  }

  if (/report|share|send|pdf|landlord|agent|sign/.test(s)) {
    const included = ctx.observations.filter((o) => currentAssets.has(o.asset_id) && !o.pre_existing && ["accepted", "edited"].includes(o.review_status));
    return {
      blocks: [{ kind: "text", text: `The report currently includes ${included.length} reviewed change${included.length === 1 ? "" : "s"}. Pending and rejected findings are left out automatically. Share it by a link that expires and can be revoked — faces pixelated and, if you name a recipient, a watermark with their name.` }],
      actions: [{ label: "Open the report", href: "/report" }],
    };
  }

  if (/chang|new|differ|damage|worse|happen|summar|since|latest|move-?out/.test(s) || room) {
    const all = getComparisons().filter((c) => !roomIds || roomIds.includes(c.room_id));
    // Latest comparison per room.
    const byRoom = new Map<string, (typeof all)[number]>();
    for (const c of all) if (!byRoom.has(c.room_id)) byRoom.set(c.room_id, c);
    const cmps = [...byRoom.values()].filter((c) => c.changes.length);
    if (!cmps.length) {
      return { blocks: [{ kind: "text", text: room ? `No comparison has been run for the ${room.replace("_", " ")} yet.` : "No comparisons have been run yet." }], actions: [{ label: "Open compare", href: "/compare" }] };
    }
    const blocks: Block[] = [];
    const described = cmps.flatMap((c) => c.changes.filter((x) => x.kind !== "pixel"));
    const pixelOnly = cmps.flatMap((c) => c.changes.filter((x) => x.kind === "pixel"));
    if (!room || /summar|overall|all|everything|latest|move-?out/.test(s)) {
      blocks.push({ kind: "text", text: `Across ${cmps.length} compared room${cmps.length === 1 ? "" : "s"}: ${described.length} described change${described.length === 1 ? "" : "s"}${pixelOnly.length ? ` and ${pixelOnly.length} pixel-only change${pixelOnly.length === 1 ? "" : "s"} to check by eye` : ""}.` });
    }
    for (const c of cmps) {
      const r = rooms.find((x) => x.id === c.room_id);
      blocks.push({ kind: "text", text: `${r?.name ?? "Room"}: ${c.summary}` });
      blocks.push({ kind: "cites", items: c.changes.filter((x) => x.bbox).slice(0, 3).map((x) => ({ asset_id: c.current_asset_id, bbox: x.bbox, caption: `${x.kind} · ${Math.round(x.confidence * 100)}%` })) });
    }
    return { blocks, actions: cmps.slice(0, 2).map((c) => ({ label: `Compare ${(rooms.find((x) => x.id === c.room_id)?.name ?? "room").toLowerCase()}`, href: `/compare?room=${c.room_id}` })) };
  }

  const f = parseQuery(q);
  if (Object.keys(f).length) {
    const hits = assets.filter((a) => {
      const r = rooms.find((x) => x.id === a.room_id);
      const i = getInspections().find((x) => x.id === a.inspection_id);
      if (f.room && r?.category !== f.room) return false;
      if (f.inspection_type && i?.type !== f.inspection_type) return false;
      if (f.issue_category && !observationsFor(a.id).some((o) => o.category === f.issue_category)) return false;
      return true;
    });
    if (hits.length) {
      return {
        blocks: [
          { kind: "text", text: `I found ${hits.length} photo${hits.length === 1 ? "" : "s"} matching that.` },
          { kind: "cites", items: hits.slice(0, 4).map((a) => ({ asset_id: a.id, bbox: observationsFor(a.id)[0]?.bbox, caption: `${roomName(a.id)} · ${inspLabel(a)}` })) },
        ],
        actions: [{ label: "Open in search", href: `/search?q=${encodeURIComponent(q)}` }],
      };
    }
  }
  return {
    blocks: [{ kind: "text", text: "I can only answer from this property's records — rooms, inspections, findings, reviews and files. Try asking what changed in a room, what was already there at move-in, or what still needs review." }],
    actions: [],
  };
}

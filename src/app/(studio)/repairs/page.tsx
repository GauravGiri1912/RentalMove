"use client";

import Link from "next/link";
import { useState } from "react";
import { Hammer, ArrowUpRight } from "lucide-react";
import { useStudio } from "@/components/providers";
import { CategoryBadge, Crop, Empty, PageHeader, Segmented } from "@/components/ui";
import { RepairEvidence } from "@/components/insights";
import { getAsset, getObservations, getRoom, getWorkOrders, reportPair } from "@/lib/view";
import { trendLabel, trendOf } from "@/lib/insights";
import { fmtDate } from "@/lib/utils";
import type { WorkOrder } from "@/lib/view-types";

const COLUMNS: { status: WorkOrder["status"]; label: string }[] = [
  { status: "open", label: "Requested" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Repaired" },
];

export default function RepairsPage() {
  const { view } = useStudio();
  const [tab, setTab] = useState<"board" | "candidates">("board");
  const orders = getWorkOrders();
  const obsById = new Map(getObservations().map((o) => [o.id, o]));
  const cur = reportPair().current;
  // Accepted/edited findings on the latest visit without a work order: what could be repaired.
  const candidates = getObservations().filter((o) => {
    const a = getAsset(o.asset_id);
    return a?.inspection_id === cur?.id && (o.review_status === "accepted" || o.review_status === "edited") && !o.pre_existing && !orders.some((w) => w.observation_id === o.id);
  });
  const isOwner = view?.user.role === "owner";

  return (
    <div>
      <PageHeader
        eyebrow="Repair loop"
        title={<>Repairs, <em>with proof</em></>}
        lede="Turn a confirmed finding into a work order, then close it with a repair photo taken from the same spot. The photo is checked against the original: same view, and is the change still there?"
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: "board", label: `Work orders · ${orders.length}` }, { value: "candidates", label: `Not yet requested · ${candidates.length}` }]} />}
      />

      {tab === "board" && (
        orders.length === 0 ? (
          <Empty icon={<Hammer className="size-5" />} title="No work orders yet" body={isOwner ? "Open a finding in Review and choose “Request a repair”." : "The owner has not requested any repairs."} action={<Link href="/review" className="btn-primary">Go to Review</Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-3" data-testid="repair-board">
            {COLUMNS.map((c) => {
              const list = orders.filter((w) => w.status === c.status);
              return (
                <section key={c.status} className="rounded-2xl bg-surface-2/50 p-2">
                  <div className="flex items-center justify-between px-2 py-1.5 text-[12.5px] font-semibold">{c.label}<span className="font-mono text-[11px] text-ink-3">{list.length}</span></div>
                  <div className="space-y-2">
                    {list.map((w) => {
                      const o = obsById.get(w.observation_id);
                      if (!o) return null;
                      const a = getAsset(o.asset_id);
                      const t = trendOf(o);
                      return (
                        <article key={w.id} className="card p-3" data-testid="repair-card">
                          <div className="flex gap-3">
                            <Crop src={a.thumb} bbox={o.bbox} imgW={a.width} imgH={a.height} className="w-16 shrink-0 rounded-md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5"><CategoryBadge c={o.category} /></div>
                              <div className="mt-1 truncate text-[12px] text-ink-3">{getRoom(a.room_id).name} · {o.sub_area}</div>
                              {w.assignee && <div className="truncate text-[12px]">→ {w.assignee}{w.due && <span className="text-ink-3"> · due {fmtDate(w.due, { day: "numeric", month: "short" })}</span>}</div>}
                            </div>
                          </div>
                          {t && <div className="mt-2 text-[11.5px] text-ink-3">{trendLabel(t)}</div>}
                          {w.photo && <div className="mt-3"><RepairEvidence obs={o} wo={w} /></div>}
                          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
                            <span>Updated {fmtDate(w.updated_at, { day: "numeric", month: "short" })}</span>
                            <Link href={`/review?o=${o.id}`} className="inline-flex items-center gap-0.5 font-medium text-info hover:underline">Open <ArrowUpRight className="size-3" /></Link>
                          </div>
                        </article>
                      );
                    })}
                    {list.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-ink-3">Nothing here.</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )
      )}

      {tab === "candidates" && (
        candidates.length === 0 ? (
          <Empty icon={<Hammer className="size-5" />} title="Nothing waiting" body="Every confirmed new finding on the latest visit already has a work order — or none are confirmed yet." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {candidates.map((o) => {
              const a = getAsset(o.asset_id);
              return (
                <Link key={o.id} href={`/review?o=${o.id}`} className={"card flex gap-3 p-3 transition hover:bg-surface-2/60"}>
                  <Crop src={a.thumb} bbox={o.bbox} imgW={a.width} imgH={a.height} className="w-20 shrink-0 rounded-md" />
                  <div className="min-w-0">
                    <CategoryBadge c={o.category} />
                    <p className="mt-1 line-clamp-2 text-[12.5px]">{o.description}</p>
                    <div className="mt-1 text-[11.5px] text-ink-3">{getRoom(a.room_id).name}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

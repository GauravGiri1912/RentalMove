"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CornerDownLeft, SearchX, Sparkles, X } from "lucide-react";
import { Empty, Kbd, Photo } from "@/components/ui";
import { CopyButton } from "@/components/hood";
import { getInspection, getProperty, getRoom, hitsFromResources, parseQuery, type SearchHit } from "@/lib/view";
import { api } from "@/components/providers";
import { Loader2 } from "lucide-react";
import { cn, fmtDate, INSPECTION_LABEL, ROOM_LABEL } from "@/lib/utils";
import type { SearchFilter } from "@/lib/view-types";

const SUGGESTIONS = ["kitchen scratches at move-out", "bathroom stains from 2024", "anything pending review", "bedroom dents", "cracks in the bathroom", "move-in baseline"];

const FILTER_LABEL: Record<keyof SearchFilter, string> = { room: "Room", inspection_type: "Visit", issue_category: "Issue", review_status: "Review", date_from: "From", date_to: "To", free_text: "Text" };

function valueLabel(k: keyof SearchFilter, v: string) {
  if (k === "room") return ROOM_LABEL[v] ?? v;
  if (k === "inspection_type") return INSPECTION_LABEL[v] ?? v;
  return v;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<SearchFilter>(() => parseQuery(params.get("q") ?? ""));
  const [ph, setPh] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % SUGGESTIONS.length), 2600); return () => clearInterval(t); }, []);
  useEffect(() => { setFilter(parseQuery(q)); }, [q]);

  // Real Cloudinary Search API via the server (whitelisted filter → safe expression).
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [expression, setExpression] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({ property_id: getProperty().id, ...(filter as Record<string, string>) });
        const r = await api<{ expression: string; resources: { public_id: string }[] }>(`/api/search?${qs}`);
        if (!live) return;
        setExpression(r.expression);
        setHits(hitsFromResources(r.resources, filter));
      } catch (e: any) {
        if (live) setErr(e?.message || String(e));
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const keys = (Object.keys(filter) as (keyof SearchFilter)[]).filter((k) => filter[k]);

  const submit = (text: string) => { setQ(text); router.replace(`/search?q=${encodeURIComponent(text)}`); };
  const remove = (k: keyof SearchFilter) => setFilter((f) => { const n = { ...f }; delete n[k]; if (k === "date_from" || k === "date_to") { delete n.date_from; delete n.date_to; } return n; });

  return (
    <div>
      <div className="mx-auto mb-8 max-w-3xl pt-4 text-center animate-fade-up">
        <div className="eyebrow mb-3">Ask the property</div>
        <h1 className="h-display text-[48px] md:text-[64px]">Find <em>any</em> moment.</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="mx-auto max-w-3xl">
        <div className="card flex items-center gap-3 px-4 shadow-lift focus-within:ring-2 focus-within:ring-signal/30">
          <Sparkles className="size-5 shrink-0 text-signal" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Try “${SUGGESTIONS[ph]}”`}
            className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
            aria-label="Search in plain language"
          />
          {q && <button type="button" onClick={() => submit("")} className="text-ink-3 hover:text-ink" aria-label="Clear"><X className="size-4" /></button>}
          <Kbd><CornerDownLeft className="size-3" /></Kbd>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className={cn("chip transition hover:border-ink-3 hover:text-ink", q === s && "border-ink text-ink")}>{s}</button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="eyebrow">Understood as</div>
            <CopyButton text={expression} label="Copy expression" />
          </div>
          <div className="mb-3 flex min-h-[26px] flex-wrap gap-1.5">
            {keys.length === 0 && <span className="text-[12.5px] text-ink-3">Everything at {getProperty().address_label}</span>}
            {keys.filter((k) => k !== "date_to").map((k) => (
              <span key={k} className="chip border-ink/15 bg-surface pr-1 text-ink animate-fade-up">
                <span className="text-ink-3">{k === "date_from" ? "Year" : FILTER_LABEL[k]}</span>
                <span className="font-medium">{k === "date_from" ? filter.date_from!.slice(0, 4) : valueLabel(k, String(filter[k]))}</span>
                <button type="button" onClick={() => remove(k)} className="grid size-4 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Remove ${FILTER_LABEL[k]}`}><X className="size-3" /></button>
              </span>
            ))}
          </div>
          <code className="block break-all font-mono text-[12px] leading-relaxed">
            {expression.split(" AND ").map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="text-ink-3"> AND </span>}
                <span className="text-info">{c.split(/(=|>=|<=|:)/)[0]}</span>
                <span className="text-ink-3">{c.match(/(>=|<=|=|:)/)?.[0]}</span>
                <span className="text-signal">{c.split(/>=|<=|=|:/).slice(1).join(":")}</span>
              </span>
            ))}
          </code>
          <p className="mt-2 text-[11.5px] text-ink-3">The exact expression the server sent to the Cloudinary Search API. Plain language is mapped to a whitelisted filter first; free text never reaches Cloudinary unescaped. Years filter on the capture date, not the upload date.</p>
        </div>
      </form>

      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold">{loading && <Loader2 className="size-3.5 animate-spin text-ink-3" />}{hits.length} photo{hits.length === 1 ? "" : "s"}</div>
          <div className="font-mono text-[11px] text-ink-3">Cloudinary Search API · sorted by capture date</div>
        </div>
        {err ? (
          <Empty icon={<SearchX className="size-5" />} title="Search failed" body={err} />
        ) : hits.length === 0 ? (
          <Empty icon={<SearchX className="size-5" />} title="Nothing matches" body="Try removing a filter, or ask about a different room or year." action={<button className="btn-outline" onClick={() => submit("")}>Clear search</button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {hits.sort((a, b) => b.asset.captured_at.localeCompare(a.asset.captured_at)).map(({ asset, observations }, i) => {
              const room = getRoom(asset.room_id);
              const insp = getInspection(asset.inspection_id);
              return (
                <article key={asset.id} className="card overflow-hidden animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <Photo src={asset.thumb} alt={room.name} observations={observations} showLabels={false} rounded={false} className="aspect-[4/3]" />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-semibold">{room.name}</span>
                      <span className="font-mono text-[11px] text-ink-3">{INSPECTION_LABEL[insp.type]} · {fmtDate(insp.captured_at, { month: "short", year: "numeric" })}</span>
                    </div>
                    {observations.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {observations.slice(0, 2).map((o) => <li key={o.id} className="flex gap-2 text-[12px] leading-snug text-ink-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />{o.description}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[12px] text-ink-3">No findings on this photo.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

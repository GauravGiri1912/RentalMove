"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, CircleAlert, EyeOff, Loader2, ShieldCheck, Stamp } from "lucide-react";
import { CATEGORY_META } from "@/components/ui";
import { StanceDot } from "@/components/parties";
import { cn, fmtDate, INSPECTION_LABEL, shortHash } from "@/lib/utils";
import { fmtDateL, makeT, REPORT_LANGS, type ReportLang } from "@/lib/report-i18n";

/** Public, read-only evidence report behind a share link. */
export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<ReportLang>("en");

  useEffect(() => {
    fetch(`/api/share/${token}`).then(async (r) => {
      const b = await r.json();
      if (!r.ok) setError(b.error || "This link is not valid.");
      else setData(b.report);
    }).catch(() => setError("Could not reach the server."));
  }, [token]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div><AlertTriangle className="mx-auto mb-3 size-8 text-warn" /><h1 className="h-display text-[40px]">Link unavailable</h1><p className="mt-2 text-[14px] text-ink-2">{error} Links expire, and the owner can revoke them at any time.</p></div>
      </main>
    );
  }
  if (!data) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-ink-3" /></main>;
  // Only translations cached by the owner/tenant view exist here; anything missing stays English.
  const t = makeT(lang, data.translations?.[lang] ?? {});

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10 md:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2">
        <ShieldCheck className="size-4 text-ok" /> Read-only shared report · expires {fmtDate(data.link.expires_at)}
        <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" /> faces pixelated</span>
        {data.link.recipient && <span className="inline-flex items-center gap-1"><Stamp className="size-3.5" /> watermarked for {data.link.recipient}</span>}
        <span className="ml-auto flex rounded-lg border border-line p-0.5" role="group" aria-label="Report language">
          {REPORT_LANGS.map((l) => (
            <button key={l.id} onClick={() => setLang(l.id)} aria-pressed={lang === l.id} className={cn("h-6 rounded-md px-2 text-[11.5px]", lang === l.id ? "bg-ink text-bg" : "text-ink-2")}>{l.label}</button>
          ))}
        </span>
      </div>
      <article lang={lang} className="card overflow-hidden">
        {lang !== "en" && <p className="border-b border-line bg-info/[.07] px-8 py-2 text-[12px] text-ink-2 md:px-12">{t("Machine translation. The English report is authoritative, and signatures cover its English content.")}</p>}
        <header className="border-b border-line p-8 md:p-12">
          <div className="eyebrow">{t("Condition evidence report")}</div>
          <h1 className="h-display mt-6 text-[48px] md:text-[60px]">{data.property.address_label}</h1>
          <div className="text-[15px] text-ink-2">{data.property.unit_label}</div>
          <div className="mt-8 grid grid-cols-1 gap-6 border-t border-line pt-6 sm:grid-cols-2">
            {data.baseline && <div><div className="eyebrow mb-1">{t("Baseline")}</div><div className="text-[14px] font-medium">{t(INSPECTION_LABEL[data.baseline.type])}</div><div className="text-[12.5px] text-ink-3">{fmtDateL(data.baseline.captured_at, lang)}</div></div>}
            {data.current && <div><div className="eyebrow mb-1">{t("Compared with")}</div><div className="text-[14px] font-medium">{t(INSPECTION_LABEL[data.current.type])}</div><div className="text-[12.5px] text-ink-3">{fmtDateL(data.current.captured_at, lang)}</div></div>}
          </div>
        </header>
        {data.rooms.filter((r: any) => r.before || r.after).map((room: any, ri: number) => (
          <section key={room.id} className="border-b border-line p-8 md:p-12">
            <h2 className="h-display mb-5 text-[32px]"><span className="mr-3 font-mono text-[13px] text-ink-3">{String(ri + 1).padStart(2, "0")}</span>{t(room.name)}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {room.before ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.before.url} alt={`${room.name} before`} className="aspect-[1200/896] w-full rounded-lg bg-surface-2 object-cover" />
              ) : <div className="grid aspect-[1200/896] place-items-center rounded-lg border border-dashed border-line text-[12px] text-ink-3">No baseline photo</div>}
              {room.after ? (
                // Findings drawn by Cloudinary into the image itself (signed evidence rendition).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.findings.length ? room.after.evidence_url : room.after.url} alt={`${room.name} after`} className="aspect-[1200/896] w-full rounded-lg bg-surface-2 object-cover" />
              ) : <div className="grid aspect-[1200/896] place-items-center rounded-lg border border-dashed border-line text-[12px] text-ink-3">Not captured</div>}
            </div>
            <ul className="mt-5 space-y-2">
              {room.findings.length === 0 && <li className="text-[13px] text-ink-3">{t("No reviewed changes since move-in.")}</li>}
              {room.findings.map((f: any, i: number) => (
                <li key={f.id} className="flex flex-wrap items-start gap-3 border-b border-line/70 pb-2 text-[13px]">
                  <span className="font-mono text-ink-3">{ri + 1}.{i + 1}</span>
                  <span className="min-w-0 flex-1"><span className="font-medium">{t(CATEGORY_META[f.category as keyof typeof CATEGORY_META]?.label ?? "")}.</span> {t(f.description)}{f.reviewer_note && <span className="block text-[11.5px] italic text-ink-3">{t("Reviewer")}: {t(f.reviewer_note)}</span>}</span>
                  <span className="flex gap-1"><StanceDot s={f.stances.tenant} /><StanceDot s={f.stances.owner} /></span>
                </li>
              ))}
            </ul>
            {room.pre_existing.length > 0 && <p className="mt-3 rounded-lg bg-surface-2/60 p-3 text-[12px] text-ink-2"><span className="font-medium">{t("Already there at move-in")}:</span> {room.pre_existing.map((d: string) => t(d)).join(" · ")}</p>}
          </section>
        ))}
        <section className="p-8 md:p-12">
          <h2 className="h-display mb-3 text-[28px]">{t("Integrity appendix")}</h2>
          <table className="w-full font-mono text-[10.5px]">
            <tbody>{data.files.map((f: any, i: number) => <tr key={i} className="border-b border-line/60"><td className="py-1.5 pr-3">{t(f.room)}</td><td className="py-1.5 pr-3 text-ink-3">{f.inspection ? t(INSPECTION_LABEL[f.inspection]) : ""}</td><td className="break-all py-1.5">{f.sha256 ?? "—"}</td></tr>)}</tbody>
          </table>
          <div className="mt-6 break-all rounded-lg bg-surface-2/70 px-3 py-2 font-mono text-[11px]"><span className="text-ink-3">content sha256 </span>{data.content_hash}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["tenant", "owner"] as const).map((r) => {
              const s = data.signatures[r];
              const valid = s && s.hash === data.content_hash;
              return (
                <div key={r} className={cn("rounded-xl border p-3", s ? (valid ? "border-ok/40" : "border-warn/50") : "border-dashed border-line")}>
                  <div className="eyebrow mb-1">{t(r === "tenant" ? "Tenant" : "Owner")}</div>
                  {s ? <><div className="font-display text-[22px] italic">{s.name}</div><div className={cn("mt-1 flex items-center gap-1 text-[11.5px]", valid ? "text-ok" : "text-warn")}>{valid ? <BadgeCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}{valid ? `signed · ${shortHash(s.hash, 8)}` : "signed an earlier version"}</div></> : <div className="text-[12.5px] text-ink-3">{t("Not signed yet")}</div>}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-[12px] text-ink-3">Check any photo against this record on the <Link href="/verify" className="underline">Verify</Link> page. This report describes visible condition only; it makes no finding about cause, responsibility or cost.</p>
        </section>
      </article>
    </main>
  );
}

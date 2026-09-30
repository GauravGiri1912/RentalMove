"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSignedUrls } from "@/lib/use-signed";
import { AlertTriangle, Ban, EyeOff, Fingerprint, Link2, Loader2, Printer, ShieldCheck, Clock, PenLine, BadgeCheck, CircleAlert, Camera, Stamp } from "lucide-react";
import { StanceDot } from "@/components/parties";
import { api, useStudio } from "@/components/providers";
import { CATEGORY_META, Empty, Photo } from "@/components/ui";
import { CopyButton } from "@/components/hood";
import { assetFor, getAssets, getInspection, getProperty, getReport, getRooms, getShareLinks, reportPair } from "@/lib/view";
import { presetUrl } from "@/lib/cld";
import { cn, fmtDate, INSPECTION_LABEL, pct, shortHash } from "@/lib/utils";
import type { Asset } from "@/lib/view-types";
import { photoTimeOf, roomCoverage, sizeOf, trendLabel, trendOf, wearOf, workOrderOf } from "@/lib/insights";
import { fmtArea, fmtLength } from "@/lib/measure";
import { WEAR_DISCLAIMER } from "@/lib/wear";
import { fmtDateL, makeT, needsMachine, REPORT_LANGS, type ReportLang } from "@/lib/report-i18n";

/** Translator for the report document (English = identity). */
const TCtx = createContext<(s: string) => string>((s) => s);
const useT = () => useContext(TCtx);
import { getObservations, getWorkOrders } from "@/lib/view";

const EXPIRY = [{ d: 1, l: "24 hours" }, { d: 7, l: "7 days" }, { d: 14, l: "14 days" }, { d: 30, l: "30 days" }];

export default function ReportPage() {
  const { observations, toast, user, stances, signatures, sign, unsign, refresh } = useStudio();
  const prop = getProperty();
  const rooms = getRooms();
  const { baseline, current } = reportPair();
  const report = getReport();
  const [privacy, setPrivacy] = useState(true);
  const [showPre, setShowPre] = useState(true);
  const [expiry, setExpiry] = useState(14);
  const [recipient, setRecipient] = useState("");
  const [creating, setCreating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [fresh, setFresh] = useState<{ url: string; token: string } | null>(null);
  const [lang, setLangState] = useState<ReportLang>("en");
  const [machine, setMachine] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem("rm:report-lang"); if (v === "hi") setLangState("hi"); } catch {} }, []);
  const setLang = (l: ReportLang) => { setLangState(l); try { localStorage.setItem("rm:report-lang", l); } catch {} };
  const t = useMemo(() => makeT(lang, machine), [lang, machine]);

  // Evidence images: reviewed findings drawn BY CLOUDINARY into the pixels (signed recipe).
  const evidenceItems = useMemo(() => {
    if (!current) return [];
    return rooms.flatMap((room) => {
      const after = assetFor(room.id, current.id);
      if (!after || after.analysis_status !== "done") return [];
      const inc = observations.filter((o) => o.asset_id === after.id && !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited"));
      if (!inc.length) return [];
      return [{ room: room.id, asset_id: after.id, recipe: { kind: "evidence" as const, pixelate: privacy, boxes: inc.slice(0, 10).map((o, i) => ({ bbox: o.bbox, label: `${i + 1} ${o.category}` })) } }];
    }).slice(0, 8);
  }, [rooms, current, observations, privacy]);
  const { urls: evidenceUrls } = useSignedUrls(evidenceItems.length ? evidenceItems.map(({ asset_id, recipe }) => ({ asset_id, recipe })) : null);
  const evidenceFor = (roomId: string) => {
    const i = evidenceItems.findIndex((e) => e.room === roomId);
    return i >= 0 ? evidenceUrls?.[i] : undefined;
  };

  // Text from the records that the Hindi report needs machine-translated.
  const recordTexts = useMemo(() => {
    if (lang === "en" || !baseline || !current) return [];
    const out: string[] = [];
    for (const room of rooms) {
      out.push(room.name);
      const after = assetFor(room.id, current.id);
      if (!after) continue;
      for (const o of observations.filter((x) => x.asset_id === after.id && x.review_status !== "rejected" && x.review_status !== "pending")) {
        out.push(o.description, o.sub_area, o.reviewer_note ?? "", wearOf(o).text);
        const tr = trendOf(o);
        if (tr) out.push(trendLabel(tr));
      }
      for (const o of observations.filter((x) => x.asset_id === after.id && x.pre_existing && x.review_status !== "rejected")) out.push(o.description);
      for (const g of roomCoverage(room.id, current.id)?.items.filter((i) => !i.covered) ?? []) out.push(g.label);
    }
    for (const a of getAssets()) { const c = photoTimeOf(a); if (c) out.push(c.label); }
    for (const w of getWorkOrders()) { const o = getObservations().find((x) => x.id === w.observation_id); if (o) out.push(o.description); }
    return out;
  }, [lang, rooms, observations, baseline?.id, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const missing = needsMachine(lang, recordTexts, machine);
    if (!missing.length) return;
    let cancelled = false;
    setTranslating(true);
    api<{ translations: Record<string, string>; failed: number }>("/api/translate", { method: "POST", json: { property_id: prop.id, lang, texts: missing.slice(0, 150) } })
      .then((r) => { if (!cancelled) setMachine((m) => ({ ...m, ...r.translations })); })
      .catch((e) => toast({ title: "Translation unavailable", detail: e?.message, tone: "danger" }))
      .finally(() => { if (!cancelled) setTranslating(false); });
    return () => { cancelled = true; };
  }, [lang, recordTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!baseline || !current) {
    return <Empty icon={<Camera className="size-5" />} title="The report needs two inspections" body="It compares the move-in baseline with the latest inspection. Capture both, and the report builds itself." action={<Link href="/capture" className="btn-primary">Capture</Link>} />;
  }

  const currentIds = new Set(getAssets().filter((a) => a.inspection_id === current.id).map((a) => a.id));
  const curObs = observations.filter((o) => currentIds.has(o.asset_id));
  const counts = {
    included: curObs.filter((o) => !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited")).length,
    rejected: curObs.filter((o) => o.review_status === "rejected").length,
    pending: curObs.filter((o) => o.review_status === "pending").length,
  };
  const disputed = curObs.filter((o) => stances[o.id]?.tenant === "dispute" || stances[o.id]?.owner === "dispute").length;
  const reportId = `RM-${prop.id.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(-6)}-${current.captured_at.slice(0, 10).replace(/-/g, "")}`;
  const img = (a: Asset) => presetUrl(a.cloudinary_public_id, privacy && a.people_detected ? "privacy" : "evidence");
  const links = getShareLinks();

  const createLink = async () => {
    setCreating(true);
    try {
      const r = await api<{ token: string; share_url: string }>("/api/share", { method: "POST", json: { property_id: prop.id, expires_in_days: expiry, recipient: recipient.trim() || undefined } });
      const url = `${window.location.origin}/r/${r.token}`;
      setFresh({ url, token: r.token });
      setRecipient("");
      await refresh();
      toast({ title: "Share link created", detail: `expires in ${EXPIRY.find((e) => e.d === expiry)!.l}`, tone: "signal" });
    } catch (e: any) {
      toast({ title: "Could not create link", detail: e?.message, tone: "danger" });
    } finally {
      setCreating(false);
    }
  };
  const revoke = async (token: string) => {
    try {
      await api(`/api/share/${token}`, { method: "DELETE" });
      if (fresh?.token === token) setFresh(null);
      await refresh();
      toast({ title: "Link revoked", detail: "Opening it now shows “invalid or revoked”." });
    } catch (e: any) {
      toast({ title: "Could not revoke", detail: e?.message, tone: "danger" });
    }
  };
  const doSign = async () => {
    setSigning(true);
    try { await sign(report.content_hash); toast({ title: "Report signed", detail: `sha256 ${shortHash(report.content_hash, 12)}`, tone: "ok" }); } catch {} finally { setSigning(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_320px]">
      {/* Document */}
      <TCtx.Provider value={t}>
      <article lang={lang} className="card mx-auto w-full max-w-[860px] overflow-hidden print:border-0 print:shadow-none" data-testid="report-doc">
        <header className="print-page border-b border-line p-8 md:p-12" data-tour="rep-header">
          <div className="flex items-start justify-between gap-6">
            <div className="eyebrow">{t("Condition evidence report")}</div>
            <div className="text-right font-mono text-[11px] text-ink-3">{reportId}<br />{t("generated")} {fmtDateL(new Date().toISOString(), lang)}</div>
          </div>
          {lang !== "en" && (
            <p className="mt-4 rounded-lg bg-info/[.07] px-3 py-2 text-[12px] text-ink-2" data-testid="mt-notice">
              {t("Machine translation. The English report is authoritative, and signatures cover its English content.")}
              {translating && <span className="ml-2 inline-flex items-center gap-1 text-ink-3"><Loader2 className="size-3 animate-spin" /> {t("Translating…")}</span>}
            </p>
          )}
          <h1 className="h-display mt-8 text-[52px] md:text-[64px]">{prop.address_label}</h1>
          <div className="mt-1 text-[15px] text-ink-2">{prop.unit_label}</div>
          <div className="mt-10 grid grid-cols-1 gap-6 border-t border-line pt-6 sm:grid-cols-3">
            <div><div className="eyebrow mb-1">{t("Baseline")}</div><div className="text-[14px] font-medium">{t(INSPECTION_LABEL[baseline.type])}</div><div className="text-[12.5px] text-ink-3">{fmtDateL(baseline.captured_at, lang)}</div></div>
            <div><div className="eyebrow mb-1">{t("Compared with")}</div><div className="text-[14px] font-medium">{t(INSPECTION_LABEL[current.type])}</div><div className="text-[12.5px] text-ink-3">{fmtDateL(current.captured_at, lang)}</div></div>
            <div><div className="eyebrow mb-1">{t("Human review")}</div><div className="text-[14px] font-medium">{counts.included} {t("included")}</div><div className="text-[12.5px] text-ink-3">{counts.rejected} {t("rejected")} · {counts.pending} {t("pending")}{disputed ? ` · ${disputed} ${t("disputed")}` : ""}</div></div>
          </div>
          {counts.pending > 0 && (
            <div className="no-print mt-6 flex items-start gap-3 rounded-xl bg-warn/[.08] p-3.5 text-[13px] text-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">{lang === "en" ? <>{counts.pending} finding{counts.pending === 1 ? " is" : "s are"} still pending and not included. <Link href="/review" className="font-medium underline">Finish review</Link> to include them.</> : <>{counts.pending} {t("findings")} {t("still pending and not included.")} <Link href="/review" className="font-medium underline">{t("Finish review")}</Link> {t("to include them.")}</>}</div>
            </div>
          )}
        </header>

        {rooms.map((room, ri) => {
          const before = assetFor(room.id, baseline.id);
          const after = assetFor(room.id, current.id);
          if (!before && !after) return null;
          const obs = after ? observations.filter((o) => o.asset_id === after.id) : [];
          const included = obs.filter((o) => !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited"));
          const pre = obs.filter((o) => o.pre_existing && o.review_status !== "rejected");
          const analysing = after && after.analysis_status !== "done";
          return (
            <section key={room.id} className="print-page border-b border-line p-8 md:p-12">
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="h-display text-[34px]"><span className="mr-3 font-mono text-[13px] text-ink-3">{String(ri + 1).padStart(2, "0")}</span>{t(room.name)}</h2>
                <span className="text-[12px] text-ink-3">{included.length} {t(included.length === 1 ? "change recorded" : "changes recorded")}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <figure>
                  {before ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(before)} alt={`${room.name} at move-in`} className="aspect-[1200/896] w-full rounded-lg bg-surface-2 object-cover" />
                  ) : <div className="grid aspect-[1200/896] place-items-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-3">{t("Not captured at move-in")}</div>}
                  <figcaption className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-3">
                    <span>{t(INSPECTION_LABEL[baseline.type])} · {fmtDateL(baseline.captured_at, lang)}</span>
                    {privacy && before?.people_detected && <span className="inline-flex items-center gap-1 text-ink-2"><EyeOff className="size-3" /> {t("Faces pixelated")}</span>}
                  </figcaption>
                </figure>
                <figure>
                  {!after ? (
                    <div className="grid aspect-[1200/896] place-items-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-3">{t("Not captured at this visit")}</div>
                  ) : analysing ? (
                    <div className="grid aspect-[1200/896] place-items-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-3"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {t("Analysis pending — excluded")}</span></div>
                  ) : evidenceFor(room.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={evidenceFor(room.id)} alt={`${room.name} at ${INSPECTION_LABEL[current.type]}, findings marked`} className="aspect-[1200/896] w-full rounded-lg bg-surface-2 object-cover" />
                  ) : (
                    <Photo src={img(after)} alt={`${room.name} at ${INSPECTION_LABEL[current.type]}`} observations={included} rounded className="aspect-[1200/896]" showLabels={false} />
                  )}
                  <figcaption className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-3">
                    <span>{t(INSPECTION_LABEL[current.type])} · {fmtDateL(current.captured_at, lang)}{evidenceFor(room.id) ? ` · ${t("boxes drawn by Cloudinary")}` : ""}</span>
                    {privacy && after?.people_detected && <span className="inline-flex items-center gap-1 text-ink-2"><EyeOff className="size-3" /> {t("Faces pixelated")}</span>}
                  </figcaption>
                </figure>
              </div>

              {after && !analysing && (
                <table className="mt-6 w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-ink-3">
                      <th className="py-2 pr-3 font-normal">#</th><th className="py-2 pr-3 font-normal">{t("Observation")}</th><th className="hidden py-2 pr-3 font-normal sm:table-cell">{t("Location")}</th><th className="hidden py-2 pr-3 font-normal md:table-cell">{t("Tenant / owner")}</th><th className="py-2 text-right font-normal">{t("Review")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {included.length === 0 && <tr><td colSpan={5} className="py-3 text-ink-3">{t("No reviewed changes since move-in.")}</td></tr>}
                    {included.map((o, i) => (
                      <tr key={o.id} className="border-b border-line/70 align-top">
                        <td className="py-2.5 pr-3 font-mono text-ink-3">{ri + 1}.{i + 1}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{t(CATEGORY_META[o.category].label)}.</span> {t(o.description)}
                          {o.reviewer_note && <div className="mt-1 text-[11.5px] italic text-ink-3">{t("Reviewer")}: {t(o.reviewer_note)}</div>}
                          <FindingMeta o={o} />
                        </td>
                        <td className="hidden py-2.5 pr-3 text-ink-2 sm:table-cell">{t(o.sub_area)}</td>
                        <td className="hidden py-2.5 pr-3 md:table-cell"><div className="flex flex-col items-start gap-1"><StanceDot s={stances[o.id]?.tenant} /><StanceDot s={stances[o.id]?.owner} /></div></td>
                        <td className="py-2.5 text-right"><span className={cn("font-mono text-[11px] capitalize", o.review_status === "edited" ? "text-info" : "text-ok")}>{t(o.review_status)}</span><div className="font-mono text-[10.5px] text-ink-3">AI {pct(o.confidence)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {after && !analysing && (() => {
                const cov = roomCoverage(room.id, current.id);
                const gaps = cov?.items.filter((x) => !x.covered) ?? [];
                return gaps.length ? <p className="mt-3 text-[11.5px] text-ink-3" data-testid="report-gaps">{t("Not shown in this visit's photos")}: {gaps.map((g) => t(g.label)).join(", ")}. {t("Condition there is not recorded by this report.")}</p> : null;
              })()}
              {showPre && pre.length > 0 && (
                <div className="mt-4 rounded-lg bg-surface-2/60 p-3 text-[12px] text-ink-2">
                  <span className="font-medium">{t("Already there at move-in")}:</span> {pre.map((o) => t(o.description)).join(" · ")}
                </div>
              )}
            </section>
          );
        })}

        <RepairsAppendix />

        <section className="print-page p-8 md:p-12" data-tour="rep-integrity">
          <h2 className="h-display mb-1 text-[30px]">{t("Integrity appendix")}</h2>
          <p className="mb-5 text-[12.5px] text-ink-3">{t("SHA-256 of each original file, and the capture time stored inside it (EXIF, read by Cloudinary) compared with the visit.")} {t("Drop any photo on")} <Link href="/verify" className="underline">{t("Verify")}</Link> {t("to confirm it is the one on record.")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[10.5px]">
              <thead><tr className="border-b border-line text-ink-3"><th className="py-2 pr-3 font-normal">{t("file")}</th><th className="py-2 pr-3 font-normal">{t("inspection")}</th><th className="py-2 pr-3 font-normal">{t("time in file")}</th><th className="py-2 font-normal">sha256</th></tr></thead>
              <tbody>
                {getAssets().filter((a) => a.inspection_id === baseline.id || a.inspection_id === current.id).map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="whitespace-nowrap py-1.5 pr-3">{t(rooms.find((r) => r.id === a.room_id)?.name ?? "")}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink-3">{t(INSPECTION_LABEL[getInspection(a.inspection_id).type])}</td>
                    <td className={cn("whitespace-nowrap py-1.5 pr-3", photoTimeOf(a)?.level === "warn" ? "text-warn" : "text-ink-3")} title={photoTimeOf(a)?.detail}>{photoTimeOf(a) ? t(photoTimeOf(a)!.label) : "—"}</td>
                    <td className="break-all py-1.5">{a.sha256 || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10" data-tour="rep-signoff">
            <h2 className="h-display mb-1 text-[30px]">{t("Sign-off")}</h2>
            <p className="mb-4 text-[12.5px] text-ink-3">{t("Each party signs the SHA-256 of this report's contents, computed on the server. If anything changes afterwards — a finding, a position, a photo — the signature no longer matches.")}</p>
            <div className="mb-3 break-all rounded-lg bg-surface-2/70 px-3 py-2 font-mono text-[11px]"><span className="text-ink-3">content sha256 </span>{report.content_hash}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["tenant", "owner"] as const).map((r) => {
                const sig = signatures[r];
                const valid = sig && sig.hash === report.content_hash;
                return (
                  <div key={r} className={cn("rounded-xl border p-4", sig ? (valid ? "border-ok/40" : "border-warn/50") : "border-dashed border-line")}>
                    <div className="eyebrow mb-2">{t(r === "tenant" ? "Tenant" : "Owner")}</div>
                    {sig ? (
                      <>
                        <div className="font-display text-[26px] italic leading-none">{sig.name}</div>
                        <div className="mt-2 font-mono text-[10.5px] text-ink-3">{new Date(sig.at).toISOString().replace("T", " ").slice(0, 16)}Z · {shortHash(sig.hash, 10)}</div>
                        <div className={cn("mt-2 flex items-center gap-1.5 text-[12px]", valid ? "text-ok" : "text-warn")}>
                          {valid ? <BadgeCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                          {t(valid ? "Matches current report" : "Report changed after signing — re-sign needed")}
                        </div>
                      </>
                    ) : (
                      <div className="text-[13px] text-ink-3">{t("Not signed yet")}</div>
                    )}
                    {r === user.role && (
                      <div className="no-print mt-3 flex gap-2">
                        <button disabled={signing || (valid ?? false)} onClick={doSign} className="btn-primary h-8 text-[12px]">{signing ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />} {t(sig ? "Re-sign" : "Sign as you")}</button>
                        {sig && <button onClick={() => void unsign()} className="btn-ghost h-8 text-[12px]">{t("Withdraw")}</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-8 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-3">
            {t("Observations are produced by an assistive vision model, located with pixel comparison, and confirmed by a person. This report describes visible condition only; it makes no finding about cause, responsibility or cost.")} {t("Requested by")} {user.name}.
          </p>
        </section>
      </article>
      </TCtx.Provider>

      {/* Controls */}
      <aside className="no-print space-y-4 xl:sticky xl:top-20 xl:h-fit">
        <div className="card p-4">
          <div className="mb-3 text-[13px] font-semibold">Report options</div>
          <div className="mb-2 flex items-center justify-between gap-3 py-1">
            <span><span className="block text-[13px] font-medium">Language</span><span className="block text-[11.5px] text-ink-3">Records machine-translated once, then cached</span></span>
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Report language" data-tour="rep-lang">
              {REPORT_LANGS.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)} aria-pressed={lang === l.id} data-testid={`lang-${l.id}`} className={cn("h-7 rounded-md px-2.5 text-[12px]", lang === l.id ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2")}>{l.label}</button>
              ))}
            </div>
          </div>
          <Toggle checked={privacy} onChange={setPrivacy} label="Pixelate faces" hint="Cloudinary e_pixelate_faces on every photo with a face" />
          <Toggle checked={showPre} onChange={setShowPre} label="List pre-existing items" hint="What was already there at move-in" />
          <button onClick={() => window.print()} className="btn-outline mt-3 w-full"><Printer className="size-4" /> Print or save PDF</button>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><Link2 className="size-4" /> Share</div>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={40} placeholder="Recipient (optional) — e.g. Deposit scheme" className="input mb-2" />
          <div className="flex gap-2">
            <select value={expiry} onChange={(e) => setExpiry(+e.target.value)} className="input flex-1" aria-label="Link expiry">
              {EXPIRY.map((e) => <option key={e.d} value={e.d}>Expires in {e.l}</option>)}
            </select>
            <button onClick={createLink} disabled={creating} className="btn-primary">{creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}</button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3"><Stamp className="mt-0.5 size-3 shrink-0" /> A named recipient is watermarked into every shared image by Cloudinary, so a leaked image traces back to its link.</p>
          {fresh && (
            <div className="mt-3 rounded-xl border border-signal/30 bg-signal/[.05] p-2.5 animate-fade-up">
              <div className="mb-1 text-[11.5px] font-medium">New link — copy it now, it is shown once</div>
              <div className="flex items-center gap-1"><code className="flex-1 truncate font-mono text-[11px]">{fresh.url}</code><CopyButton text={fresh.url} label="" /><a href={fresh.url} target="_blank" rel="noreferrer" className="btn-ghost h-7 px-2 text-[11px]">Open</a></div>
            </div>
          )}
          <ul className="mt-3 space-y-2">
            {links.map((l) => {
              const expired = new Date(l.expires_at).getTime() < Date.now();
              const state = l.revoked_at ? "revoked" : expired ? "expired" : "active";
              return (
                <li key={l.id ?? l.token_hint} className={cn("rounded-xl border border-line p-2.5", state !== "active" && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", state === "active" ? "bg-ok" : "bg-ink-3")} />
                    <span className="flex-1 truncate font-mono text-[11.5px]">/r/{l.token_hint}…{l.recipient ? ` · ${l.recipient}` : ""}</span>
                    {state === "active" && l.token && <CopyButton text={`${typeof window === "undefined" ? "" : window.location.origin}/r/${l.token}`} label="" />}
                    {state === "active" && l.token && <button onClick={() => revoke(l.token!)} className="btn-ghost h-7 px-2 text-[11.5px] text-danger"><Ban className="size-3.5" /> Revoke</button>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 pl-3.5 text-[11px] text-ink-3">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{state === "active" ? `until ${fmtDate(l.expires_at, { day: "numeric", month: "short" })}` : state}</span>
                    <span className="inline-flex items-center gap-1"><EyeOff className="size-3" /> faces pixelated</span>
                  </div>
                </li>
              );
            })}
            {links.length === 0 && <li className="text-[12px] text-ink-3">No links yet.</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-dashed border-line p-4 text-[12px] leading-relaxed text-ink-3">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2"><ShieldCheck className="size-3.5" /> What a recipient can verify</div>
          Each photo&apos;s <Fingerprint className="inline size-3" /> SHA-256 is printed in the appendix, and the Verify page checks any file against it. Links are unguessable (256-bit), time-limited and revocable.
        </div>
      </aside>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-ink" : "bg-line")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-bg shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11.5px] text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

/** Size, trend, everyday-wear context and repair status under a report row. */
function FindingMeta({ o }: { o: import("@/lib/view-types").Observation }) {
  const size = sizeOf(o);
  const t = trendOf(o);
  const wear = wearOf(o);
  const wo = workOrderOf(o);
  const tr = useT();
  const bits = [
    size && `${fmtLength(size.long_cm)} ${tr("long")}${size.area_cm2 != null ? `, ${tr("affected")} ${fmtArea(size.area_cm2)}` : ""}`,
    t && t.kind !== "new" && tr(trendLabel(t)),
    wo && (wo.status === "done" ? `${tr("Repaired")}${wo.photo?.check?.verdict === "reduced" ? ` ${tr("(photo-checked)")}` : ""}` : tr("Repair requested")),
  ].filter(Boolean);
  return (
    <div className="mt-1 space-y-0.5 text-[11.5px] text-ink-3">
      {bits.length > 0 && <div>{bits.join(" · ")}</div>}
      {wear.level !== "unknown" && <div><span className="text-ink-2">{tr("Everyday-use context")}:</span> {tr(wear.text)}</div>}
    </div>
  );
}

function RepairsAppendix() {
  const orders = getWorkOrders();
  if (!orders.length) return null;
  const obs = new Map(getObservations().map((o) => [o.id, o]));
  const t = useT();
  return (
    <section className="print-page border-b border-line p-8 md:p-12" data-testid="report-repairs">
      <h2 className="h-display mb-1 text-[30px]">{t("Repairs")}</h2>
      <p className="mb-5 text-[12.5px] text-ink-3">{t("Work orders raised from findings. A repair photo is checked against the finding photo: same view, and whether the change is still detected at that spot.")}</p>
      <table className="w-full text-left text-[12.5px]">
        <thead><tr className="border-b border-line text-ink-3"><th className="py-2 pr-3 font-normal">{t("Finding")}</th><th className="py-2 pr-3 font-normal">{t("Status")}</th><th className="py-2 font-normal">{t("Repair photo")}</th></tr></thead>
        <tbody>
          {orders.map((w) => {
            const o = obs.get(w.observation_id);
            const v = w.photo?.check?.verdict;
            return (
              <tr key={w.id} className="border-b border-line/70 align-top">
                <td className="py-2.5 pr-3">{o ? <><span className="font-medium">{t(CATEGORY_META[o.category].label)}.</span> {t(o.description)}</> : w.observation_id}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{t(w.status === "done" ? "Repaired" : w.status === "in_progress" ? "In progress" : "Requested")}<div className="text-[11px] text-ink-3">{fmtDate(w.updated_at)}</div></td>
                <td className="py-2.5 text-[12px]">
                  {!w.photo ? <span className="text-ink-3">{t("None yet")}</span> : <>
                    {t(v === "reduced" ? "Change no longer detected at the spot" : v === "unchanged" ? "Change still detected at the spot" : "Not verifiable from the photo")}
                    {w.photo.sha256 && <div className="font-mono text-[10.5px] text-ink-3">sha256 {shortHash(w.photo.sha256, 12)}</div>}
                  </>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-ink-3">{t(WEAR_DISCLAIMER)}</p>
    </section>
  );
}

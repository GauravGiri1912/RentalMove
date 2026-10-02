"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { api, useStudio } from "./providers";
import { assetFor, getInspections, getProperty, getRooms, getSubmitted } from "@/lib/view";
import { isDemoProperty } from "@/lib/demo";
import { cn } from "@/lib/utils";

interface Step { key: string; title: string; why: string; done: boolean; href?: string; action?: string }

/**
 * "What to do next" for someone who has just arrived. Every step says why it matters; the first unfinished step is the
 * one to do now. Disappears once everything is done (and never shows on the demo workspace).
 */
export function GettingStarted() {
  const { user } = useStudio();
  const prop = getProperty();
  const inspections = getInspections();
  const rooms = getRooms();
  const isOwner = user.role === "owner";
  const [joined, setJoined] = useState<boolean | null>(isOwner ? null : true);

  useEffect(() => {
    if (!isOwner) return;
    api<{ invites: { status: string }[] }>(`/api/properties/${prop.id}/invites`).then((r) => setJoined(r.invites.some((i) => i.status === "accepted"))).catch(() => setJoined(false));
  }, [isOwner, prop.id]);

  if (isDemoProperty(prop.id) || joined === null) return null;

  const moveIn = inspections.find((i) => i.type === "move_in") ?? inspections[0];
  const photographed = !!moveIn && rooms.length > 0 && rooms.every((r) => !!assetFor(r.id, moveIn.id));
  const submitted = !!moveIn && !!getSubmitted(moveIn.id);
  const steps: Step[] = isOwner
    ? [
        { key: "property", title: "Add your property", why: "Done: you manage this home on RentalMove.", done: true },
        { key: "tenant", title: "Invite your tenant", why: "They join with a link only you can send, so nobody can claim to be the tenant.", done: joined, href: "#tenant-invites", action: "Create an invitation" },
        { key: "photos", title: "Photograph every room at move-in", why: "These photos are the baseline: every later visit is compared with them.", done: photographed, href: "/capture", action: moveIn ? "Continue capturing" : "Start the move-in visit" },
        { key: "submit", title: "Submit the move-in visit", why: "Submitting seals what was recorded, so nobody can quietly change it later.", done: submitted, href: "/capture", action: "Review and submit" },
      ]
    : [
        { key: "photos", title: "Photograph every room", why: "Each room has a short checklist of what to show, so the record is complete.", done: photographed, href: "/capture", action: moveIn ? "Continue capturing" : "Start capturing" },
        { key: "submit", title: "Submit your visit", why: "Submitting seals your record. The owner then reviews it; you can agree or dispute each finding.", done: submitted, href: "/capture", action: "Review and submit" },
      ];
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  return (
    <section className="card p-5" data-testid="getting-started">
      <div className="eyebrow mb-1">Getting started</div>
      <h2 className="text-[17px] font-semibold">{isOwner ? "Four steps to a record you can rely on" : "Two steps to your record"}</h2>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s) => (
          <li key={s.key} className={cn("flex items-start gap-2.5 text-[13px]", s.key === next.key && "rounded-xl border border-ink/20 bg-surface p-3")} data-testid={`gs-${s.key}`} data-done={s.done ? "1" : "0"}>
            {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 size-4 shrink-0 text-line" />}
            <div className="min-w-0 flex-1">
              <div className={cn("font-medium", s.done && "text-ink-3 line-through")}>{s.title}</div>
              {(s.key === next.key || !s.done) && <div className="text-[12.5px] text-ink-3">{s.why}</div>}
              {s.key === next.key && s.href && (
                s.href.startsWith("#")
                  ? <a href={s.href} className="btn-primary mt-2 h-9 text-[13px]" data-testid="gs-next">{s.action} <ArrowRight className="size-4" /></a>
                  : <Link href={s.href} className="btn-primary mt-2 h-9 text-[13px]" data-testid="gs-next">{s.action} <ArrowRight className="size-4" /></Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-ink-3" data-testid="gs-after">After move-in: at each later visit the same rooms are photographed again and compared with move-in. RentalMove points out differences; the owner decides what counts and the tenant can agree or dispute.</p>
    </section>
  );
}

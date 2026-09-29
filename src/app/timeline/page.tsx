import React from "react";
import Link from "next/link";
import {
  Clock,
  Building,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Camera,
  CheckSquare,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { APP_COPY } from "@/lib/copy";

export default async function TimelinePage() {
  const db = getDatabase();
  const media = getMediaProvider();

  const timeline = await db.getTimeline("prop-381");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="w-7 h-7 text-primary" />
            Property Inspection Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological condition history for {timeline.property.address_label} (Unit{" "}
            {timeline.property.unit_label})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/capture"
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Add Inspection Snapshot
          </Link>
          <Link
            href="/compare"
            className="px-4 py-2 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80 border border-border flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Compare Inspections
          </Link>
        </div>
      </div>

      {/* Vertical Timeline Tree */}
      <div className="relative pl-6 sm:pl-8 border-l-2 border-primary/20 space-y-12">
        {timeline.inspections.map((insp, index) => {
          const isLatest = index === 0;
          const acceptedObsCount = insp.assets
            .flatMap((a) => a.observations)
            .filter((o) => o.review_status === "accepted").length;

          return (
            <div key={insp.id} className="relative group">
              {/* Timeline Node Dot */}
              <div
                className={`absolute -left-[31px] sm:-left-[39px] top-1.5 w-6 h-6 rounded-full border-4 border-background flex items-center justify-center ${
                  insp.type === "move_in"
                    ? "bg-emerald-500"
                    : insp.type === "move_out"
                    ? "bg-rose-500"
                    : "bg-primary"
                } shadow`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Inspection Card Container */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5 hover:border-primary/40 transition-colors">
                {/* Inspection Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xl text-foreground capitalize">
                        {insp.type.replace("_", " ")} Inspection
                      </span>
                      {insp.type === "move_in" && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Baseline Record
                        </span>
                      )}
                      {insp.type === "move_out" && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          Move-Out Final
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Captured on{" "}
                        {new Date(insp.captured_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      <span>&bull;</span>
                      <span className="font-mono text-[11px]">{insp.id}</span>
                    </div>
                  </div>

                  {/* Badges on right */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-secondary text-foreground font-semibold">
                      {insp.assets.length} Photo{insp.assets.length !== 1 ? "s" : ""}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-accent/15 text-accent font-semibold">
                      {acceptedObsCount} Confirmed Issue{acceptedObsCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Grid of Room Photos for this Inspection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {insp.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="border border-border rounded-lg overflow-hidden bg-background flex flex-col group/card hover:border-primary/50 transition-all shadow-xs"
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                        <img
                          src={media.thumb(asset.secure_url)}
                          alt={asset.room.name}
                          className="w-full h-full object-cover group-hover/card:scale-103 transition-transform duration-300"
                        />

                        {/* Room label overlay */}
                        <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold px-2 py-0.5 rounded capitalize">
                          {asset.room.name}
                        </div>

                        {/* SHA-256 Verified Badge */}
                        <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Preserved
                        </div>
                      </div>

                      {/* Content & Observations */}
                      <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-muted-foreground text-[10px] mb-1">
                            <span className="font-mono truncate max-w-[150px]">
                              {asset.cloudinary_public_id.split("/").pop()}
                            </span>
                            <span>SHA: {asset.sha256?.substring(0, 6)}...</span>
                          </div>

                          {/* Observations for this asset */}
                          {asset.observations.length > 0 ? (
                            <div className="space-y-1.5 mt-2">
                              {asset.observations.map((obs) => (
                                <div
                                  key={obs.id}
                                  className="bg-secondary/60 rounded p-2 text-[11px] border border-border"
                                >
                                  <div className="flex items-center justify-between font-semibold capitalize text-foreground">
                                    <span>
                                      {obs.category} ({obs.sub_area})
                                    </span>
                                    <span className="text-[10px] text-accent font-bold">
                                      {obs.review_status}
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground text-[10px] leading-relaxed mt-0.5">
                                    {obs.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground italic text-[11px] mt-2">
                              No irregularities noted.
                            </p>
                          )}
                        </div>

                        {/* Footer Links */}
                        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                          <Link
                            href={`/review?assetId=${asset.id}`}
                            className="text-primary hover:underline font-semibold"
                          >
                            Review &rarr;
                          </Link>
                          <Link
                            href={`/compare?room=${asset.room.category}`}
                            className="text-muted-foreground hover:text-foreground font-medium"
                          >
                            Compare &rarr;
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

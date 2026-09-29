import React from "react";
import Link from "next/link";
import {
  Camera,
  Layers,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Database,
  Cloud,
  Cpu,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { getVisionProvider } from "@/lib/vision";
import { APP_COPY } from "@/lib/copy";

export default async function HomePage() {
  const db = getDatabase();
  const media = getMediaProvider();
  const vision = getVisionProvider();

  const timeline = await db.getTimeline("prop-381");
  const isMockMedia = media.isMock();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Pixels to Products &bull; Cloudinary AI Hackathon 2026 (Track 1)</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
          {APP_COPY.tagline}
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed">
          RentalMove transforms rental condition photos into a structured, searchable, and
          verifiable visual timeline powered by Cloudinary AI media pipelines.
        </p>

        {/* Call to action & badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/#timeline"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-hover shadow-md shadow-primary/25 transition-all hover:gap-3"
          >
            Explore Property #381 Timeline
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-secondary/80 border border-border transition-all"
          >
            <Search className="w-4 h-4" />
            Search Media
          </Link>
        </div>
      </section>

      {/* Phase 0 Feasibility Spike Status Bar */}
      <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">
              Phase 0 Feasibility Spike: Pipeline Verification
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                isMockMedia
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              {isMockMedia ? "Media: Mock Provider (Offline Ready)" : "Media: Cloudinary Live SDK"}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Vision: {process.env.VISION_PROVIDER || "mock"}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border font-medium flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              DB: Memory Store (Seeded #381)
            </span>
          </div>
        </div>

        {/* Verification Checkpoints */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              1. Signed Upload
            </div>
            <p className="text-muted-foreground">
              POST /api/uploads/sign signs folder, metadata, tags, and sha256 server-side.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              2. Asset & Metadata
            </div>
            <p className="text-muted-foreground">
              Idempotent registerAsset() stores public_id, SHA-256 hash, and 9 metadata fields.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              3. AI Analysis
            </div>
            <p className="text-muted-foreground">
              VLM produces neutral observations, bboxes, confidence; filtered for blame terms.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              4. Search API
            </div>
            <p className="text-muted-foreground">
              Server-side expression builder queries Cloudinary Search API with metadata filters.
            </p>
          </div>
        </div>
      </section>

      {/* Property #381 Timeline View */}
      <section id="timeline" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              Property Timeline: {timeline.property.address_label} ({timeline.property.unit_label})
            </h2>
            <p className="text-sm text-muted-foreground">
              Chronological inspection baseline and periodic comparisons.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-accent/10 text-accent font-semibold px-2.5 py-1 rounded-md border border-accent/20">
              {APP_COPY.ai.originalPreservedBadge}
            </span>
          </div>
        </div>

        {/* Inspections List */}
        <div className="space-y-8">
          {timeline.inspections.map((insp) => (
            <div
              key={insp.id}
              className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="capitalize font-bold text-lg text-foreground">
                      {insp.type.replace("_", " ")}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary font-medium text-muted-foreground">
                      {new Date(insp.captured_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inspection ID: <code className="font-mono text-xs">{insp.id}</code>
                  </p>
                </div>

                <div className="text-xs text-muted-foreground">
                  {insp.assets.length} Photo{insp.assets.length !== 1 ? "s" : ""} Captured
                </div>
              </div>

              {/* Assets in this Inspection */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {insp.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="border border-border rounded-lg overflow-hidden bg-background flex flex-col group hover:border-primary/50 transition-colors"
                  >
                    {/* Image display */}
                    <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                      <img
                        src={media.thumb(asset.secure_url)}
                        alt={`Inspection photo for ${asset.room.name}`}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                        loading="lazy"
                      />

                      {/* Room Badge */}
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-white text-xs font-semibold px-2 py-0.5 rounded">
                        {asset.room.name}
                      </div>

                      {/* Status Badge */}
                      <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded shadow">
                        Analyzed
                      </div>
                    </div>

                    {/* Metadata & Observations */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span className="font-mono text-[11px] truncate max-w-[180px]">
                            {asset.cloudinary_public_id.split("/").pop()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            SHA: {asset.sha256?.substring(0, 8)}...
                          </span>
                        </div>

                        {/* Observations list */}
                        {asset.observations.length > 0 ? (
                          <div className="space-y-2 mt-2">
                            {asset.observations.map((obs) => (
                              <div
                                key={obs.id}
                                className="bg-secondary/60 rounded-md p-2.5 text-xs space-y-1 border border-border"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold capitalize text-foreground flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    {obs.category} ({obs.sub_area})
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {Math.round(obs.confidence * 100)}% conf
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-[11px] leading-relaxed">
                                  {obs.description}
                                </p>
                                <div className="flex items-center justify-between pt-1 text-[10px]">
                                  <span className="text-accent font-medium">
                                    {APP_COPY.ai.statusLabels[obs.review_status as keyof typeof APP_COPY.ai.statusLabels] || obs.review_status}
                                  </span>
                                  {obs.reviewer_note && (
                                    <span className="text-muted-foreground italic truncate max-w-[140px]">
                                      &ldquo;{obs.reviewer_note}&rdquo;
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic mt-2">
                            {APP_COPY.ai.noObservationsFound}
                          </p>
                        )}
                      </div>

                      {/* Asset Footer */}
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Quality: {asset.image_quality || "ok"}</span>
                        <Link
                          href={`/review?assetId=${asset.id}`}
                          className="text-primary hover:underline font-semibold"
                        >
                          Review details &rarr;
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

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
  Building,
  CheckSquare,
  History,
  FileText,
  AlertCircle,
  Eye,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { APP_COPY } from "@/lib/copy";

export default async function DashboardPage() {
  const db = getDatabase();
  const media = getMediaProvider();

  const timeline = await db.getTimeline("prop-381");
  const isMockMedia = media.isMock();

  // Aggregate stats
  const totalInspections = timeline.inspections.length;
  const allAssets = timeline.inspections.flatMap((i) => i.assets);
  const totalAssets = allAssets.length;
  const allObservations = allAssets.flatMap((a) => a.observations);
  const totalObservations = allObservations.length;
  const pendingReviewCount = allObservations.filter((o) => o.review_status === "pending").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-border p-6 sm:p-10 shadow-sm">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pixels to Products &bull; Cloudinary AI Hackathon 2026 (Track 1)</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground">
            {APP_COPY.name}
          </h1>

          <p className="text-lg sm:text-xl font-medium text-primary">
            &ldquo;{APP_COPY.tagline}&rdquo;
          </p>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            RentalMove turns rental property condition photos into an immutable, searchable visual
            memory. Establish a verified move-in baseline, trace room changes across periodic
            inspections, and compare visual evidence at move-out with assistive AI observations.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/capture"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-hover shadow-md shadow-primary/25 transition-all hover:gap-3"
            >
              <Camera className="w-4 h-4" />
              Start New Inspection
            </Link>
            <Link
              href="/review"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-secondary/80 border border-border transition-all"
            >
              <CheckSquare className="w-4 h-4" />
              Review Center
              {pendingReviewCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {pendingReviewCount}
                </span>
              )}
            </Link>
            <Link
              href="/timeline"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              <Clock className="w-4 h-4" />
              View Timeline &rarr;
            </Link>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Property Summary & Stats Bar */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              Active Property: {timeline.property.address_label}
            </h2>
            <p className="text-xs text-muted-foreground">
              Unit {timeline.property.unit_label} &bull; Property ID:{" "}
              <code className="font-mono text-xs">{timeline.property.id}</code>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-3 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                isMockMedia
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              {isMockMedia ? "Media: Mock Mode" : "Media: Live Cloudinary SDK"}
            </span>
            <span className="px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              SHA-256 Verified
            </span>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">Inspections</span>
            <div className="text-2xl font-black text-foreground mt-1">{totalInspections}</div>
            <span className="text-[11px] text-muted-foreground">2024 Move-In &bull; 2026 Move-Out</span>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">Photos Archived</span>
            <div className="text-2xl font-black text-foreground mt-1">{totalAssets}</div>
            <span className="text-[11px] text-muted-foreground">Across 4 standard rooms</span>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">AI Observations</span>
            <div className="text-2xl font-black text-foreground mt-1">{totalObservations}</div>
            <span className="text-[11px] text-accent font-medium">Neutral assistive notes</span>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">Structured Metadata</span>
            <div className="text-2xl font-black text-foreground mt-1">9 Fields</div>
            <span className="text-[11px] text-primary font-medium">Indexed in Cloudinary</span>
          </div>
        </div>
      </section>

      {/* Quick Navigation Cards Grid */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">Explore RentalMove Workflows</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tile 1: Capture */}
          <Link
            href="/capture"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                <Camera className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Capture &amp; Upload</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Take inspection photos with camera or drop files. Uses the <strong>Ghost Overlay</strong> of
                the baseline image to guarantee framing alignment.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Start photo capture</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Tile 2: Review Center */}
          <Link
            href="/review"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Review Center</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Triage AI observations with bounding-box overlays. Accept, reject, or edit with
                keyboard shortcuts (<code>A</code> / <code>R</code> / <code>E</code>).
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-accent group-hover:gap-1.5 transition-all">
              <span>Open Review Center</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Tile 3: Compare View */}
          <Link
            href="/compare"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Before &amp; After Compare</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Side-by-side and interactive split slider comparing baseline move-in photos with
                later inspections. Includes difference-blend analysis.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Compare room captures</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Tile 4: Timeline */}
          <Link
            href="/timeline"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-secondary text-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Property Timeline</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Vertical chronological timeline of Move-In (2024), Periodic Inspection (2025), and
                Move-Out (2026) with all rooms organized.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-foreground group-hover:gap-1.5 transition-all">
              <span>Browse timeline</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Tile 5: Room History */}
          <Link
            href="/rooms"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-secondary text-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
                <History className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Room History Gallery</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Filter by kitchen, bathroom, bedroom, or living room to view longitudinal photo
                records across every inspection.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-foreground group-hover:gap-1.5 transition-all">
              <span>View room records</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Tile 6: Search & Reports */}
          <Link
            href="/search"
            className="group bg-card border border-border rounded-xl p-6 shadow-xs hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                <Search className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-foreground text-base">Cloudinary Search &amp; NL Query</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Execute server-side queries on Cloudinary structured metadata or type natural
                queries like <em>&ldquo;show kitchen observations from 2025&rdquo;</em>.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Search media assets</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>
        </div>
      </section>

      {/* Recent Condition Activity Preview */}
      <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Recent Condition Snapshots</h3>
            <p className="text-xs text-muted-foreground">
              Latest photos uploaded and processed through Cloudinary media pipeline.
            </p>
          </div>
          <Link href="/timeline" className="text-xs font-semibold text-primary hover:underline">
            View all {totalAssets} photos &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {allAssets.slice(0, 3).map((asset) => (
            <div
              key={asset.id}
              className="border border-border rounded-lg overflow-hidden bg-background flex flex-col group"
            >
              <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                <img
                  src={media.thumb(asset.secure_url)}
                  alt={asset.room.name}
                  className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold px-2 py-0.5 rounded capitalize">
                  {asset.room.name}
                </div>
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
                  SHA-256 Stored
                </div>
              </div>

              <div className="p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                  <span>Inspection: {asset.inspection_id}</span>
                  <span className="font-mono text-[10px]">
                    {asset.sha256?.substring(0, 8)}...
                  </span>
                </div>

                {asset.observations.length > 0 ? (
                  <div className="bg-secondary/60 rounded p-2 text-[11px] text-foreground">
                    <span className="font-semibold capitalize text-primary">
                      {asset.observations[0].category} ({asset.observations[0].sub_area}):
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {asset.observations[0].description}
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic text-[11px]">
                    No irregularities detected.
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between">
                  <Link
                    href={`/review?assetId=${asset.id}`}
                    className="text-primary hover:underline font-semibold text-[11px]"
                  >
                    Open in Review Center &rarr;
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

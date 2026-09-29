import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Camera,
  Layers,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Cloud,
  Building,
  CheckSquare,
  History,
  FileText,
  PlusCircle,
  UserCheck,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { APP_COPY } from "@/lib/copy";
import { getServerUser, createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchUserProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Get the authenticated user from JWT
  const authUser = await getServerUser();
  if (!authUser) {
    redirect("/login");
  }

  // Get user profile (role, property assignments)
  const currentUser = await fetchUserProfile(authUser.id);
  if (!currentUser) {
    // User is authenticated but has no profile — redirect to create one
    redirect("/signup?step=profile");
  }

  const db = getDatabase();
  const media = getMediaProvider();

  const isOwner = currentUser.role === "owner";
  const isMockMedia = media.isMock();

  // Fetch properties based on role
  const allProperties = await db.listProperties(currentUser.id, currentUser.role);

  // For tenant: show their assigned property
  // For owner: show their first property (for stats) and all properties below
  const activePropertyId =
    currentUser.assigned_property_id || allProperties[0]?.id;

  let timeline = null;
  let totalInspections = 0;
  let totalAssets = 0;
  let totalObservations = 0;
  let pendingReviewCount = 0;

  if (activePropertyId) {
    timeline = await db.getTimeline(activePropertyId);
    totalInspections = timeline.inspections.length;
    const allAssets = timeline.inspections.flatMap((i) => i.assets);
    totalAssets = allAssets.length;
    const allObservations = allAssets.flatMap((a) => a.observations);
    totalObservations = allObservations.length;
    pendingReviewCount = allObservations.filter(
      (o) => o.review_status === "pending"
    ).length;
  }

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

          {/* User Identity Banner */}
          <div className="bg-secondary/60 border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="text-xs font-bold text-foreground block">
                  {currentUser.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({isOwner ? "Property Owner" : "Tenant"})
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {currentUser.email}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Owner Access
                </span>
              ) : (
                <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Tenant Access
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/capture"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 shadow-md shadow-primary/25 transition-all hover:gap-3"
            >
              <Camera className="w-4 h-4" />
              {isOwner ? "Add Periodic Inspection" : "Start Move-In / Capture"}
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
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              <Layers className="w-4 h-4" />
              Compare Baseline
            </Link>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Role-Specific View */}
      {isOwner ? (
        /* OWNER DASHBOARD SECTION */
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Building className="w-5 h-5 text-accent" />
                Owner Property Portfolio
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage properties, room definitions, periodic inspections, and evidence history.
              </p>
            </div>
            <Link
              href="/capture"
              className="px-3.5 py-1.5 bg-accent text-accent-foreground text-xs font-semibold rounded-lg hover:opacity-90 shadow-xs flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create Inspection
            </Link>
          </div>

          {allProperties.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
              <Building className="w-10 h-10 text-muted-foreground mx-auto" />
              <h3 className="font-semibold text-foreground">No properties yet</h3>
              <p className="text-sm text-muted-foreground">
                Create your first property to start capturing inspections.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allProperties.map((p) => (
                <div
                  key={p.id}
                  className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-foreground text-base">{p.address_label}</h3>
                      <p className="text-xs text-muted-foreground">
                        Unit {p.unit_label} &bull; Property ID:{" "}
                        <code className="font-mono text-xs">{p.id}</code>
                      </p>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border text-xs">
                    <Link
                      href={`/timeline?property=${p.id}`}
                      className="text-primary font-semibold hover:underline flex items-center gap-1"
                    >
                      Open Timeline &rarr;
                    </Link>
                    <span className="text-muted-foreground">&bull;</span>
                    <Link href={`/rooms?property=${p.id}`} className="text-muted-foreground hover:text-foreground">
                      Inspect Rooms
                    </Link>
                    <span className="text-muted-foreground">&bull;</span>
                    <Link href={`/report?property=${p.id}`} className="text-muted-foreground hover:text-foreground">
                      View Report
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* TENANT DASHBOARD SECTION */
        <section className="space-y-4">
          {timeline ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Building className="w-5 h-5 text-primary" />
                    Assigned Residence: {timeline.property.address_label}
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
                    SHA-256 Verified Ingest
                  </span>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground">Recorded Inspections</span>
                  <div className="text-2xl font-black text-foreground mt-1">{totalInspections}</div>
                  <span className="text-[11px] text-muted-foreground">Move-In &bull; Periodic &bull; Move-Out</span>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground">Photos Ingested</span>
                  <div className="text-2xl font-black text-foreground mt-1">{totalAssets}</div>
                  <span className="text-[11px] text-muted-foreground">Stored on Cloudinary CDN</span>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground">AI Observations</span>
                  <div className="text-2xl font-black text-foreground mt-1">{totalObservations}</div>
                  <span className="text-[11px] text-accent font-medium">Neutral assistive notes</span>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground">Pending Review</span>
                  <div className="text-2xl font-black text-foreground mt-1">{pendingReviewCount}</div>
                  <span className="text-[11px] text-primary font-medium">Needs attention</span>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
              <Building className="w-10 h-10 text-muted-foreground mx-auto" />
              <h3 className="font-semibold text-foreground">No property assigned</h3>
              <p className="text-sm text-muted-foreground">
                Your landlord will assign you to a property when you join.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Quick Navigation Cards Grid */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">Explore RentalMove Workflows</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                Take inspection photos or short videos. Uses real signed Cloudinary uploads and the <strong>Ghost Overlay</strong> to ensure exact baseline alignment.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Start photo capture</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

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
                Interactive split slider and side-by-side view comparing baseline move-in photos with
                later inspections, powered by real Cloudinary media and VLM difference analysis.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Compare room captures</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

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
                Chronological timeline of all inspections with all rooms organized and verified.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-foreground group-hover:gap-1.5 transition-all">
              <span>Browse timeline</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

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
                records across every inspection with SHA-256 integrity verification.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-foreground group-hover:gap-1.5 transition-all">
              <span>View room records</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

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
                Execute queries on Cloudinary structured metadata or type natural
                queries like <em>&ldquo;show kitchen observations from 2025&rdquo;</em> parsed by Groq LLM.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
              <span>Search media assets</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>
        </div>
      </section>

      {/* AI Privacy & Responsibility Stance Banner */}
      <section className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Responsible AI &amp; Evidence Management Stance
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {APP_COPY.ai.disclaimerBanner}
        </p>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-4 pt-1 border-t border-border">
          <span>&bull; Assistive observations only</span>
          <span>&bull; No automated financial deductions</span>
          <span>&bull; Original media preserved immutably in Cloudinary</span>
          <span>&bull; Full human review trail with cryptographic audit stamps</span>
        </div>
      </section>
    </div>
  );
}

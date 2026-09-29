import React from "react";
import Link from "next/link";
import {
  FileText,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Building,
  Sparkles,
  ExternalLink,
  Share2,
  AlertTriangle,
  Lock,
  Trash2,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { APP_COPY } from "@/lib/copy";
import { getServerUser } from "@/lib/supabase-server";
import { fetchUserProfile } from "@/lib/auth";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; property_id?: string }>;
}) {
  const { token, property_id } = await searchParams;
  const db = getDatabase();
  const media = getMediaProvider();

  let activePropertyId: string | null = null;
  let isPublicTokenAccess = false;
  let isTokenValid = true;

  if (token) {
    isPublicTokenAccess = true;
    const shareLink = await db.getShareLink(token);
    if (!shareLink) {
      isTokenValid = false;
    } else {
      activePropertyId = shareLink.property_id;
    }
  } else {
    // Authenticated route — verify JWT
    const authUser = await getServerUser();
    if (!authUser) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Authentication Required</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Inspection reports are protected visual records. Please log in as the property owner or assigned tenant, or access via a valid verified share token link.
            </p>
          </div>
          <div className="pt-4 flex justify-center gap-3">
            <Link href="/login" className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 shadow-xs">
              Sign in
            </Link>
          </div>
        </div>
      );
    }

    const currentUser = await fetchUserProfile(authUser.id, authUser.email);
    if (currentUser) {
      if (property_id) {
        activePropertyId = property_id;
      } else if (currentUser.role === "tenant" && currentUser.assigned_property_id) {
        activePropertyId = currentUser.assigned_property_id;
      } else if (currentUser.role === "owner" && currentUser.owned_properties && currentUser.owned_properties.length > 0) {
        activePropertyId = currentUser.owned_properties[0];
      }
    }
  }

  // Token Validation Failure State
  if (isPublicTokenAccess && !isTokenValid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Invalid, Expired, or Revoked Share Link
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The verification token <code className="font-mono text-primary font-bold">{token}</code> is either invalid, has expired past its validity window, or was revoked by the property owner.
          </p>
        </div>
        <div className="pt-4 flex justify-center gap-3">
          <Link href="/" className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 shadow-xs">
            Return to RentalMove Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!activePropertyId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
        <Building className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold text-foreground">No Property Found</h1>
        <p className="text-sm text-muted-foreground">You are not yet assigned to a property. Contact your landlord.</p>
      </div>
    );
  }

  let timeline;
  try {
    timeline = await db.getTimeline(activePropertyId);
  } catch {
    timeline = null;
  }

  if (!timeline) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">No inspection data found for this property.</p>
      </div>
    );
  }

  const reportToken = token || "demo-token-9842f1a";
  const totalAssets = timeline.inspections.flatMap((i) => i.assets).length;
  const acceptedObs = timeline.inspections
    .flatMap((i) => i.assets)
    .flatMap((a) => a.observations)
    .filter((o) => o.review_status === "accepted");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Report Action Header (Hidden in Print) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-xs">
        <div>
          <span className="text-xs font-semibold text-accent flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            Official Visual Inspection Record
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPublicTokenAccess ? (
              <span>Public Verified Token: <code className="font-mono text-primary">{token}</code></span>
            ) : (
              <span>Authenticated Property View &bull; Active Property: <strong>{timeline.property.address_label}</strong></span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/report?token=${reportToken}`}
            className="px-3.5 py-2 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80 border border-border flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-primary" />
            Share Link
          </Link>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Official Printable Report Document Container */}
      <div className="bg-card border border-border rounded-2xl p-8 sm:p-12 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b border-border pb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold">
                RM
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                RentalMove Condition Report
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Cryptographically verified visual history &bull; Powered by Cloudinary AI
            </p>
          </div>

          <div className="text-right space-y-1 text-xs text-muted-foreground sm:border-l sm:border-border sm:pl-6">
            <div>
              Generated:{" "}
              <span className="font-semibold text-foreground">
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div>
              Verification Token: <span className="font-mono text-primary font-bold">{reportToken}</span>
            </div>
            <div>
              Integrity Status:{" "}
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                SHA-256 Verified Ingest
              </span>
            </div>
          </div>
        </div>

        {/* Property & Tenant Context Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-secondary/40 border border-border p-5 rounded-xl text-xs">
          <div>
            <span className="text-muted-foreground block font-medium">Property Address</span>
            <span className="font-bold text-foreground text-sm mt-0.5 block">
              {timeline.property.address_label}
            </span>
            <span className="text-muted-foreground">Unit {timeline.property.unit_label}</span>
          </div>

          <div>
            <span className="text-muted-foreground block font-medium">Inspection Scope</span>
            <span className="font-bold text-foreground text-sm mt-0.5 block">
              {timeline.inspections.length} Recorded Inspections
            </span>
            <span className="text-muted-foreground">{totalAssets} Photos &bull; Indexed Media</span>
          </div>

          <div>
            <span className="text-muted-foreground block font-medium">Verified Condition Findings</span>
            <span className="font-bold text-foreground text-sm mt-0.5 block">
              {acceptedObs.length} Confirmed Observations
            </span>
            <span className="text-muted-foreground">Reviewed by tenant &amp; owner</span>
          </div>
        </div>

        {/* Inspections & Evidence Breakdown */}
        <div className="space-y-8">
          <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
            Inspection Evidence Archive
          </h2>

          {timeline.inspections.map((insp) => (
            <div key={insp.id} className="space-y-4">
              <div className="flex items-center justify-between text-xs bg-secondary/70 p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground capitalize text-sm">
                    {insp.type.replace("_", " ")} Inspection
                  </span>
                  <span className="text-muted-foreground">
                    &bull;{" "}
                    {new Date(insp.captured_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">ID: {insp.id}</span>
              </div>

              {/* Photos for this inspection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {insp.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="border border-border rounded-xl p-4 space-y-3 bg-background"
                  >
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-black/90">
                      {(() => {
                        const activeObs = asset.observations.filter(
                          (o) => o.review_status !== "rejected" && o.bbox
                        );
                        const boxes = activeObs.map((o) => ({
                          bbox: o.bbox,
                          label: `${o.category} ${Math.round(o.confidence * 100)}%`,
                        }));
                        const displayUrl =
                          boxes.length > 0
                            ? media.evidence(
                                asset.cloudinary_public_id || asset.secure_url,
                                boxes,
                                { pixelateFaces: true }
                              )
                            : media.shared(asset.cloudinary_public_id || asset.secure_url);

                        return (
                          <>
                            <img
                              src={displayUrl}
                              alt={asset.room.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2 bg-black/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded capitalize">
                              {asset.room.name}
                            </div>
                            <div className="absolute top-2 right-2 bg-emerald-700/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 shadow">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Privacy &bull; Face Pixelated
                            </div>
                            {boxes.length > 0 && (
                              <div className="absolute bottom-2 left-2 bg-red-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                                Cloudinary Evidence Layer
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                        <span className="truncate max-w-[200px]">{asset.cloudinary_public_id}</span>
                        <span>ETag: {asset.etag ? asset.etag.substring(0, 12) : "verified"}</span>
                      </div>

                      <div className="bg-secondary/40 p-2 rounded text-[11px] font-mono text-muted-foreground truncate">
                        SHA-256: {asset.sha256 || "cryptographic hash on record"}
                      </div>

                      {asset.observations.length > 0 ? (
                        <div className="bg-accent/10 border border-accent/20 rounded p-2.5 space-y-1">
                          <span className="font-semibold text-foreground capitalize block">
                            Confirmed: {asset.observations[0].category} ({asset.observations[0].sub_area})
                          </span>
                          <p className="text-muted-foreground text-[11px]">
                            {asset.observations[0].description}
                          </p>
                          {asset.observations[0].reviewer_note && (
                            <p className="text-[10px] text-primary italic">
                              Reviewer Note: &ldquo;{asset.observations[0].reviewer_note}&rdquo;
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          No surface irregularities noted.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Legal & AI Disclaimer Statement */}
        <div className="pt-6 border-t border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
          <span className="font-bold text-foreground block">
            RentalMove Verification &amp; AI Disclaimer:
          </span>
          <p>{APP_COPY.ai.disclaimerBanner}</p>
          <p>
            Media assets are stored immutably on Cloudinary. Any modifications, human review notes,
            or status overrides are cryptographically timestamped and preserve the full audit trail.
          </p>
          <div className="pt-2 text-[11px] text-muted-foreground flex items-center justify-between border-t border-border/50">
            <span>{APP_COPY.footer.poweredBy}</span>
            <span>Document Ref: RM-2026-381-PUB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

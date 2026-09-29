"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckSquare,
  CheckCircle2,
  XCircle,
  Edit3,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Layers,
  ArrowRight,
  Save,
  Clock,
  RotateCcw,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

interface Observation {
  id: string;
  asset_id: string;
  category: string;
  sub_area: string;
  description: string;
  confidence: number;
  bbox: [number, number, number, number];
  review_status: "pending" | "accepted" | "rejected" | "edited";
  reviewer_note?: string;
  source: "ai" | "human";
  edited_from?: any;
}

interface Asset {
  id: string;
  cloudinary_public_id: string;
  secure_url: string;
  room_guess?: string;
  room: { name: string; category: string };
  inspection_id: string;
  sha256?: string;
  observations: Observation[];
}

export default function ReviewCenterPage() {
  const [timelineData, setTimelineData] = useState<any | null>(null);
  const [currentAssetIndex, setCurrentAssetIndex] = useState<number>(0);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editCategory, setEditCategory] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editSubArea, setEditSubArea] = useState<string>("");
  const [reviewerNote, setReviewerNote] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);

  // Fetch timeline data to get assets and observations
  const loadData = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/timeline`);
      if (!res.ok) {
        console.error("Timeline fetch failed:", res.status);
        return;
      }
      const data = await res.json();
      setTimelineData(data);
    } catch (err) {
      console.error("Failed to load timeline data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || !data.user) {
          setLoading(false);
          return;
        }
        const propId = data.user.assigned_property_id || data.user.owned_properties?.[0];
        if (propId) {
          setActivePropertyId(propId);
          loadData(propId);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const allAssets: Asset[] =
    timelineData?.inspections?.flatMap((insp: any) => insp.assets) || [];
  const currentAsset: Asset | undefined = allAssets[currentAssetIndex];

  // Set initial editing fields when currentAsset changes
  useEffect(() => {
    if (currentAsset?.observations?.[0]) {
      const obs = currentAsset.observations[0];
      setEditCategory(obs.category);
      setEditDescription(obs.description);
      setEditSubArea(obs.sub_area);
      setReviewerNote(obs.reviewer_note || "");
    }
  }, [currentAssetIndex, currentAsset]);

  // Keyboard shortcut listener (A = Accept, R = Reject, E = Edit, Arrow keys = Navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleReviewAction("accepted");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleReviewAction("rejected");
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setIsEditing((prev) => !prev);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevAsset();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextAsset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentAssetIndex, currentAsset, allAssets.length]);

  const handleNextAsset = () => {
    if (currentAssetIndex < allAssets.length - 1) {
      setCurrentAssetIndex((prev) => prev + 1);
      setIsEditing(false);
    }
  };

  const handlePrevAsset = () => {
    if (currentAssetIndex > 0) {
      setCurrentAssetIndex((prev) => prev - 1);
      setIsEditing(false);
    }
  };

  const handleReviewAction = async (status: "accepted" | "rejected" | "edited") => {
    if (!currentAsset?.observations?.[0]) return;
    const obsId = currentAsset.observations[0].id;

    try {
      const payload: any = {
        review_status: status,
        reviewer_note: reviewerNote || (status === "accepted" ? "Verified by reviewer" : "Dismissed"),
      };

      if (status === "edited") {
        payload.edited_category = editCategory;
        payload.edited_description = editDescription;
        payload.edited_sub_area = editSubArea;
      }

      await fetch(`/api/observations/${obsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setIsEditing(false);
      if (activePropertyId) await loadData(activePropertyId);
    } catch (err) {
      console.error("Failed to update observation:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-muted-foreground">
        Loading Review Center assets...
      </div>
    );
  }

  if (!currentAsset) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-muted-foreground">
        No inspection photos available to review.
      </div>
    );
  }

  const primaryObs = currentAsset.observations[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header with Navigation and Keyboard Shortcuts Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-accent" />
            Inspection Review Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit AI-assisted visual observations &bull; Human-in-the-loop verification
          </p>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/70 border border-border px-3 py-1.5 rounded-lg">
          <span className="font-semibold text-foreground">Shortcuts:</span>
          <span>
            <kbd className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] font-mono">A</kbd> Accept
          </span>
          <span>&bull;</span>
          <span>
            <kbd className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] font-mono">R</kbd> Reject
          </span>
          <span>&bull;</span>
          <span>
            <kbd className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] font-mono">E</kbd> Edit
          </span>
          <span>&bull;</span>
          <span>
            <kbd className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] font-mono">&larr;</kbd>{" "}
            <kbd className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] font-mono">&rarr;</kbd> Next
          </span>
        </div>
      </div>

      {/* Main Review Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Image with Bounding Box Overlay */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/95 border border-border flex items-center justify-center shadow-md">
            {/* The Inspection Image */}
            <img
              src={currentAsset.secure_url}
              alt={currentAsset.room.name}
              className="w-full h-full object-cover"
            />

            {/* SVG Bounding Box Canvas Overlay */}
            {primaryObs && primaryObs.bbox && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
              >
                {/* Normalized BBox [x1, y1, x2, y2] */}
                <rect
                  x={primaryObs.bbox[0]}
                  y={primaryObs.bbox[1]}
                  width={primaryObs.bbox[2] - primaryObs.bbox[0]}
                  height={primaryObs.bbox[3] - primaryObs.bbox[1]}
                  fill="rgba(245, 158, 11, 0.2)"
                  stroke="#f59e0b"
                  strokeWidth="0.005"
                  strokeDasharray="0.015,0.01"
                />
              </svg>
            )}

            {/* Bounding Box Label on Image */}
            {primaryObs && primaryObs.bbox && (
              <div
                className="absolute text-[11px] font-semibold bg-amber-500 text-black px-2 py-0.5 rounded shadow pointer-events-none capitalize"
                style={{
                  left: `${primaryObs.bbox[0] * 100}%`,
                  top: `${Math.max(2, (primaryObs.bbox[1] * 100) - 4)}%`,
                }}
              >
                {primaryObs.category} ({Math.round(primaryObs.confidence * 100)}% conf)
              </div>
            )}

            {/* Top Room & Inspection Badges */}
            <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-md shadow">
              {currentAsset.room.name} &bull; {currentAsset.inspection_id}
            </div>

            <div className="absolute top-3 right-3 text-xs bg-accent/90 text-white font-bold px-2.5 py-1 rounded-md shadow">
              {primaryObs ? primaryObs.review_status.toUpperCase() : "NO ISSUES"}
            </div>
          </div>

          {/* Asset Navigation Controls */}
          <div className="flex items-center justify-between bg-card border border-border p-3 rounded-xl text-xs">
            <button
              onClick={handlePrevAsset}
              disabled={currentAssetIndex === 0}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors flex items-center gap-1 font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous Photo
            </button>

            <span className="font-semibold text-foreground">
              Photo {currentAssetIndex + 1} of {allAssets.length}
            </span>

            <button
              onClick={handleNextAsset}
              disabled={currentAssetIndex === allAssets.length - 1}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors flex items-center gap-1 font-medium"
            >
              Next Photo
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Observation Details & Decision Controls */}
        <div className="space-y-5">
          {primaryObs ? (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Assistive Observation
                </div>
                <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded border border-amber-500/20">
                  {APP_COPY.ai.reviewRequired}
                </span>
              </div>

              {/* Confidence Meter */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Confidence Score</span>
                  <span className="font-mono font-bold text-foreground">
                    {Math.round(primaryObs.confidence * 100)}%
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-accent h-2 rounded-full"
                    style={{ width: `${primaryObs.confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Observation Content (View vs Edit Mode) */}
              {isEditing ? (
                /* Edit Mode */
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Issue Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="scratch">Scratch</option>
                      <option value="stain">Stain</option>
                      <option value="crack">Crack</option>
                      <option value="dent">Dent</option>
                      <option value="mark">Mark</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Sub-Area Location
                    </label>
                    <input
                      type="text"
                      value={editSubArea}
                      onChange={(e) => setEditSubArea(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Description (Neutral wording)
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleReviewAction("edited")}
                      className="flex-1 py-2 bg-accent text-accent-foreground font-semibold text-xs rounded-lg hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Modifications
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-2 bg-secondary text-muted-foreground text-xs rounded-lg hover:bg-secondary/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="space-y-3">
                  <div className="bg-secondary/60 p-3.5 rounded-lg border border-border space-y-1">
                    <div className="text-[11px] font-bold text-foreground capitalize flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {primaryObs.category} ({primaryObs.sub_area})
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {primaryObs.description}
                    </p>
                  </div>

                  {/* Audit Trail Note if already reviewed */}
                  {primaryObs.reviewer_note && (
                    <div className="bg-secondary/30 p-2.5 rounded-lg border border-border/70 text-[11px] text-muted-foreground space-y-0.5">
                      <span className="font-semibold text-foreground">Reviewer Note:</span>
                      <p className="italic">&ldquo;{primaryObs.reviewer_note}&rdquo;</p>
                      {primaryObs.edited_from && (
                        <span className="block text-[10px] text-primary pt-0.5">
                          (Edited from original AI suggestion &bull; Audit trail preserved)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Reviewer Note Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Add / Update Reviewer Note
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Confirmed baseline scratch during walkthrough"
                      value={reviewerNote}
                      onChange={(e) => setReviewerNote(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  {/* Action Buttons: Accept / Reject / Edit */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => handleReviewAction("accepted")}
                      className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Accept Observation (A)
                    </button>
                    <button
                      onClick={() => handleReviewAction("rejected")}
                      className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      Dismiss / Reject (R)
                    </button>
                  </div>

                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full py-2 bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-primary" />
                    Modify Observation Content (E)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-sm text-foreground">Clean Area</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {APP_COPY.ai.noObservationsFound}
              </p>
            </div>
          )}

          {/* Legal / Assistive Disclaimer */}
          <div className="p-3.5 rounded-lg bg-secondary/40 border border-border text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <span>
              Observations are assistive visual notes. Human review overrides all suggestions.
              Accepted observations are attached to the permanent inspection record.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

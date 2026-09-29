"use client";

import React, { useState, useEffect } from "react";
import {
  Layers,
  Sparkles,
  Sliders,
  Columns,
  Eye,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Building,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

interface Asset {
  id: string;
  room_id: string;
  cloudinary_public_id: string;
  secure_url: string;
  etag?: string;
  sha256?: string;
  captured_at: string;
  room: { id: string; name: string; category: string };
  observations: any[];
}

interface Inspection {
  id: string;
  type: string;
  captured_at: string;
  status: string;
  assets: Asset[];
}

export default function ComparePage() {
  const [timeline, setTimeline] = useState<{ property: any; inspections: Inspection[] } | null>(
    null
  );
  const [selectedRoomCategory, setSelectedRoomCategory] = useState<string>("kitchen");
  const [priorInspectionId, setPriorInspectionId] = useState<string>("");
  const [currentInspectionId, setCurrentInspectionId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"slider" | "sideBySide">("slider");
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [diffBlend, setDiffBlend] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch timeline from DB
  const loadTimeline = async () => {
    try {
      const res = await fetch("/api/properties/prop-381/timeline");
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);

        // Set default prior and current inspections
        if (data.inspections && data.inspections.length >= 2) {
          const sorted = [...data.inspections].sort(
            (a: any, b: any) =>
              new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
          );
          setPriorInspectionId(sorted[0].id); // oldest (e.g. Move-in)
          setCurrentInspectionId(sorted[sorted.length - 1].id); // newest (e.g. Move-out)
        }
      }
    } catch (err) {
      console.error("Failed to load compare timeline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, []);

  const inspections = timeline?.inspections || [];

  // Find assets matching selected room category in both inspections
  const priorInspection = inspections.find((i) => i.id === priorInspectionId);
  const currentInspection = inspections.find((i) => i.id === currentInspectionId);

  const priorAsset = priorInspection?.assets.find(
    (a) => a.room?.category === selectedRoomCategory || a.room_id.includes(selectedRoomCategory)
  );
  const currentAsset = currentInspection?.assets.find(
    (a) => a.room?.category === selectedRoomCategory || a.room_id.includes(selectedRoomCategory)
  );

  const handleAnalyzeDifferences = async () => {
    if (!priorAsset || !currentAsset) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prior_asset_id: priorAsset.id,
          current_asset_id: currentAsset.id,
          property_id: "prop-381",
          room_id: priorAsset.room_id,
        }),
      });
      const data = await res.json();
      setComparisonResult(data.result);
    } catch (err) {
      console.error("Comparison analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const roomCategories = [
    { id: "kitchen", label: "Kitchen" },
    { id: "bathroom", label: "Bathroom" },
    { id: "living_room", label: "Living Room" },
    { id: "bedroom", label: "Master Bedroom" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="w-7 h-7 text-primary" />
            Before &amp; After Condition Comparison
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare baseline move-in captures against periodic inspections and move-out records using real Cloudinary media.
          </p>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg border border-border">
          <button
            onClick={() => setViewMode("slider")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              viewMode === "slider"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Split Slider
          </button>
          <button
            onClick={() => setViewMode("sideBySide")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              viewMode === "sideBySide"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            Side-by-Side
          </button>
          <button
            onClick={() => setDiffBlend(!diffBlend)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              diffBlend
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Toggle Difference Blend filter"
          >
            <Eye className="w-3.5 h-3.5" />
            Diff Blend
          </button>
        </div>
      </div>

      {/* Selectors Bar: Room + Inspections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card p-4 rounded-xl border border-border shadow-xs">
        {/* Room Picker */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            1. Select Room:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {roomCategories.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRoomCategory(r.id);
                  setComparisonResult(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                  selectedRoomCategory === r.id
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-secondary/60 text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prior Inspection Picker */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            2. Prior Inspection (Baseline):
          </label>
          <select
            value={priorInspectionId}
            onChange={(e) => {
              setPriorInspectionId(e.target.value);
              setComparisonResult(null);
            }}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {inspections.map((insp) => (
              <option key={insp.id} value={insp.id}>
                {insp.type.toUpperCase().replace("_", " ")} (
                {new Date(insp.captured_at).getFullYear()}) - {insp.id}
              </option>
            ))}
          </select>
        </div>

        {/* Current Inspection Picker */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            3. Comparison Inspection (Current):
          </label>
          <select
            value={currentInspectionId}
            onChange={(e) => {
              setCurrentInspectionId(e.target.value);
              setComparisonResult(null);
            }}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {inspections.map((insp) => (
              <option key={insp.id} value={insp.id}>
                {insp.type.toUpperCase().replace("_", " ")} (
                {new Date(insp.captured_at).getFullYear()}) - {insp.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Viewport */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        {/* Sub-header labels */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-foreground px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>
              Prior: {priorInspection?.type.replace("_", " ").toUpperCase() || "Baseline"} (
              {priorInspection ? new Date(priorInspection.captured_at).getFullYear() : "2024"})
            </span>
            {priorAsset && (
              <span className="text-[10px] font-mono text-muted-foreground">
                ETag: {priorAsset.etag?.substring(0, 10)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span>
              Current: {currentInspection?.type.replace("_", " ").toUpperCase() || "Current"} (
              {currentInspection ? new Date(currentInspection.captured_at).getFullYear() : "2026"})
            </span>
            {currentAsset && (
              <span className="text-[10px] font-mono text-muted-foreground">
                ETag: {currentAsset.etag?.substring(0, 10)}
              </span>
            )}
          </div>
        </div>

        {/* If assets missing for selected combination */}
        {(!priorAsset || !currentAsset) ? (
          <div className="aspect-[16/9] sm:aspect-[21/9] rounded-xl border border-dashed border-border flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Layers className="w-10 h-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-semibold text-foreground">
              No matching photo pair found for {selectedRoomCategory.replace("_", " ")} in the selected inspections.
            </p>
            <p className="text-xs mt-1">
              Please choose a different room or inspection date above.
            </p>
          </div>
        ) : (
          /* Viewport: Slider vs Side-by-Side */
          viewMode === "slider" ? (
            /* Interactive Split Slider Container */
            <div className="relative aspect-[16/9] sm:aspect-[21/9] rounded-xl overflow-hidden bg-black select-none border border-border shadow-md">
              {/* Background Layer: Current Image */}
              <img
                src={currentAsset.secure_url}
                alt="Current Inspection"
                className={`w-full h-full object-cover ${
                  diffBlend ? "invert filter contrast-150" : ""
                }`}
              />

              {/* Foreground Clipped Layer: Prior Image */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPosition}%` }}
              >
                <img
                  src={priorAsset.secure_url}
                  alt="Prior Inspection"
                  className="absolute inset-0 w-full h-full object-cover max-w-none"
                  style={{ width: "100%", height: "100%" }}
                />
                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                  Prior ({new Date(priorInspection!.captured_at).getFullYear()})
                </div>
              </div>

              {/* Current Image Overlay Badge */}
              <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded shadow pointer-events-none">
                Current ({new Date(currentInspection!.captured_at).getFullYear()})
              </div>

              {/* Divider Handle */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-2xl flex items-center justify-center pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="w-7 h-7 rounded-full bg-white text-black shadow-lg flex items-center justify-center text-[10px] font-bold">
                  &harr;
                </div>
              </div>

              {/* Native transparent range input for full responsiveness & touch support */}
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPosition}
                onChange={(e) => setSliderPosition(Number(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-20"
              />
            </div>
          ) : (
            /* Side-by-Side Dual View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black border border-border">
                <img
                  src={priorAsset.secure_url}
                  alt="Baseline Prior Capture"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-black/80 text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                  Prior ({new Date(priorInspection!.captured_at).getFullYear()})
                </div>
              </div>

              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black border border-border">
                <img
                  src={currentAsset.secure_url}
                  alt="Current Capture"
                  className={`w-full h-full object-cover ${
                    diffBlend ? "mix-blend-difference" : ""
                  }`}
                />
                <div className="absolute top-3 left-3 bg-black/80 text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                  Current ({new Date(currentInspection!.captured_at).getFullYear()})
                </div>
              </div>
            </div>
          )
        )}

        {/* Action Button: AI Difference Analysis */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent shrink-0" />
            <span>{APP_COPY.ai.comparisonDisclaimer}</span>
          </div>

          <button
            onClick={handleAnalyzeDifferences}
            disabled={isAnalyzing || !priorAsset || !currentAsset}
            className="w-full sm:w-auto px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running VLM Visual Comparison...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analyze Visible Differences (VLM)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* AI Difference Analysis Results Card */}
      {comparisonResult && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Visual Comparison Summary
            </div>
            <span className="text-[10px] bg-accent/15 text-accent font-bold px-2.5 py-0.5 rounded-full">
              Assistive Analysis Only
            </span>
          </div>

          <p className="text-xs text-foreground leading-relaxed font-medium">
            {comparisonResult.summary}
          </p>

          {/* Visible Changes List */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Noted Visual Variations:
            </span>
            <div className="space-y-2">
              {comparisonResult.changes.map((change: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-secondary/60 rounded-lg p-3 text-xs border border-border flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span className="text-muted-foreground">{change.description}</span>
                  </div>
                  <span className="text-[10px] font-mono text-primary shrink-0">
                    {Math.round(change.confidence * 100)}% conf
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Caveats */}
          {comparisonResult.caveats?.length > 0 && (
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/60 text-[11px] text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground">Inspection Caveats:</span>
              <ul className="list-disc pl-4 space-y-0.5">
                {comparisonResult.caveats.map((c: string, i: number) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

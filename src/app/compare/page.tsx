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
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

interface ComparisonAsset {
  id: string;
  room: string;
  inspectionType: string;
  year: string;
  url: string;
  description: string;
}

const SAMPLE_COMPARISONS: Record<string, { prior: ComparisonAsset; current: ComparisonAsset }> = {
  kitchen: {
    prior: {
      id: "asset-01",
      room: "kitchen",
      inspectionType: "Move-In Baseline",
      year: "2024",
      url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
      description: "Baseline: Minor surface scratch recorded on lower cabinet finish.",
    },
    current: {
      id: "asset-03",
      room: "kitchen",
      inspectionType: "Move-Out Review",
      year: "2026",
      url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
      description: "Current: Existing baseline scratch observed with consistent surface area.",
    },
  },
  bathroom: {
    prior: {
      id: "asset-02",
      room: "bathroom",
      inspectionType: "Move-In Baseline",
      year: "2024",
      url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      description: "Baseline: Visible grout discoloration noted on shower wall.",
    },
    current: {
      id: "asset-04",
      room: "bathroom",
      inspectionType: "Move-Out Review",
      year: "2026",
      url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      description: "Current: Grout line discoloration reviewed with minimal shift.",
    },
  },
};

export default function ComparePage() {
  const [selectedRoom, setSelectedRoom] = useState<string>("kitchen");
  const [viewMode, setViewMode] = useState<"slider" | "sideBySide">("slider");
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [diffBlend, setDiffBlend] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);

  const pair = SAMPLE_COMPARISONS[selectedRoom] || SAMPLE_COMPARISONS.kitchen;

  const handleAnalyzeDifferences = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prior_asset_id: pair.prior.id,
          current_asset_id: pair.current.id,
          property_id: "prop-381",
          room_id: `room-${selectedRoom}`,
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
            Compare baseline move-in captures against periodic inspections and move-out records.
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

      {/* Room Selector Pills */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Select Room:</span>
        {["kitchen", "bathroom"].map((r) => (
          <button
            key={r}
            onClick={() => {
              setSelectedRoom(r);
              setComparisonResult(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
              selectedRoom === r
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Comparison Viewport */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        {/* Sub-header labels */}
        <div className="flex items-center justify-between text-xs font-semibold text-foreground px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Prior: {pair.prior.inspectionType} ({pair.prior.year})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span>Current: {pair.current.inspectionType} ({pair.current.year})</span>
          </div>
        </div>

        {/* Viewport: Slider vs Side-by-Side */}
        {viewMode === "slider" ? (
          /* Interactive Split Slider Container */
          <div className="relative aspect-[16/9] sm:aspect-[21/9] rounded-xl overflow-hidden bg-black select-none border border-border shadow-md">
            {/* Background Layer: Current Image */}
            <img
              src={pair.current.url}
              alt="Current Inspection"
              className={`w-full h-full object-cover ${diffBlend ? "invert filter contrast-150" : ""}`}
            />

            {/* Foreground Clipped Layer: Prior Image */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={pair.prior.url}
                alt="Prior Inspection"
                className="absolute inset-0 w-full h-full object-cover max-w-none"
                style={{ width: "100%", height: "100%" }}
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                Baseline {pair.prior.year}
              </div>
            </div>

            {/* Current Image Overlay Badge */}
            <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded shadow pointer-events-none">
              Current {pair.current.year}
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
                src={pair.prior.url}
                alt="Baseline Prior Capture"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-black/80 text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                Baseline ({pair.prior.year})
              </div>
            </div>

            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black border border-border">
              <img
                src={pair.current.url}
                alt="Current Capture"
                className={`w-full h-full object-cover ${diffBlend ? "mix-blend-difference" : ""}`}
              />
              <div className="absolute top-3 left-3 bg-black/80 text-white text-xs font-semibold px-2.5 py-1 rounded shadow">
                Current ({pair.current.year})
              </div>
            </div>
          </div>
        )}

        {/* Action Button: AI Difference Analysis */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent shrink-0" />
            <span>{APP_COPY.ai.comparisonDisclaimer}</span>
          </div>

          <button
            onClick={handleAnalyzeDifferences}
            disabled={isAnalyzing}
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

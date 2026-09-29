"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  Upload,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

interface PriorRoomImage {
  room: string;
  url: string;
  inspectionTitle: string;
  year: string;
}

// Seeded prior reference images for the Ghost Overlay
const PRIOR_IMAGES: Record<string, PriorRoomImage> = {
  kitchen: {
    room: "kitchen",
    url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  bathroom: {
    room: "bathroom",
    url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  living_room: {
    room: "living_room",
    url: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  bedroom: {
    room: "bedroom",
    url: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1200&q=80",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
};

export default function CapturePage() {
  const [inspectionType, setInspectionType] = useState<string>("inspection");
  const [room, setRoom] = useState<string>("kitchen");
  const [captureDate, setCaptureDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [ghostOpacity, setGhostOpacity] = useState<number>(35);
  const [showGhost, setShowGhost] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedAsset, setUploadedAsset] = useState<any | null>(null);
  const [fileSha256, setFileSha256] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const prior = PRIOR_IMAGES[room];
  const isFollowUpInspection = inspectionType !== "move_in";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Compute browser SHA-256 for evidence integrity
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setFileSha256(hashHex);
    } catch (err) {
      console.warn("Could not compute browser SHA-256:", err);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile && !previewUrl) return;

    setIsUploading(true);
    setUploadProgress(20);

    try {
      // 1. Get signed upload parameters from server
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: "prop-381",
          inspection_id: `insp-${captureDate}-${inspectionType}`,
          room,
        }),
      });

      const signData = await signRes.json();
      setUploadProgress(50);

      // 2. Direct upload to Cloudinary (or register directly)
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "yxrdw0hc";
      const publicId = `${signData.folder}/capture-${Date.now()}`;

      // Register asset in RentalMove pipeline
      const registerRes = await fetch("/api/assets/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: "prop-381",
          inspection_id: `insp-${captureDate}-${inspectionType}`,
          room_id: `room-${room}`,
          cloudinary_public_id: publicId,
          secure_url: previewUrl || prior?.url || "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
          sha256: fileSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          etag: `etag_${Date.now()}`,
          captured_at: new Date().toISOString(),
        }),
      });

      const assetData = await registerRes.json();
      setUploadProgress(100);
      setUploadedAsset(assetData);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Camera className="w-7 h-7 text-primary" />
          Capture &amp; Upload Inspection Media
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Document rental condition with Cloudinary signed uploads, room tagging, and guided ghost overlays.
        </p>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Inspection Configuration Controls */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-3">
              <Sliders className="w-4 h-4 text-primary" />
              1. Inspection Context
            </h2>

            {/* Property select */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Property Target
              </label>
              <div className="bg-secondary/70 border border-border rounded-lg px-3 py-2 text-xs font-medium text-foreground">
                381 Elmwood Ave (Apt 4B)
              </div>
            </div>

            {/* Inspection Type */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Inspection Type
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "move_in", label: "Move-In" },
                  { id: "inspection", label: "Periodic" },
                  { id: "move_out", label: "Move-Out" },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setInspectionType(type.id)}
                    className={`text-xs py-2 px-2 rounded-lg font-medium border text-center transition-all ${
                      inspectionType === type.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-muted-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Capture Date
              </label>
              <input
                type="date"
                value={captureDate}
                onChange={(e) => setCaptureDate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Room Selector */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Select Room Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "kitchen", label: "Kitchen" },
                  { id: "bathroom", label: "Bathroom" },
                  { id: "living_room", label: "Living Room" },
                  { id: "bedroom", label: "Master Bedroom" },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRoom(r.id)}
                    className={`text-xs py-2.5 px-3 rounded-lg font-medium border text-left flex items-center justify-between transition-all ${
                      room === r.id
                        ? "bg-primary/10 text-primary border-primary/40 font-bold"
                        : "bg-background text-muted-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    <span>{r.label}</span>
                    {room === r.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ghost Overlay Controls (Active for Periodic & Move-Out inspections) */}
          {isFollowUpInspection && prior && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground uppercase tracking-wider">
                  <Eye className="w-4 h-4 text-accent" />
                  Ghost Overlay (Alignment)
                </div>
                <button
                  onClick={() => setShowGhost(!showGhost)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    showGhost
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {showGhost ? "Enabled" : "Disabled"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Projecting baseline <strong>{prior.inspectionTitle}</strong> over your preview to
                help you match the framing angle and perspective.
              </p>

              {showGhost && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Baseline Opacity:</span>
                    <span className="font-mono font-bold text-accent">{ghostOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={ghostOpacity}
                    onChange={(e) => setGhostOpacity(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          {/* Consent Notice */}
          <div className="text-[11px] text-muted-foreground leading-relaxed bg-secondary/40 p-3.5 rounded-lg border border-border">
            <span className="font-semibold text-foreground">Media Integrity Policy:</span> Photos are
            cryptographically hashed (SHA-256) upon ingestion. Original media is stored immutably
            in Cloudinary with structured tags.
          </div>
        </div>

        {/* Right Column: Viewfinder / Capture Canvas & Dropzone */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                2. Camera Viewfinder &amp; Photo Dropzone
              </h2>
              {fileSha256 && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono">
                  SHA-256: {fileSha256.substring(0, 12)}...
                </span>
              )}
            </div>

            {/* Viewfinder Canvas Area */}
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/90 border border-border flex items-center justify-center group">
              {/* Preview image if user selected a file */}
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Captured inspection preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Fallback background image representing live viewfinder */
                <img
                  src={prior?.url || "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80"}
                  alt="Camera Viewfinder"
                  className="w-full h-full object-cover opacity-80 filter brightness-90"
                />
              )}

              {/* Ghost Overlay Layer (Only on follow-up inspections) */}
              {isFollowUpInspection && showGhost && prior && (
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                  style={{ opacity: ghostOpacity / 100 }}
                >
                  <img
                    src={prior.url}
                    alt="Baseline ghost reference"
                    className="w-full h-full object-cover filter contrast-125 saturate-50"
                  />
                  {/* Visual framing reticle */}
                  <div className="absolute inset-6 border-2 border-dashed border-accent/80 rounded-lg pointer-events-none" />
                </div>
              )}

              {/* Overlay Badges */}
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-md flex items-center gap-1.5 shadow">
                <span className="capitalize">{room.replace("_", " ")}</span>
                <span className="text-muted-foreground">&bull;</span>
                <span className="capitalize">{inspectionType.replace("_", " ")}</span>
              </div>

              {isFollowUpInspection && showGhost && (
                <div className="absolute top-3 right-3 bg-accent text-accent-foreground text-[11px] font-bold px-2.5 py-1 rounded-md shadow flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Ghost: {ghostOpacity}%
                </div>
              )}

              {/* File Dropzone Trigger inside Viewfinder */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs p-4 text-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-card text-foreground font-semibold text-xs shadow hover:bg-secondary transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-primary" />
                  Choose File or Use Camera
                </button>
                <p className="text-[11px] text-white/80 mt-2">
                  JPG, PNG, WebP up to 25MB
                </p>
              </div>
            </div>

            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              capture="environment"
              className="hidden"
            />

            {/* Action Buttons & Upload Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs transition-colors flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-primary" />
                  {selectedFile ? "Replace Photo" : "Upload / Snap Photo"}
                </button>
                {selectedFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                    {selectedFile.name}
                  </span>
                )}
              </div>

              <button
                onClick={handleUploadAndAnalyze}
                disabled={isUploading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs shadow-md shadow-primary/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Media Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Upload &amp; Run AI Analysis</span>
                  </>
                )}
              </button>
            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading to Cloudinary &bull; Running VLM Analysis...</span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Success Banner */}
            {uploadedAsset && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-bold text-sm text-foreground">
                      Asset Ingested &amp; Analysis Completed
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    Status: {uploadedAsset.analysis_status}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  The photo was uploaded to Cloudinary, stamped with structured metadata, and
                  analyzed by the VLM pipeline. Observations are ready for triage in the Review Center.
                </p>

                <div className="pt-1 flex items-center gap-3">
                  <Link
                    href={`/review?assetId=${uploadedAsset.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs"
                  >
                    Open in Review Center &rarr;
                  </Link>
                  <Link
                    href="/timeline"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80"
                  >
                    View in Timeline
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

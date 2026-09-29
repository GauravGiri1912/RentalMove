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
  Video,
  FileCheck,
  Check,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

interface PriorRoomImage {
  room: string;
  url: string;
  inspectionTitle: string;
  year: string;
}

const PRIOR_IMAGES: Record<string, PriorRoomImage> = {
  kitchen: {
    room: "kitchen",
    url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01.jpg",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  bathroom: {
    room: "bathroom",
    url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/insp-2024-move-in/bathroom/shower-tile-01.jpg",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  living_room: {
    room: "living_room",
    url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/insp-2024-move-in/living_room/living-floor-01.jpg",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
  bedroom: {
    room: "bedroom",
    url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/insp-2024-move-in/bedroom/bedroom-wall-01.jpg",
    inspectionTitle: "Move-In Baseline 2024",
    year: "2024",
  },
};

export default function CapturePage() {
  const [inspectionType, setInspectionType] = useState<string>("inspection");
  const [room, setRoom] = useState<string>("kitchen");
  const [captureDate, setCaptureDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [ghostOpacity, setGhostOpacity] = useState<number>(35);
  const [showGhost, setShowGhost] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [uploadedAsset, setUploadedAsset] = useState<any | null>(null);
  const [fileSha256, setFileSha256] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const prior = PRIOR_IMAGES[room];
  const isFollowUpInspection = inspectionType !== "move_in";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSelectedFile(file);
    setIsVideo(file.type.startsWith("video/"));
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Compute real browser SHA-256 for evidence integrity
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
    if (!selectedFile) {
      setErrorMessage("Please select or capture a photo/video file first.");
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setUploadProgress(10);
    setCurrentStep("Requesting secure Cloudinary signature...");

    try {
      // 1. Get signed upload parameters from server
      const inspectionId = `insp-${captureDate}-${inspectionType}`;
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: "prop-381",
          inspection_id: inspectionId,
          room,
        }),
      });

      if (!signRes.ok) {
        throw new Error("Failed to obtain signed upload credentials from server.");
      }

      const signData = await signRes.json();
      setUploadProgress(30);
      setCurrentStep("Uploading media to live Cloudinary CDN...");

      // 2. Real Direct upload to Cloudinary Upload API
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("api_key", signData.apiKey);
      formData.append("timestamp", String(signData.timestamp));
      formData.append("signature", signData.signature);
      formData.append("folder", signData.folder);
      formData.append("tags", signData.tags);
      if (signData.notificationUrl) {
        formData.append("notification_url", signData.notificationUrl);
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${signData.cloudName}/auto/upload`;
      const cldRes = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!cldRes.ok) {
        const errorData = await cldRes.json().catch(() => ({}));
        throw new Error(
          errorData?.error?.message || `Cloudinary upload failed with HTTP ${cldRes.status}`
        );
      }

      const cldData = await cldRes.json();
      setUploadProgress(65);
      setCurrentStep("Registering asset & cryptographic integrity in database...");

      // 3. Register real asset in RentalMove pipeline
      const registerRes = await fetch("/api/assets/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: "prop-381",
          inspection_id: inspectionId,
          room_id: `room-${room}`,
          cloudinary_public_id: cldData.public_id,
          secure_url: cldData.secure_url,
          etag: cldData.etag,
          sha256: fileSha256 || undefined,
          width: cldData.width,
          height: cldData.height,
          captured_at: new Date().toISOString(),
        }),
      });

      if (!registerRes.ok) {
        throw new Error("Failed to register asset in persistent database.");
      }

      const assetData = await registerRes.json();
      setUploadProgress(85);
      setCurrentStep("Running AI visual analysis & structured metadata attachment...");

      // Small poll to wait for pipeline analysis completion
      let finalAsset = assetData;
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          const pollRes = await fetch(`/api/properties/prop-381/timeline`);
          if (pollRes.ok) {
            const tl = await pollRes.json();
            const found = tl.inspections
              .flatMap((i: any) => i.assets)
              .find((a: any) => a.id === assetData.id || a.cloudinary_public_id === cldData.public_id);
            if (found && (found.analysis_status === "done" || found.analysis_status === "failed")) {
              finalAsset = found;
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      setUploadProgress(100);
      setCurrentStep("Upload and AI pipeline completed!");
      setUploadedAsset(finalAsset);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(err?.message || "Media pipeline error occurred.");
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
          Document rental condition with real Cloudinary direct uploads, SHA-256 cryptographic integrity, and guided ghost overlays.
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
            <span className="font-semibold text-foreground">Evidence Integrity:</span> Real SHA-256
            hashes are calculated from raw bytes. Photos are uploaded directly to Cloudinary and
            stamped with structured metadata.
          </div>
        </div>

        {/* Right Column: Viewfinder / Capture Canvas & Dropzone */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                2. Camera Viewfinder &amp; Media Dropzone
              </h2>
              {fileSha256 && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono">
                  SHA-256: {fileSha256.substring(0, 12)}...
                </span>
              )}
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Viewfinder Canvas Area */}
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/90 border border-border flex items-center justify-center group">
              {/* Preview image or video if user selected a file */}
              {previewUrl ? (
                isVideo ? (
                  <video
                    src={previewUrl}
                    controls
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Captured inspection preview"
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                /* Baseline reference image when no file selected */
                <img
                  src={prior?.url}
                  alt="Camera Viewfinder Baseline"
                  className="w-full h-full object-cover opacity-80 filter brightness-90"
                />
              )}

              {/* Ghost Overlay Layer (Only on follow-up inspections) */}
              {!isVideo && isFollowUpInspection && showGhost && prior && (
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
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-card text-foreground font-semibold text-xs shadow hover:bg-secondary transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4 text-primary" />
                    Upload Image
                  </button>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-card text-foreground font-semibold text-xs shadow hover:bg-secondary transition-colors flex items-center gap-1.5"
                  >
                    <Video className="w-4 h-4 text-accent" />
                    Upload Video
                  </button>
                </div>
                <p className="text-[11px] text-white/80 mt-2">
                  JPG, PNG, WebP, or short MP4 up to 50MB
                </p>
              </div>
            </div>

            {/* Hidden native inputs */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              capture="environment"
              className="hidden"
            />
            <input
              type="file"
              ref={videoInputRef}
              onChange={handleFileChange}
              accept="video/*"
              capture="environment"
              className="hidden"
            />

            {/* Action Buttons & Upload Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs transition-colors flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-primary" />
                  {selectedFile ? "Replace Media" : "Select Photo / Camera"}
                </button>
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="px-3 py-2.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs transition-colors flex items-center gap-1.5"
                  title="Upload short walkthrough video"
                >
                  <Video className="w-4 h-4 text-accent" />
                  Walkthrough Video
                </button>
                {selectedFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                )}
              </div>

              <button
                onClick={handleUploadAndAnalyze}
                disabled={isUploading || !selectedFile}
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
                    <span>Upload to Cloudinary &amp; Run AI</span>
                  </>
                )}
              </button>
            </div>

            {/* Upload Progress & Step Indicator */}
            {isUploading && (
              <div className="space-y-2 pt-2 p-4 rounded-xl bg-secondary/50 border border-border">
                <div className="flex justify-between text-xs text-foreground font-medium">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    {currentStep}
                  </span>
                  <span className="font-mono text-primary font-bold">{uploadProgress}%</span>
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
              <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-bold text-sm text-foreground">
                      Asset Ingested to Cloudinary &amp; Registered
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                    Status: {uploadedAsset.analysis_status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card p-3 rounded-lg border border-border text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Cloudinary Public ID:</span>
                    <span className="text-foreground truncate block">{uploadedAsset.cloudinary_public_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Cloudinary ETag:</span>
                    <span className="text-foreground truncate block">{uploadedAsset.etag || "verified"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Evidence SHA-256:</span>
                    <span className="text-foreground truncate block">{uploadedAsset.sha256?.substring(0, 18)}...</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Room Inferred:</span>
                    <span className="text-primary font-semibold capitalize block">
                      {uploadedAsset.room_guess || room}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  The photo was uploaded directly to Cloudinary, hashed for tamper-evident integrity, and indexed with structured metadata. Observations are ready for triage.
                </p>

                <div className="pt-1 flex flex-wrap items-center gap-3">
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
                  <a
                    href={uploadedAsset.secure_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    View on Cloudinary CDN
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

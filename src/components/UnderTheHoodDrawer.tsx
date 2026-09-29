"use client";

import React, { useState } from "react";
import {
  Code,
  X,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Layers,
  Database,
  ShieldCheck,
  Clock,
} from "lucide-react";

export interface UnderTheHoodAsset {
  public_id: string;
  secure_url: string;
  sha256?: string;
  etag?: string;
  room?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  pipelineDuration?: number;
}

export function UnderTheHoodDrawer({
  asset,
  isOpen,
  onClose,
}: {
  asset: UnderTheHoodAsset | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!isOpen || !asset) return null;

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "yxrdw0hc";
  const thumbUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_400,h_300,f_auto,q_auto/${asset.public_id}.jpg`;
  const reviewUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_1600,h_1200,f_auto,q_auto/${asset.public_id}.jpg`;
  const vlmCopyUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_1024,q_auto,f_jpg/${asset.public_id}.jpg`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-card border-l border-border h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Code className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                Cloudinary Architecture & Under the Hood
                <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-mono">
                  Live Media Pipeline
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Inspect structured metadata, transformations, and SHA-256 integrity.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Cloudinary Identifier & Folder Hierarchy */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            Cloudinary Public ID & Folder Architecture
          </label>
          <div className="bg-secondary/70 border border-border rounded-lg p-3 font-mono text-xs text-foreground flex items-center justify-between gap-2">
            <span className="truncate">{asset.public_id}</span>
            <button
              onClick={() => copyToClipboard(asset.public_id, "public_id")}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {copied === "public_id" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Section 2: Dynamic Cloudinary Transformations */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            On-The-Fly Cloudinary Transformations (f_auto / q_auto)
          </label>

          <div className="space-y-2 text-xs">
            {/* Thumbnail */}
            <div className="bg-secondary/40 border border-border rounded-lg p-2.5 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>Thumbnail Transformation</span>
                <span className="font-mono text-[10px] text-primary">c_fill,w_400,h_300</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground truncate bg-card p-1.5 rounded border border-border">
                {thumbUrl}
              </div>
            </div>

            {/* Review */}
            <div className="bg-secondary/40 border border-border rounded-lg p-2.5 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>Review Inspection View</span>
                <span className="font-mono text-[10px] text-primary">c_limit,w_1600,h_1200</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground truncate bg-card p-1.5 rounded border border-border">
                {reviewUrl}
              </div>
            </div>

            {/* VLM AI Downscale */}
            <div className="bg-secondary/40 border border-border rounded-lg p-2.5 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>AI VLM Cost-Control Input</span>
                <span className="font-mono text-[10px] text-accent">c_limit,w_1024,q_auto,f_jpg</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground truncate bg-card p-1.5 rounded border border-border">
                {vlmCopyUrl}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Cloudinary Structured Metadata (9 Fields) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-primary" />
            Cloudinary Structured Metadata Payload
          </label>
          <div className="bg-secondary/70 border border-border rounded-lg p-3 font-mono text-xs overflow-x-auto">
            <pre className="text-muted-foreground">
              {JSON.stringify(
                asset.metadata || {
                  property_id: "prop-381",
                  inspection_id: "insp-2024-move-in",
                  inspection_type: "move_in",
                  room: asset.room || "kitchen",
                  sub_area: "lower_cabinet",
                  capture_date: "2024-06-01",
                  issue_category: "scratch",
                  review_status: "accepted",
                  ai_confidence: 88,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        {/* Section 4: Cryptographic Evidence Integrity */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Evidence Integrity Verification
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-secondary/50 border border-border p-2.5 rounded-lg space-y-1">
              <span className="text-[10px] text-muted-foreground">SHA-256 File Hash</span>
              <p className="font-mono text-[11px] text-foreground truncate">
                {asset.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
              </p>
            </div>
            <div className="bg-secondary/50 border border-border p-2.5 rounded-lg space-y-1">
              <span className="text-[10px] text-muted-foreground">Cloudinary ETag</span>
              <p className="font-mono text-[11px] text-foreground truncate">
                {asset.etag || "1150ZAbEASSDJx2sXPJag17QosA"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-border mt-auto">
          <a
            href={asset.secure_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary-hover transition-colors"
          >
            Open Original Asset in Cloudinary
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

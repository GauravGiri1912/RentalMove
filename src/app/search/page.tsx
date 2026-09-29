"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Sparkles,
  Image as ImageIcon,
  Calendar,
  Tag,
  ArrowRight,
  RefreshCw,
  Code,
  ShieldCheck,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";

export default function SearchPage() {
  const [nlQuery, setNlQuery] = useState<string>("");
  const [room, setRoom] = useState<string>("");
  const [inspectionType, setInspectionType] = useState<string>("");
  const [issueCategory, setIssueCategory] = useState<string>("");
  const [reviewStatus, setReviewStatus] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);
  const [expression, setExpression] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isNlParsing, setIsNlParsing] = useState<boolean>(false);
  const [isMock, setIsMock] = useState<boolean>(true);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);

  // Load user's property ID from session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || !data.user) return;
        const propId = data.user.assigned_property_id || data.user.owned_properties?.[0];
        if (propId) setActivePropertyId(propId);
      })
      .catch(() => {});
  }, []);

  const sampleNlQueries = [
    "show kitchen cabinet observations from 2024",
    "bathroom stain photos in move in",
    "accepted scratch observations",
  ];

  const performSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (room) params.set("room", room);
      if (inspectionType) params.set("inspection_type", inspectionType);
      if (issueCategory) params.set("issue_category", issueCategory);
      if (reviewStatus) params.set("review_status", reviewStatus);
      if (activePropertyId) params.set("property_id", activePropertyId);
      else { setLoading(false); return; }

      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      setResults(data.resources || []);
      setExpression(data.expression || "");
      setIsMock(data.is_mock ?? true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNlSearch = async (queryText?: string) => {
    const q = queryText || nlQuery;
    if (!q) return;

    setIsNlParsing(true);
    try {
      const res = await fetch("/api/search/nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, property_id: activePropertyId || "" }),
      });

      const data = await res.json();
      if (data.filter) {
        if (data.filter.room) setRoom(data.filter.room);
        if (data.filter.inspection_type) setInspectionType(data.filter.inspection_type);
        if (data.filter.issue_category) setIssueCategory(data.filter.issue_category);
        if (data.filter.review_status) setReviewStatus(data.filter.review_status);
      }
    } catch (err) {
      console.error("NL Search failed:", err);
    } finally {
      setIsNlParsing(false);
    }
  };

  useEffect(() => {
    performSearch();
  }, [room, inspectionType, issueCategory, reviewStatus]);

  const clearFilters = () => {
    setRoom("");
    setInspectionType("");
    setIssueCategory("");
    setReviewStatus("");
    setNlQuery("");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Search className="w-7 h-7 text-primary" />
          Cloudinary Media &amp; Metadata Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search rental condition assets by indexed structured metadata, tags, and natural language.
        </p>
      </div>

      {/* Natural Language AI Search Bar */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          Natural-Language Query (LLM to Validated Filter)
        </label>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., 'show kitchen cabinet observations from 2024' or 'bathroom stains'..."
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNlSearch()}
            className="flex-1 bg-background border border-border rounded-lg px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => handleNlSearch()}
            disabled={isNlParsing}
            className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isNlParsing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Parse Query
          </button>
        </div>

        {/* Suggestion pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          <span className="text-muted-foreground">Try asking:</span>
          {sampleNlQueries.map((sample) => (
            <button
              key={sample}
              onClick={() => {
                setNlQuery(sample);
                handleNlSearch(sample);
              }}
              className="text-[11px] bg-secondary hover:bg-secondary/80 text-foreground px-2.5 py-1 rounded-full border border-border transition-colors"
            >
              &ldquo;{sample}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {/* Cloudinary Expression Preview Box */}
      <div className="bg-secondary/60 border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5 text-primary" />
            Cloudinary Search API Expression (Server-Constructed)
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {isMock ? "Mock Media Provider" : "Live Cloudinary Search API"}
          </span>
        </div>
        <div className="bg-card border border-border p-3 rounded-lg font-mono text-xs text-primary break-all">
          {expression || "Constructing expression..."}
        </div>
      </div>

      {/* Structured Filter Chips */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-foreground">
            <Filter className="w-4 h-4 text-primary" />
            Filter by Cloudinary Structured Metadata
          </div>
          {(room || inspectionType || issueCategory || reviewStatus) && (
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:underline font-semibold"
            >
              Reset all filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Room filter */}
          <div>
            <label className="block text-muted-foreground mb-1 font-medium">Room</label>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Rooms</option>
              <option value="kitchen">Kitchen</option>
              <option value="bathroom">Bathroom</option>
              <option value="living_room">Living Room</option>
              <option value="bedroom">Bedroom</option>
            </select>
          </div>

          {/* Inspection Type */}
          <div>
            <label className="block text-muted-foreground mb-1 font-medium">Inspection Type</label>
            <select
              value={inspectionType}
              onChange={(e) => setInspectionType(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Types</option>
              <option value="move_in">Move-In (Baseline)</option>
              <option value="inspection">Periodic Inspection</option>
              <option value="move_out">Move-Out</option>
            </select>
          </div>

          {/* Issue Category */}
          <div>
            <label className="block text-muted-foreground mb-1 font-medium">Issue Category</label>
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Categories</option>
              <option value="scratch">Scratch</option>
              <option value="stain">Stain</option>
              <option value="crack">Crack</option>
              <option value="dent">Dent</option>
              <option value="mark">Mark</option>
            </select>
          </div>

          {/* Review Status */}
          <div>
            <label className="block text-muted-foreground mb-1 font-medium">Review Status</label>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="edited">Edited</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">
            Search Results ({results.length} assets matched)
          </span>
          {loading && (
            <span className="text-xs text-primary animate-pulse">Querying Cloudinary...</span>
          )}
        </div>

        {results.length === 0 && !loading ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card">
            <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">No media assets match these criteria</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try resetting your filter parameters or trying another room.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {results.map((asset) => (
              <div
                key={asset.public_id}
                className="bg-card border border-border rounded-xl overflow-hidden shadow-xs flex flex-col group hover:border-primary/50 transition-all"
              >
                <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                  <img
                    src={asset.secure_url}
                    alt={asset.public_id}
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded capitalize">
                    {asset.metadata?.room || "Room"}
                  </div>
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
                    Verified
                  </div>
                </div>

                <div className="p-4 space-y-2.5 text-xs">
                  <div className="font-mono text-[11px] text-foreground truncate font-medium">
                    {asset.public_id}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {asset.metadata?.issue_category && (
                      <span className="px-2 py-0.5 rounded bg-secondary text-foreground text-[10px] capitalize">
                        Issue: {asset.metadata.issue_category}
                      </span>
                    )}
                    {asset.metadata?.review_status && (
                      <span className="px-2 py-0.5 rounded bg-accent/15 text-accent text-[10px] capitalize">
                        {asset.metadata.review_status}
                      </span>
                    )}
                    {asset.metadata?.inspection_type && (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] capitalize">
                        {asset.metadata.inspection_type}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{asset.created_at?.split("T")[0]}</span>
                    <a
                      href={asset.secure_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-semibold"
                    >
                      View Full &rarr;
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

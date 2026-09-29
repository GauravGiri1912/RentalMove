import React from "react";
import Link from "next/link";
import { History, Layers, ArrowRight, ShieldCheck, Sparkles, Building } from "lucide-react";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";

export default async function RoomHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room: activeRoom = "kitchen" } = await searchParams;
  const db = getDatabase();
  const media = getMediaProvider();

  const timeline = await db.getTimeline("prop-381");
  const rooms = await db.getRooms("prop-381");

  // Filter assets that match activeRoom
  const matchingAssets = timeline.inspections.flatMap((insp) =>
    insp.assets
      .filter((asset) => asset.room.category === activeRoom || asset.room_guess === activeRoom)
      .map((asset) => ({
        ...asset,
        inspectionType: insp.type,
        inspectionDate: insp.captured_at,
      }))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <History className="w-7 h-7 text-primary" />
            Room History Gallery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track visual condition changes room-by-room across all inspection dates.
          </p>
        </div>

        <Link
          href={`/compare?room=${activeRoom}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-xs transition-colors"
        >
          <Layers className="w-4 h-4" />
          Compare This Room &rarr;
        </Link>
      </div>

      {/* Room Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border">
        {rooms.map((r) => {
          const isActive = r.category === activeRoom;
          return (
            <Link
              key={r.id}
              href={`/rooms?room=${r.category}`}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
            >
              {r.name}
            </Link>
          );
        })}
      </div>

      {/* Longitudinal Room Photo Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {matchingAssets.length} capture{matchingAssets.length !== 1 ? "s" : ""} for{" "}
            <strong className="text-foreground capitalize">{activeRoom.replace("_", " ")}</strong>
          </span>
          <span>Ordered chronologically (Baseline &rarr; Present)</span>
        </div>

        {matchingAssets.length === 0 ? (
          <div className="text-center py-16 bg-card border border-dashed border-border rounded-xl">
            <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">No photos recorded for this room</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a new inspection capture to record this room.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matchingAssets.map((asset, idx) => (
              <div
                key={asset.id}
                className="bg-card border border-border rounded-xl overflow-hidden shadow-xs flex flex-col group hover:border-primary/50 transition-all"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                  <img
                    src={media.review(asset.secure_url)}
                    alt={`${activeRoom} capture`}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded capitalize">
                    {asset.inspectionType.replace("_", " ")} (
                    {new Date(asset.inspectionDate).getFullYear()})
                  </div>
                  <div className="absolute top-2 right-2 bg-accent/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
                    Step {idx + 1}
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {new Date(asset.inspectionDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="font-mono text-[10px]">
                        SHA: {asset.sha256?.substring(0, 8)}...
                      </span>
                    </div>

                    {asset.observations.length > 0 ? (
                      <div className="bg-secondary/60 rounded p-2.5 space-y-1 border border-border">
                        <div className="font-semibold text-foreground capitalize flex items-center justify-between">
                          <span>
                            {asset.observations[0].category} ({asset.observations[0].sub_area})
                          </span>
                          <span className="text-[10px] text-accent font-bold">
                            {asset.observations[0].review_status}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {asset.observations[0].description}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-[11px]">
                        Clean baseline condition recorded.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                    <Link
                      href={`/review?assetId=${asset.id}`}
                      className="text-primary hover:underline font-semibold"
                    >
                      Review Observation &rarr;
                    </Link>
                    <Link
                      href={`/compare?room=${activeRoom}`}
                      className="text-muted-foreground hover:text-foreground font-medium"
                    >
                      Compare view &rarr;
                    </Link>
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

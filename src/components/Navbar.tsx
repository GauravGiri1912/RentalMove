"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Camera,
  Layers,
  Clock,
  Search,
  ShieldCheck,
  UserCheck,
  Building,
  CheckSquare,
  History,
  FileText,
  Code,
  LogOut,
  LogIn,
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";
import { UnderTheHoodDrawer, UnderTheHoodAsset } from "./UnderTheHoodDrawer";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "tenant" | "owner";
  assigned_property_id?: string;
  owned_properties?: string[];
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeAsset, setActiveAsset] = useState<UnderTheHoodAsset | null>(null);
  const [availableAssets, setAvailableAssets] = useState<UnderTheHoodAsset[]>([]);

  useEffect(() => {
    // Load authenticated user from session
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          // Load timeline assets for Under the Hood drawer
          const propertyId =
            data.user.assigned_property_id ||
            data.user.owned_properties?.[0];
          if (propertyId) {
            loadTimelineAssets(propertyId);
          }
        }
      })
      .catch((err) => console.warn("Failed to load session:", err));
  }, []);

  async function loadTimelineAssets(propertyId: string) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/timeline`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.inspections) {
        const assets: UnderTheHoodAsset[] = data.inspections.flatMap((i: any) =>
          i.assets.map((a: any) => ({
            public_id: a.cloudinary_public_id,
            secure_url: a.secure_url,
            sha256: a.sha256,
            etag: a.etag,
            room: a.room?.name || a.room_guess || "Kitchen",
            metadata: {
              property_id: propertyId,
              inspection_id: a.inspection_id,
              inspection_type: i.type,
              room: a.room?.category || "kitchen",
              sub_area: a.observations?.[0]?.sub_area || "general",
              capture_date: i.captured_at?.split("T")[0] || "",
              issue_category: a.observations?.[0]?.category || "none",
              review_status: a.observations?.[0]?.review_status || "accepted",
              ai_confidence: a.observations?.[0]
                ? Math.round(a.observations[0].confidence * 100)
                : 90,
            },
            tags: [
              "rentalmove",
              `room:${a.room?.category || "kitchen"}`,
              `insp:${i.type}`,
            ],
          }))
        );
        setAvailableAssets(assets);
        if (assets.length > 0) setActiveAsset(assets[0]);
      }
    } catch (err) {
      console.warn("Could not load timeline assets for drawer:", err);
    }
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Sign out failed:", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const navLinks = [
    { href: "/", label: "Dashboard", icon: Building },
    { href: "/capture", label: "Capture", icon: Camera },
    { href: "/review", label: "Review Center", icon: CheckSquare },
    { href: "/timeline", label: "Timeline", icon: Clock },
    { href: "/rooms", label: "Room History", icon: History },
    { href: "/compare", label: "Compare", icon: Layers },
    { href: "/search", label: "Search", icon: Search },
    { href: "/report", label: "Report", icon: FileText },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                <Camera className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg tracking-tight text-foreground">
                    {APP_COPY.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold uppercase tracking-wider">
                    Cloudinary AI
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground hidden sm:block">
                  Visual Property Memory
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          {user && (
            <nav className="hidden lg:flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? "text-primary font-semibold bg-primary/10"
                        : "hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Actions */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <>
                {/* Under the Hood Drawer Trigger */}
                <button
                  id="under-the-hood-btn"
                  onClick={() => setIsDrawerOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 text-foreground hover:bg-secondary transition-colors"
                  title="Inspect real Cloudinary API calls and metadata"
                >
                  <Code className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium">Under the Hood</span>
                </button>

                {/* User identity + Sign out */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-xs font-semibold text-foreground leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {user.role === "owner" ? "Property Owner" : "Tenant"}
                    </span>
                  </div>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      user.role === "owner"
                        ? "bg-accent/20 text-accent"
                        : "bg-primary/20 text-primary"
                    }`}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <button
                    id="signout-btn"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </div>
              </>
            ) : (
              <Link
                id="login-nav-btn"
                href="/login"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Navigation Sub-bar (only when authenticated) */}
        {user && (
          <div className="lg:hidden flex items-center gap-1 px-4 py-2 border-t border-border/50 overflow-x-auto text-xs bg-secondary/30 scrollbar-none">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap flex items-center gap-1 ${
                    isActive
                      ? "text-primary font-semibold bg-card shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Global Dynamic Under the Hood Drawer */}
      <UnderTheHoodDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        asset={activeAsset}
        availableAssets={availableAssets}
        onSelectAsset={(a) => setActiveAsset(a)}
      />
    </>
  );
}

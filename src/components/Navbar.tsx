"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { APP_COPY } from "@/lib/copy";
import { UnderTheHoodDrawer } from "./UnderTheHoodDrawer";

export function Navbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<"tenant" | "manager">("tenant");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("rentalmove_role");
    if (saved === "tenant" || saved === "manager") {
      setRole(saved);
    }
  }, []);

  const toggleRole = () => {
    const next = role === "tenant" ? "manager" : "tenant";
    setRole(next);
    localStorage.setItem("rentalmove_role", next);
    document.cookie = `rentalmove_role=${next}; path=/; max-age=31536000`;
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

          {/* Right Actions */}
          <div className="flex items-center gap-2.5">
            {/* Under the Hood Drawer Trigger */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 text-foreground hover:bg-secondary transition-colors"
              title="Inspect Cloudinary API calls and metadata"
            >
              <Code className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">Under the Hood</span>
            </button>

            {/* Persona Switcher */}
            <button
              onClick={toggleRole}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-all shadow-sm active:scale-95"
              title="Toggle Tenant or Property Manager view"
            >
              {role === "tenant" ? (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Tenant Mode</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  <span>Manager Mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Sub-bar */}
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
      </header>

      {/* Global Under the Hood Drawer */}
      <UnderTheHoodDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        asset={{
          public_id: "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01",
          secure_url:
            "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01.jpg",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          etag: "1150ZAbEASSDJx2sXPJag17QosA",
          room: "kitchen",
          tags: ["rentalmove", "room:kitchen", "insp:move_in"],
          metadata: {
            property_id: "prop-381",
            inspection_id: "insp-2024-move-in",
            inspection_type: "move_in",
            room: "kitchen",
            sub_area: "lower_cabinet",
            capture_date: "2024-06-01",
            issue_category: "scratch",
            review_status: "accepted",
            ai_confidence: 88,
          },
        }}
      />
    </>
  );
}

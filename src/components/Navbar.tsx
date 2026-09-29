"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Camera, Layers, Clock, Search, ShieldCheck, UserCheck, Building } from "lucide-react";
import { APP_COPY } from "@/lib/copy";

export function Navbar() {
  const [role, setRole] = useState<"tenant" | "manager">("tenant");

  useEffect(() => {
    // Read role cookie or localStorage
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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-foreground">
                {APP_COPY.name}
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                Cloudinary AI
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
            >
              <Clock className="w-4 h-4" />
              Timeline
            </Link>
            <Link
              href="/search"
              className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              Search
            </Link>
            <Link
              href="/compare"
              className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
            >
              <Layers className="w-4 h-4" />
              Compare
            </Link>
          </nav>
        </div>

        {/* Right Actions: Demo Role Switcher & Property Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-md border border-border">
            <Building className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground">#381 Elmwood Ave</span>
            <span className="text-muted-foreground">(Apt 4B)</span>
          </div>

          {/* Role Switcher */}
          <button
            onClick={toggleRole}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-all shadow-sm active:scale-95"
            title="Switch demo persona between Tenant and Property Manager"
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
    </header>
  );
}

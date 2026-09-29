import React from "react";
import { Shield, Sparkles } from "lucide-react";
import { APP_COPY } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{APP_COPY.name}</span>
            <span>&bull;</span>
            <span>{APP_COPY.tagline}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-primary font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              {APP_COPY.footer.poweredBy}
            </span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-accent" />
              Assistive AI Observations Only
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 text-[11px] text-muted-foreground/80 leading-relaxed text-center sm:text-left">
          {APP_COPY.ai.disclaimerBanner}
        </div>
      </div>
    </footer>
  );
}

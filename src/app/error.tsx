"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * error.tsx — Route-level error boundary.
 * Catches errors thrown in page components and Server Components.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PageError]", error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 mx-auto flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This page encountered an unexpected error. You can try refreshing it or go back to the dashboard.
        </p>
        {process.env.NODE_ENV === "development" && error.message && (
          <pre className="mt-2 text-left text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3 overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Reference: {error.digest}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}

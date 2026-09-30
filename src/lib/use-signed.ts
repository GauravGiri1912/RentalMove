"use client";

import { useEffect, useState } from "react";
import type { Recipe } from "./recipes";

/**
 * Signed Cloudinary URLs for dynamic recipes, from POST /api/media/sign. Debounced and batched
 * (one request for all items). Returns null while loading.
 */
export function useSignedUrls(items: { asset_id: string; recipe: Recipe }[] | null, delayMs = 150) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = items ? JSON.stringify(items) : "";
  useEffect(() => {
    if (!items || !items.length) { setUrls(null); return; }
    let live = true;
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/media/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.message || b.error || `Signing failed (${r.status})`);
        if (live) setUrls(b.urls);
      } catch (e: any) {
        if (live) { setError(e?.message || String(e)); setUrls(null); }
      }
    }, delayMs);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);
  return { urls, error };
}

# RentalMove — Implementation Status

This file states what has actually been checked, how, and what has not. "Verified" means it was
executed against the real service or database, not merely type-checked.

## How things were checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` (production) | succeeds |
| `OFFLINE_TESTS=1 npx vitest run` (mock vision, no Groq calls) | 44 / 44 pass |
| `npx vitest run` (live Cloudinary + live Groq) | 43 / 44 pass. The one failure is the live vision test, blocked by Groq's daily token limit when it was run (see "Known limits"). It passed in an earlier live run. |

The acceptance tests now use an **isolated temp store** (never Supabase) and **really upload** a
photo to Cloudinary, hash it, register it, verify it through the Admin API, then delete it.
Live tests fail (not skip) when credentials are missing.

## Verified against live services

| Area | What was verified |
|---|---|
| Cloudinary renditions | thumbnail, face-pixelate, matched crop (`g_auto`, `e_auto_brightness`, `e_auto_contrast`), 2x2 tile crop and drawn-evidence URLs all return HTTP 200 images. The evidence image (box + label drawn by Cloudinary) and a tile crop were inspected visually. The pixelate URL works; the demo photos contain no faces, so the blur itself has not been seen on a face. |
| Tag sync | `syncManagedTags` adds/removes `issue:*`, plain issue tags and `review:*` on real assets; `scripts/sync-tags.ts` brought all 8 demo assets in line with the database. |
| Cloudinary search | room, issue, review-status and combined filters return counts that match the database (e.g. 7 pending, 0 accepted, 3 stain). Values containing `:` must be quoted (`tags:"review:pending"`); the unquoted form was a real bug and is fixed. |
| Date search | uses the stored capture date: 2024 → 4 photos, 2025 → 2, 2026 → 2 (previously 0, because it used the upload date). |
| Supabase (strict mode) | the app reads properties, inspections, assets and observations from the live project with no local fallback; the public share report renders 3 inspections, 8 photos and 14 findings, all labelled "AI finding, not yet reviewed". |
| Upload webhook | unsigned → 401, bad signature → 401, validly signed request for an unknown property → ignored. A full upload → webhook → analysis round trip was **not** run (needs a public URL). |
| Groq vision | a real analysis of a seed photo returned a valid, filtered result in ~1.5 s (earlier in this work); model name `qwen/qwen3.8-27b` confirmed available on the account. |

## What changed and why

1. **Tests never uploaded anything** — media config only read `.env.local` while keys live in `.env`, so the live branch was skipped. Both files are read now and live tests fail when keys are missing.
2. **Seed findings were hand-written / cached** — the seed script now calls the real model and stops on failure (no cached findings, no fabricated comparison). Findings are stored `pending`; the previous seed had marked them "accepted by the owner" with invented reviewer notes, which `scripts/clean-demo-data.mjs` removed.
3. **Failed analysis stored a fake finding** — the provider now retries with backoff and then raises `VisionError`; the pipeline marks the asset `failed` with the reason. No placeholder observation is ever stored. With no key configured (and `VISION_PROVIDER` not `mock`) the app no longer silently returns canned "scratch" results.
4. **New uploads not searchable by issue** — after analysis and after every review the asset's tags are synced from the database.
5. **Year search returned nothing** — dates are filtered on the stored capture date.
6. **Hosting** — the JSON store no longer crashes on a read-only file system (falls back to the temp dir), Supabase is the single source of truth by default (`ENABLE_LOCAL_FALLBACK=true` restores the old behaviour), real Supabase errors are raised instead of looking like empty pages, analysis is scheduled with `after()`, stalled analyses are re-queued, and duplicate concurrent analysis of one photo is prevented.
7. **Test junk** — Supabase went from 22 test properties / 28 inspections / 27 share links to the canonical demo set (1 property, 3 inspections, 8 photos, 1 share link).
8. **Smaller issues** — comparison confidence is the mean of the model's own per-change scores (empty when there are no changes) instead of a constant; the Gemini provider was removed; observations pass a hallucination filter (whole-photo boxes, "no damage" statements, low confidence, duplicates); the webhook now requires a valid signature and an existing property/inspection; documentation and UI copy no longer claim "tamper-evident", "immutable" or "cryptographic audit stamps". A SHA-256 fingerprint and the Cloudinary ETag reveal later changes to a file; they are not legal proof.
9. **Cloudinary as the pipeline** — matched comparison crops (same crop + exposure for both photos, optional 2x2 tiles), evidence images with boxes/labels drawn by Cloudinary, face pixelation on shared reports, and an upload webhook.

## Known limits

- **Groq free tier: 200,000 tokens/day** for this model (~2.5k tokens per photo analysis, ~5k per matched comparison, ~4x for a tiled one). The daily limit was reached during this work, so live model calls are unavailable until it resets. Analysis then fails cleanly; retry later with `POST /api/assets/:id/analyze`.
- **The demo findings are not yet regenerated.** The 14 stored findings predate the fixed seed script and their origin cannot be confirmed; they are now marked `pending`. Regenerate them with `npx tsx scripts/seed-demo-assets.ts` once quota is available (about 9 photo analyses plus one comparison). The stored comparison list is empty until a comparison is run.
- **Not run:** the tiled comparison and the matched two-photo comparison against the live model, the seed script after its rewrite, a real-photo face-pixelation check, and a browser click-through with a logged-in account.
- **Latency:** every Supabase query costs ~230 ms round trip from the current region; moving the project closer removes most of the remaining delay (`scripts/migrate-supabase-region.mjs`).
- **Webhook** needs a public HTTPS `CLOUDINARY_NOTIFICATION_URL`; it cannot be reached on `localhost`.

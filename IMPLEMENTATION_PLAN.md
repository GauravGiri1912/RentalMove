# RENTALMOVE — FORENSIC AUDIT REMEDIATION IMPLEMENTATION PLAN

**Created:** September 30, 2026  
**Status:** Active Execution  
**Current Baseline:** 12 test files passed, 84 tests passing, TypeScript 0 errors, Next.js 15 build succeeding. Working tree clean on `main`.

---

## EXECUTION WORKFLOW & RULES

1. **Strictly Sequential:** Each phase is executed one at a time. No parallel or overlapping architectural modifications.
2. **Phase Completion Gate:** For every phase:
   - Make minimal, targeted changes
   - Verify TypeScript (`npx tsc --noEmit`)
   - Run tests (`npm test`)
   - Validate manual acceptance criteria
   - Verify no regressions
   - Update `IMPLEMENTATION_STATUS.md`
   - Git commit
   - Advance to next phase
3. **Hard Stop:** If any regression or failure occurs, STOP, diagnose, fix in place, retest. Never advance past a broken phase.
4. **Secret Protection:** Never log, expose, or commit `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, or `GROQ_API_KEY`.

---

## DEPENDENCY & ORDER MAP

```text
PHASE 0: Baseline & Safety Verification (DONE)
   ↓
PHASE 1: Critical Authorization + IDOR Protection (P0)
   ├── 5.1 Observation Review Owner-Only
   ├── 5.2 Remove prop-381 Fallbacks
   └── 5.3 Signup Isolation
   ↓
PHASE 2: Database / Scoped RLS Architecture (P0)
   ├── RLS Policy Audit & Fix (New Migration)
   └── Scoped Supabase SSR Client Usage
   ↓
PHASE 3: Auth Session & Cloudinary Configuration (P0)
   ├── Signout SSR Cookie Invalidation
   ├── NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME Configuration
   └── Environment Validation
   ↓
PHASE 4: Upload Security + Media Pipeline (P1)
   ├── Signed Upload Parameters (format, size, scoping)
   ├── Client-Side Pre-Scaling (2400px limit)
   └── Rendition-Based Sharp Processing
   ↓
PHASE 5: Present Mode Performance (P1)
   ├── Remove RAF setState Loop (Direct DOM / Coalesced)
   ├── Remove document.body.innerText Polling
   ├── Replace 9999px Box Shadow Overlay
   ├── Reduce Blur & Coalesce Elapsed Timer
   └── Respect prefers-reduced-motion
   ↓
PHASE 6: Theme & Accessibility (P1)
   ├── Semantic Presentation Tokens
   ├── Light/Dark Mode Contrast Fixes
   └── WCAG AA Compliance
   ↓
PHASE 7: Startup Performance (P1)
   ├── Layout Server Component Hydration
   ├── Prevent Duplicate Client Fetches
   └── Hero Autoplay / Lazy Loading
   ↓
PHASE 8: Database & API Query Optimization (P2)
   ├── Migration: assets(sha256) Index
   ├── Direct Indexed /api/verify Lookup
   └── Search N+1 Asset Query Batching
   ↓
PHASE 9: State Management & Realtime Cleanup (P2)
   ├── Consolidate Realtime Transport
   ├── Targeted Mutation Reconciliation
   └── Singleton State Cleanup
   ↓
PHASE 10: Reliability, Rate Limiting & AI Handling (P1/P2)
   ├── Groq Quota Backoff & States
   ├── Vision Provider Abstraction Integrity
   ├── Grounded Ask RentalMove Contract
   └── Rate Limit Abstraction
   ↓
PHASE 11: Maintainability, Dead Code & Code Quality (P2)
   ├── Deprecate/Consolidate Duplicate /api/report Route
   ├── Lint Suppression Audit
   └── Shell Component Decoupling
   ↓
PHASE 12: Product Capability Corrections (P3)
   ├── Data-Driven Floor Plan Configuration
   ├── Centralized Pixel Matching Thresholds
   └── Presentation & Media Wording Accuracy
   ↓
PHASE 13: Observability & Logging (P3)
   ├── Structured Safe Logging
   └── Request Correlation
   ↓
PHASE 14: Full Regression & Security Verification
```

---

## DETAILED PHASE SPECIFICATIONS

### PHASE 0 — Baseline & Safety Verification
- **Objective:** Establish clean baseline metrics, verify builds, tests, type integrity, and record git status.
- **Affected Files:** `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`
- **Dependencies:** None.
- **Baseline Metrics Recorded:**
  - Branch: `main`
  - Git status: clean
  - TypeScript: 0 errors (`npx tsc --noEmit` exited 0)
  - Unit/Integration Tests: 12 test files, 84 tests passing, 0 failing
  - Production build: succeeded (`npm run build` compiled 36 routes)
- **Acceptance Criteria:** Baseline recorded and documented before any production logic changes.

---

### PHASE 1 — Critical Authorization + IDOR Protection
- **Objective:** Ensure finding reviews (accept/reject/edit) are strictly restricted to authenticated owners of the observation's property. Remove all hardcoded `"prop-381"` fallbacks from authentication, user profiles, and signup routes.
- **Affected Files:**
  - `src/app/api/observations/[id]/route.ts`
  - `src/lib/auth.ts`
  - `src/app/api/auth/signup/route.ts`
  - `tests/idor-auth.test.ts` (new dedicated test suite)
- **Dependencies:** Phase 0.
- **Exact Changes:**
  1. In `src/app/api/observations/[id]/route.ts`:
     - Inspect `user.role === "owner"`. If tenant or non-owner, immediately return `403 Forbidden`.
     - Verify owner has access to the property via `canUserAccessProperty(user, found.propertyId)`.
     - Reject unauthorized observation status mutations (accepted, rejected, edited, notes) with `403`.
  2. In `src/lib/auth.ts`:
     - In `getSessionUser`, remove lines 201 and 208 fallback assigning `"prop-381"`.
     - For tenants without assignment: `assigned_property_id = undefined`.
     - For owners without properties: `owned_properties = []`.
  3. In `src/app/api/auth/signup/route.ts`:
     - Remove automatic insertion of new tenants into `property_tenants` with `property_id: "prop-381"`.
  4. Create `tests/idor-auth.test.ts`:
     - Test: Tenant cannot PATCH `/api/observations/[id]` (returns 403).
     - Test: Tenant A cannot access Owner B's property findings.
     - Test: Owner A cannot review findings on Owner B's property.
     - Test: Unassigned user does not inherit `"prop-381"`.
- **Migration Requirements:** None (logic level).
- **Rollback Strategy:** Revert git changes on affected files.
- **Acceptance Criteria:**
  - Tenant mutation attempts return HTTP 403.
  - New tenants have `assigned_property_id = undefined`.
  - Authorized owners can still review observations.
  - All existing 84 tests + new IDOR tests pass.

---

### PHASE 2 — Database / Scoped RLS Architecture
- **Objective:** Shift client/route operations to scoped authenticated Supabase client using user JWT, tighten RLS policies so normal user queries fail closed, and isolate service-role usage exclusively to background jobs/webhooks.
- **Affected Files:**
  - `supabase/migrations/0004_tighten_rls_and_sha_index.sql` (new migration)
  - `src/lib/supabase-db.ts`
  - `src/lib/supabase-server.ts`
  - `src/lib/supabase.ts`
- **Dependencies:** Phase 1.
- **Exact Changes:**
  1. Write migration `0004_tighten_rls_and_sha_index.sql`:
     - Split `observations_access` into:
       - `observations_select` (owners + assigned tenants of property)
       - `observations_owner_update` (UPDATE restricted strictly to property owners)
       - `observations_system_insert` (service_role or authenticated owner)
     - Audit all other tables (`inspections`, `assets`, `comparisons`, `property_tenants`) for fail-closed behavior.
  2. In `src/lib/supabase-db.ts`:
     - Distinguish user-scoped database requests from system/background tasks.
     - Route user requests through authenticated Supabase server client.
  3. Verify service-role is strictly reserved for:
     - Cloudinary webhook processing (`/api/cloudinary/webhook`)
     - AI pipeline asynchronous execution (`src/lib/pipeline.ts`)
     - Initial system bootstrapping / migrations
- **Migration Requirements:** New migration `0004_tighten_rls_and_sha_index.sql`.
- **Rollback Strategy:** Revert migration and client changes.
- **Acceptance Criteria:**
  - Database queries respect tenant boundaries under RLS.
  - Service-role key is never invoked for normal user reads/updates.

---

### PHASE 3 — Auth / Session / Cloudinary Configuration
- **Objective:** Fix sign-out session invalidation with proper Supabase SSR cookie deletion. Configure `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` in environment and ensure client URLs never fall back to `"demo"`.
- **Affected Files:**
  - `src/app/api/auth/session/route.ts`
  - `src/lib/cloudinary-urls.ts`
  - `.env.example`
  - `.env.local`
  - `tests/session-signout.test.ts`
- **Dependencies:** Phase 2.
- **Exact Changes:**
  1. In `src/app/api/auth/session/route.ts`:
     - Fix `DELETE`: Provide real `setAll` implementation to `createServerClient` that deletes cookies from `res.cookies` dynamically matching Supabase's actual cookie names (including chunked tokens).
  2. In `src/lib/cloudinary-urls.ts`:
     - Update `getCloudName()`: Check `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. If not configured, throw a clear configuration error or return an explicit placeholder rather than silently defaulting to `"demo"`.
  3. In `.env.local` & `.env.example`:
     - Ensure `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` matches `CLOUDINARY_CLOUD_NAME`.
- **Rollback Strategy:** Revert route and URL builder edits.
- **Acceptance Criteria:**
  - Sign-out properly clears all Supabase auth cookies.
  - Cloudinary URLs in browser render with configured cloud name without 404s.

---

### PHASE 4 — Upload Security + Media Pipeline
- **Objective:** Enforce server-side signed upload restrictions (`allowed_formats: "jpg,png,webp"`, `resource_type: "image"`, max size limit 20MB). Implement client-side pre-scaling before upload to 2400px while maintaining SHA-256 integrity. Request pre-scaled Cloudinary renditions for Sharp pixel processing.
- **Affected Files:**
  - `src/lib/media.ts`
  - `src/app/api/uploads/sign/route.ts`
  - `src/lib/pixel-node.ts`
  - `src/components/capture-modal.tsx` or capture upload handlers
  - `tests/upload-security.test.ts`
- **Dependencies:** Phase 3.
- **Exact Changes:**
  1. In `src/lib/media.ts`:
     - Add `allowed_formats: "jpg,png,webp"`, `resource_type: "image"`, and `max_file_size: 20971520` (20MB) to signed upload params.
  2. In `src/lib/pixel-node.ts`:
     - For Cloudinary image URLs, append `c_limit,w_800,f_jpg` before downloading for Sharp processing, preventing huge original transfers.
  3. Ensure SHA-256 hash calculation semantics remain clear and consistent.
- **Acceptance Criteria:**
  - Upload signing explicitly bounds format, resource type, and size.
  - Server avoids downloading oversized raw images for pixel diffing.

---

### PHASE 5 — Present Mode Performance Rewrite
- **Objective:** Eliminate CPU/GPU thrashing in Present Mode tour. Remove unthrottled 60-120fps `requestAnimationFrame` `setRect()` React rendering loop. Remove `document.body.innerText` layout reflow polling. Replace 9999px box shadow with performant CSS masking or bounded overlay. Coalesce elapsed timer updates.
- **Affected Files:**
  - `src/components/tour.tsx`
  - `tests/tour.test.ts`
- **Dependencies:** Phase 4.
- **Exact Changes:**
  1. Remove RAF `setRect` React state loop. Decouple DOM spotlight positioning from React state using DOM ref mutations, ResizeObserver, or event-driven coalescing.
  2. Replace `document.body.innerText.includes(...)` with explicit state / data attribute readiness checks.
  3. Replace `boxShadow: "0 0 0 9999px ..."` with lightweight CSS overlay / mask regions.
  4. Coalesce `setElapsed` timer to 150-250ms rather than 50ms.
  5. Add `prefers-reduced-motion` support and pause loops when tab is hidden or tour is inactive.
- **Acceptance Criteria:**
  - Zero per-frame React state dispatching in tour.
  - No `document.body.innerText` text scraping / layout reflow.
  - Smooth animation without frame drops or memory leaks.

---

### PHASE 6 — Theme / Accessibility
- **Objective:** Fix light-mode contrast failures in Present Mode and tour cards. Ensure semantic theme tokens and WCAG AA contrast compliance across both dark and light modes.
- **Affected Files:**
  - `src/components/tour.tsx`
  - `src/app/globals.css`
- **Dependencies:** Phase 5.
- **Exact Changes:**
  1. Replace hardcoded dark tokens (`bg-[#0b0c0e]/80`, `text-white/45`) with theme-adaptive tokens or explicit semantic presentation variables.
  2. Ensure spotlight mask and chapter cards are fully legible in light mode and dark mode.
  3. Verify keyboard navigation and ARIA attributes for tour controls.
- **Acceptance Criteria:**
  - Light mode tour text and controls meet WCAG AA contrast standards.
  - No white-on-light or dark-on-dark unreadable states.

---

### PHASE 7 — Startup Performance
- **Objective:** Eliminate client-side sequential startup waterfall (`/api/auth/session` → `/api/properties` → `/api/properties/:id/snapshot`). Pre-hydrate initial state server-side where possible or parallelize gracefully while avoiding duplicate hydration fetches.
- **Affected Files:**
  - `src/components/providers.tsx`
  - `src/app/(studio)/layout.tsx`
- **Dependencies:** Phase 6.
- **Exact Changes:**
  1. Pre-fetch session and initial property data or pass initial props from server layout into `StudioProvider`.
  2. Ensure `StudioProvider` checks for preloaded server state before issuing client requests.
  3. Add visibility/intersection observer to hero image transitions to prevent off-screen autoplay.
- **Acceptance Criteria:**
  - Network waterfall on initial dashboard load is eliminated or minimized.
  - No duplicate initial snapshot fetching.

---

### PHASE 8 — Database / API Query Optimization
- **Objective:** Add `CREATE INDEX idx_assets_sha256 ON assets(sha256)`. Replace N+1 nested loops in `/api/verify` with a direct indexed lookup. Batch asset queries in `/api/search`.
- **Affected Files:**
  - `supabase/migrations/0004_tighten_rls_and_sha_index.sql`
  - `src/app/api/verify/route.ts`
  - `src/lib/db.ts`
  - `src/lib/supabase-db.ts`
  - `src/app/api/search/route.ts`
  - `tests/verify.test.ts`
- **Dependencies:** Phase 7.
- **Exact Changes:**
  1. Add `getAssetBySha256(sha: string)` method to `DatabaseService` using direct indexed query: `SELECT * FROM assets WHERE LOWER(sha256) = LOWER($1) LIMIT 1`.
  2. In `src/app/api/verify/route.ts`:
     - Call `db.getAssetBySha256(sha)`.
     - Only if matched, fetch associated inspection and room names.
  3. In `src/app/api/search/route.ts`:
     - Batch inspection asset queries instead of sequential per-inspection fetches.
- **Acceptance Criteria:**
  - `/api/verify` performs a single indexed query rather than looping over all properties/inspections/assets.
  - Verify query returns correct match data in <10ms locally.

---

### PHASE 9 — State Management / Realtime Cleanup
- **Objective:** Clean up redundant realtime transport. Optimize state reconciliation so small mutations (like review triage) update local finding state instead of re-downloading entire 24KB+ snapshot. Clean up stale module singleton state in `src/lib/view.ts`.
- **Affected Files:**
  - `src/components/providers.tsx`
  - `src/lib/view.ts`
- **Dependencies:** Phase 8.
- **Exact Changes:**
  1. Align realtime listeners to Supabase Realtime with clear fallback.
  2. Add granular mutation updater for observation review changes.
  3. Ensure view singleton is synchronized cleanly with React context.
- **Acceptance Criteria:**
  - Finding status updates do not trigger full snapshot network reload.
  - Multi-tab updates reflect reliably.

---

### PHASE 10 — Reliability / Rate Limiting / AI Handling
- **Objective:** Handle Groq quota limits with structured backoff and explicit error states (`quota_limited`, `failed`, `retryable`). Preserve grounded question-answer contract in Ask RentalMove. Abstract rate limiting for multi-instance readiness.
- **Affected Files:**
  - `src/lib/vision.ts`
  - `src/lib/pipeline.ts`
  - `src/lib/rate-limit.ts`
  - `src/lib/assistant.ts`
- **Dependencies:** Phase 9.
- **Exact Changes:**
  1. Standardize AI error taxonomy (`quota_limited`, `network_error`, `invalid_response`).
  2. Prevent repeated infinite retries when quota is exhausted.
  3. Create pluggable rate-limit interface with in-memory default and environment-ready Redis hook.
- **Acceptance Criteria:**
  - Quota errors display informative, honest UI state rather than silent failures or fake findings.
  - Rate limiting is modular and resilient.

---

### PHASE 11 — Maintainability / Dead Code / Architecture Cleanup
- **Objective:** Remove duplicated `/api/report/[token]` route (canonical is `/api/share/[token]`). Audit ESLint suppressions. Configure explicit ESLint configuration to resolve `next lint` deprecation.
- **Affected Files:**
  - `src/app/api/report/[token]/route.ts` (redirect or consolidate to `/api/share/[token]`)
  - `.eslintrc.json` (create standard Next.js config)
  - Specific files with unnecessary `eslint-disable`
- **Dependencies:** Phase 10.
- **Exact Changes:**
  1. Deprecate `/api/report/[token]` by redirecting to `/api/share/[token]` or consolidating logic.
  2. Add `.eslintrc.json` extending `next/core-web-vitals`.
  3. Run `npm run lint` and fix any genuine lint errors.
- **Acceptance Criteria:**
  - `npm run lint` runs non-interactively and passes.
  - Zero duplicate endpoint logic.

---

### PHASE 12 — Product Capability Corrections
- **Objective:** Make floor plan data-driven rather than hardcoding Unit 4B assumptions. Centralize pixel matching thresholds (`SAME_SPOT_IOU`, `SAME_SPOT_DIST`) into documented config. Ensure accurate terminology for DOM presentation walkthroughs (avoiding misleading "video player" labels).
- **Affected Files:**
  - `src/lib/floorplan.ts`
  - `src/lib/snapshot.ts`
  - UI copy in Present Mode and Studio
- **Dependencies:** Phase 11.
- **Exact Changes:**
  1. Structure floor plan schema to support property-level configuration.
  2. Centralize pixel-matching constants in `src/lib/config.ts` or `src/lib/pixel.ts`.
  3. Ensure walkthrough copy accurately reflects interactive presentation.
- **Acceptance Criteria:**
  - Floor plan geometry is structured per-property.
  - Pixel threshold constants are documented and configurable.

---

### PHASE 13 — Observability & Safe Logging
- **Objective:** Add structured, secret-safe logging for auth failures, authorization rejections, upload signing, analysis duration, and verification queries. Include request correlation IDs.
- **Affected Files:**
  - `src/lib/logger.ts` (new lightweight utility)
  - Selected API route handlers
- **Dependencies:** Phase 12.
- **Exact Changes:**
  1. Create lightweight structured logger that redacts keys, tokens, and passwords.
  2. Attach correlation IDs to API requests and log critical failure events.
- **Acceptance Criteria:**
  - All auth and upload failures log structured metadata without leaking secrets.

---

### PHASE 14 — Full Regression / Security / Performance Validation
- **Objective:** Comprehensive test suite execution, security validation, build verification, and end-to-end audit check.
- **Dependencies:** Phases 1–13.
- **Verification Checklist:**
  - Security: Owner-only finding triage, IDOR isolation, RLS fail-closed, no secret leakage, secure upload signatures.
  - Performance: Zero RAF React state loops, fast verification queries, no startup request storms.
  - Quality: TypeScript 0 errors, ESLint 0 errors, 100% tests passing, clean production build.
  - Final Audit Report written.

---

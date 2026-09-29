# RentalMove

> **"Capture once. Find instantly. Compare over time."**  
> Hackathon Submission for **Pixels to Products: Cloudinary AI Hackathon 2026**  
> **Track 1: AI Media Pipelines**

RentalMove turns property inspection photos into a structured, searchable, reviewable **visual property memory**. By uniting **Cloudinary's media pipeline** (direct signed uploads, dynamic transformations, structured metadata, search indexing, and cryptographic ETags) with assistive Vision-Language AI models, RentalMove establishes trust and transparency between tenants and property owners while preserving absolute media integrity.

---

## 1. Product Overview

RentalMove anchors property condition across the entire lease lifecycle:
- **Move-In**: Establishes an unalterable visual baseline with cryptographic SHA-256 hashes and Cloudinary ETags.
- **Periodic Inspection**: Tracks wear and maintenance changes over time.
- **Move-Out**: Compares departure condition directly against baseline evidence with split-slider and side-by-side diff tooling.

### User Roles
RentalMove supports two core roles with tailored dashboards and access boundaries:
1. **Tenant** (e.g. *Alex Chen*):
   - Accesses assigned property (#381 Elmwood Ave).
   - Captures and uploads real inspection photos and walkthrough video directly from the browser into Cloudinary.
   - Reviews AI observations (Accept / Reject / Edit) with keyboard shortcuts.
   - Compares move-out captures against move-in baseline.
   - Generates and reviews tamper-evident inspection reports.
2. **Owner** (e.g. *Sarah Jenkins*):
   - Views and manages property portfolio.
   - Creates new properties and configures dynamic room definitions.
   - Schedules periodic inspections.
   - Navigates chronological property timelines and room history.
   - Conducts multi-inspection visual comparisons.
   - Executes natural language queries and structured searches across Cloudinary media assets.
   - Generates, shares, and revokes secure time-limited inspection evidence links.
   - Inspects live Cloudinary asset parameters with the dynamic **"Under the Hood"** drawer.

---

## 2. Architecture & Pipeline

```mermaid
graph TD
    User["Tenant / Owner User"] -->|Browser Capture / Video| Client["Next.js Web Client"]
    Client -->|1. Request Upload Signature| SignAPI["POST /api/uploads/sign"]
    SignAPI -->|Cloudinary Sign Engine| Cloudinary["Cloudinary API (yxrdw0hc)"]
    Client -->|2. Direct Signed FormData Upload| Cloudinary
    Cloudinary -->|3. Real Public ID, Secure URL, ETag| Client
    Client -->|4. Register Asset & Browser SHA-256| RegAPI["POST /api/assets/register"]
    RegAPI -->|5. Atomic DB Persistence| DB["Persistent Store (data/rentalmove-store.json)"]
    RegAPI -->|6. Trigger Async Analysis| Pipeline["Pipeline Engine (pipeline.ts)"]
    Pipeline -->|7. Fetch Resized VLM Copy (w_1024)| Cloudinary
    Pipeline -->|8. Visual Inference| Vision["Vision Provider (Groq / Gemini)"]
    Vision -->|9. Neutral Observations + BBox| DB
    Pipeline -->|10. Sync 9 Metadata Fields & Tags| Cloudinary
    Client -->|11. Review Center: Accept/Reject/Edit| ObsAPI["PATCH /api/observations/:id"]
    ObsAPI -->|12. Sync Review State to Cloudinary| Cloudinary
    Client -->|13. Search Expression / NL Query| SearchAPI["GET /api/search & POST /api/search/nl"]
    SearchAPI -->|14. Lucene Query Execution| Cloudinary
```

---

## 3. Cloudinary Integration

RentalMove harnesses Cloudinary as its central media engine:

| Capability | File Location | Hackathon Value & Implementation |
|---|---|---|
| **Direct Signed Uploads** | [`src/lib/media.ts`](file:///src/lib/media.ts), [`src/app/capture/page.tsx`](file:///src/app/capture/page.tsx) | Uploads images & videos directly from browser to Cloudinary via signed FormData. Never exposes `CLOUDINARY_API_SECRET`. |
| **Folder Hierarchy** | [`src/lib/media.ts`](file:///src/lib/media.ts) | Canonical structure: `properties/{prop_id}/inspections/{insp_id}/{room}/`. |
| **Structured Metadata (9 Fields)** | [`scripts/provision-cloudinary.ts`](file:///scripts/provision-cloudinary.ts), [`src/lib/media.ts`](file:///src/lib/media.ts) | Attaches `property_id`, `inspection_id`, `inspection_type`, `room`, `sub_area`, `capture_date`, `issue_category`, `review_status`, and `ai_confidence` directly to assets. |
| **Search API** | [`src/lib/search.ts`](file:///src/lib/search.ts), [`src/app/api/search/route.ts`](file:///src/app/api/search/route.ts) | Searches Cloudinary with Lucene expressions (`public_id:properties/prop-381* AND tags:kitchen AND tags:scratch`). |
| **Transformations** | [`src/lib/media.ts`](file:///src/lib/media.ts) | Dynamic URL transformations: `c_fill,w_400,h_300` (thumbnails), `c_limit,w_1600` (review), `c_limit,w_1024,q_auto,f_jpg` (VLM optimization). |
| **Integrity & ETags** | [`src/lib/hash.ts`](file:///src/lib/hash.ts), [`src/app/capture/page.tsx`](file:///src/app/capture/page.tsx) | Pairs Cloudinary ETags with browser-computed SHA-256 integrity hashes for tamper detection. |
| **Under the Hood Drawer** | [`src/components/UnderTheHoodDrawer.tsx`](file:///src/components/UnderTheHoodDrawer.tsx) | Live developer drawer displaying Cloudinary public IDs, transformation URLs, ETags, SHA-256 hashes, and structured metadata. |

---

## 4. AI Stance & Guardrails

RentalMove enforces strict assistive ethics in [`src/lib/copy.ts`](file:///src/lib/copy.ts):
- **Assistive Observations Only**: Vision models produce neutral descriptions (*"Possible visible mark on lower cabinet surface"*).
- **Zero Financial / Blame Adjudication**: Strictly prohibits terms like *fault, deposit penalty, guilty, damage deduction*.
- **Integrity Guarantee**: Original uploads are immutable. Bounding boxes are overlays only.
- **Human-in-the-Loop**: All AI observations default to `pending` review.

---

## 5. Environment Variables

Create `.env.local` using `.env.example` as a template:

```bash
# Cloudinary Credentials (Required)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key_here
CLOUDINARY_API_SECRET=your_cloudinary_api_secret_here
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name

# AI Vision & Natural Language Provider (Required for live VLM / NL search)
GROQ_API_KEY=your_groq_api_key_here

# Supabase (Optional: system automatically uses atomic persistent JSON file in data/rentalmove-store.json)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 6. Setup & Seeding

### 1. Install Dependencies
```bash
npm install
```

### 2. Provision Cloudinary Metadata Fields
Configures the 9 typed structured metadata schema fields in Cloudinary:
```bash
npx tsx scripts/provision-cloudinary.ts
```

### 3. Seed Realistic Photographic Demo Assets
Uploads high-resolution photographic property assets into Cloudinary (`yxrdw0hc`), indexes them with search tags, and seeds the persistent database:
```bash
npx tsx scripts/seed-demo-assets.ts
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 7. Testing & Verification

Run the full Vitest acceptance suite (29 tests across 5 test suites):
```bash
npx vitest run
```

Run TypeScript compilation check:
```bash
npx tsc --noEmit
```

Run production build:
```bash
npm run build
```

---

## 8. Demo Credentials & Hackathon Walkthrough Flow

### Demo Users (Pre-seeded in Navbar Switcher)
- **Tenant**: `alex.chen@example.com` (Alex Chen)
- **Owner**: `sarah.jenkins@example.com` (Sarah Jenkins)

### Hackathon Walkthrough Steps
1. **Tenant Experience**:
   - Open Landing page (`/`), toggle to **Tenant (Alex Chen)** in top-right.
   - View assigned property **#381 Elmwood Ave** with baseline status and pending observations.
   - Navigate to **Capture / Upload** (`/capture`), snap/upload a photo (or short video), observe the live real-time pipeline (Signature -> Cloudinary direct upload -> DB record -> AI analysis).
   - Open **Review Center** (`/review`), use keyboard shortcuts (`A` Accept, `R` Reject, `E` Edit) to review observations.
   - Open **Compare** (`/compare`), select Kitchen baseline vs move-out, slide split-screen slider to view changes.
   - Open **Timeline** (`/timeline`), inspect chronological history from 2024 to 2026.
2. **Owner Experience**:
   - Switch role to **Owner (Sarah Jenkins)** in top-right.
   - Inspect portfolio, navigate to **Search** (`/search`), enter natural language query *"Show kitchen scratches from move in"* to view real Cloudinary Search API results.
   - Click **Generate Report** on property #381, click **Share Report** to create a cryptographically secure share link token.
   - Open share link in a new private window (`/report?token=...`) to verify token authorization and tamper-evident SHA-256 / ETag verification.
   - Click **Under the Hood** in the top navigation bar to inspect real Cloudinary asset metadata, transformation URLs, and delivery params.

---

## 9. Known Limitations & Notes
- **Direct Cloudinary Uploads**: Live direct uploads require valid `CLOUDINARY_API_SECRET` in `.env.local` to issue signed parameters.
- **Persistent Storage**: Uses atomic file-backed JSON (`data/rentalmove-store.json`) with atomic temporary write and rename semantics, guaranteeing complete data persistence across server restarts without external database dependencies.
- **Vision Models**: Groq vision model integration handles image analysis and comparison synthesis with graceful fallback to deterministic observation schema if external rate limits occur.

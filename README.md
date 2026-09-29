# RentalMove

> **"Capture once. Find instantly. Compare over time."**  
> Hackathon Submission for **Pixels to Products: Cloudinary AI Hackathon 2026**  
> **Track 1: AI Media Pipelines**

RentalMove turns rental property photos into a structured, searchable, reviewable **visual history**. By combining **Cloudinary's media infrastructure** (signed uploads, structured metadata, transformations, and search API) with assistive vision-language models, RentalMove eliminates friction between tenants and property managers while preserving absolute cryptographic media integrity.

---

## Architecture

```mermaid
graph TD
    User["Tenant / Property Manager"] -->|Upload Photos| Client["Next.js App"]
    Client -->|1. Sign Upload Request| API["Next.js API (/api/uploads/sign)"]
    API -->|Generate Signature| Cloudinary["Cloudinary Platform"]
    Client -->|2. Direct Upload via Signature| Cloudinary
    Client -->|3. Register Asset Fallback| API
    Cloudinary -->|Webhook Notification| API
    API -->|4. Idempotent Register & SHA-256| DB["Database (Supabase / In-Memory)"]
    API -->|5. Fetch Resized VLM Copy (w_1024)| Cloudinary
    API -->|6. Visual Analysis| VLM["Vision Provider (Gemini / Mock)"]
    VLM -->|7. Neutral Observations + BBox| API
    API -->|8. Store Observations| DB
    API -->|9. Update 9 Metadata Fields| Cloudinary
    Client -->|10. Filter / Query| SearchAPI["/api/search"]
    SearchAPI -->|Search API Expression| Cloudinary
```

---

## Cloudinary Capabilities Table

| Cloudinary Capability | Implementation Location | Purpose & Value in RentalMove |
|---|---|---|
| **Signed Uploads** | [`src/lib/media.ts`](file:///src/lib/media.ts), [`src/app/api/uploads/sign/route.ts`](file:///src/app/api/uploads/sign/route.ts) | Secure client uploads directly to Cloudinary without exposing API secrets. |
| **Folder Hierarchy** | [`src/lib/media.ts`](file:///src/lib/media.ts) | Strict directory organization: `properties/{id}/{inspection_id}/{room}`. |
| **Structured Metadata (9 Fields)** | [`scripts/provision-cloudinary.ts`](file:///scripts/provision-cloudinary.ts), [`src/lib/media.ts`](file:///src/lib/media.ts) | Attaches typed schema (`property_id`, `room`, `issue_category`, `review_status`, `ai_confidence`, etc.) directly to assets for indexing. |
| **Search API** | [`src/lib/search.ts`](file:///src/lib/search.ts), [`src/app/api/search/route.ts`](file:///src/app/api/search/route.ts) | Executes complex search expressions over metadata fields and tags in real-time. |
| **Dynamic URL Transformations** | [`src/lib/media.ts`](file:///src/lib/media.ts) | `c_fill,w_400,h_300` for thumbnails, `c_limit,w_1600` for review views, `f_auto,q_auto` delivery. |
| **AI Cost-Control Downscaling** | [`src/lib/media.ts`](file:///src/lib/media.ts), [`src/lib/pipeline.ts`](file:///src/lib/pipeline.ts) | Converts high-res original photos to `c_limit,w_1024,q_auto,f_jpg` before sending to the VLM. |
| **Tags & Context** | [`src/lib/media.ts`](file:///src/lib/media.ts) | Auto-attaches `rentalmove`, `room:{room}`, and `insp:{type}` tags. |
| **Admin API** | [`scripts/provision-cloudinary.ts`](file:///scripts/provision-cloudinary.ts), [`src/lib/media.ts`](file:///src/lib/media.ts) | Provisions metadata fields (`add_metadata_field`) and updates asset metadata after review (`update_metadata`). |

---

## AI Stance & Guardrails Statement

RentalMove enforces strict assistive guardrails:
1. **Assistive Observations Only**: AI outputs are strictly visual observations ("Possible scratch visible on lower cabinet door finish.").
2. **Zero Blame & Liability**: Prohibited terms (`fault`, `negligent`, `deposit`, `damage penalty`, `charge`, `liable`) are systematically filtered by `sanitizeObservationText()`.
3. **No Overwrite**: Original photos are strictly immutable. Cryptographic SHA-256 hashes and Cloudinary ETags verify preservation.
4. **Human in the Loop**: AI observations default to `pending` review. Tenants and property managers make the final determinations.

---

## Setup & Running Locally

### Prerequisites
- Node.js 18+ (tested on Node v25.1.0)
- npm

### 1. Installation
```bash
git clone <repo-url>
cd rentalmove
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

> **Note on Offline Mock Mode:**  
> RentalMove is built with full offline resilience. If Cloudinary or Gemini API keys are omitted, the app automatically switches to `MockMediaProvider` and `MockVisionProvider` seeded with Property #381. You can test and review all screens without any third-party credentials.

To use live services, provide your credentials in `.env.local`:
```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

VISION_PROVIDER=gemini # or 'mock'
GEMINI_API_KEY=your_gemini_key
VISION_MODEL=gemini-1.5-flash
```

### 3. Provision Cloudinary Metadata Fields (Live Mode)
```bash
npm run provision:cloudinary
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing

RentalMove includes Vitest test suites covering:
- Strict Zod validation schemas
- AI blame-word post-filtering
- Cloudinary Search API whitelisting & expression construction
- Idempotent asset registration
- Observation review state transitions

Run all tests:
```bash
npm test
```

---

## Hackathon Demo Script
See [`docs/demo-script.md`](file:///docs/demo-script.md) for the 3-minute hackathon judge walkthrough.

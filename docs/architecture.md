# RentalMove Architecture

## System Overview

RentalMove is built for **Track 1 (AI Media Pipelines)** of the Cloudinary AI Hackathon 2026.
It transforms rental property photos into a structured, searchable, and verifiable visual timeline.

```mermaid
graph TD
    Client["Next.js Web Client<br/>(Tenant / Property Manager)"]
    API["Next.js App Router API Routes<br/>(Backend)"]
    Cloudinary["Cloudinary Platform<br/>(Signed Uploads, Structured Metadata, Transformations, Search API)"]
    VLM["Vision Provider<br/>(Groq Qwen vision; Deterministic Mock only when VISION_PROVIDER=mock)"]
    DB["Supabase Postgres / Resilient Data Store<br/>(Assets, Inspections, Observations, Realtime)"]

    Client -->|1. Request signed upload params| API
    API -->|Generate SHA/signature| Cloudinary
    Client -->|2. Direct upload to Cloudinary| Cloudinary
    Client -->|3. Register asset fallback| API
    Cloudinary -->|Webhook notification| API
    API -->|4. Idempotent asset registration & SHA-256| DB
    API -->|5. Resized copy request (w_1024,q_auto)| Cloudinary
    API -->|6. Visual observation analysis| VLM
    VLM -->|7. Neutral observations + Bboxes| API
    API -->|8. Store observations & status| DB
    API -->|9. Update structured metadata| Cloudinary
    Client -->|10. Cloudinary Search API query| API
    API -->|Execute server-side expression| Cloudinary
```

## Cloudinary Integration Architecture

1. **Direct Signed Uploads**: Media uploads go straight from client to Cloudinary using signed parameters signed server-side by `media.ts`. Cloudinary API secrets never touch client code.
2. **Deterministic Folder Hierarchy**: Assets are stored under `properties/{property_id}/{inspection_id}/{room}/{filename}`.
3. **Structured Metadata (9 Fields)**:
   - `property_id` (string)
   - `inspection_id` (string)
   - `inspection_type` (enum: `move_in`, `inspection`, `move_out`)
   - `room` (enum: `living_room`, `kitchen`, `bathroom`, `bedroom`, `exterior`)
   - `sub_area` (string)
   - `capture_date` (date)
   - `issue_category` (enum: `none`, `scratch`, `stain`, `crack`, `dent`, `mark`, `other`)
   - `review_status` (enum: `pending`, `accepted`, `rejected`, `edited`)
   - `ai_confidence` (integer: 0-100)
4. **Transformations**:
   - `thumb(id)`: `c_fill,w_400,h_300,f_auto,q_auto`
   - `review(id)`: `c_limit,w_1600,h_1200,f_auto,q_auto`
   - `vlmCopy(id)`: `c_limit,w_1024,q_auto,f_jpg`
   - `fullOriginal(id)`: `f_auto,q_auto`
5. **Search API**: Server-side whitelisted expression builder queries indexed metadata fields and tags without exposing raw expressions to client or LLM injection.

## AI Stance & Neutral Observation Guardrails

- Observations are strictly assistive notes. They never conclude legal fault, deposit forfeiture, or repair liability.
- All observation descriptions are filtered against `BLAME_WORDS` (`fault`, `negligent`, `deposit`, `damage penalty`, etc.) in `copy.ts`.
- Low-confidence observations are explicitly flagged with `Review required`.
- Originals are never modified by the app; a SHA-256 fingerprint and the Cloudinary ETag are recorded so later changes to the file can be detected (not legal proof of authenticity).

# RentalMove: Architectural & Technical Decisions

## 1. Provider Abstraction Pattern (Offline First & Hackathon Resilience)
- **Problem**: Missing API keys or network latency during local evaluation could block development or judge review.
- **Decision**: Implemented `MockMediaProvider` and `MockVisionProvider` alongside live Cloudinary and Gemini implementations. The app seamlessly runs fully offline with deterministic seed data for Property #381, while switching to live Cloudinary and VLM calls as soon as credentials are provided in `.env.local`.

## 2. Server-Constructed Cloudinary Search Expressions
- **Problem**: Allowing arbitrary client or LLM input directly into Cloudinary search queries could cause syntax errors or expression injection.
- **Decision**: Created `buildCloudinarySearchExpression()` in `src/lib/search.ts`. The schema uses Zod validation against strict whitelisted enums (`RoomCategoryEnum`, `InspectionTypeEnum`, `IssueCategoryEnum`, `ReviewStatusEnum`). The natural-language parsing route (`/api/search/nl`) only outputs these validated keys.

## 3. Idempotent Analysis Pipeline
- **Problem**: Duplicate webhooks or page refreshes could trigger redundant AI model runs, burning tokens and duplicating database rows.
- **Decision**: `registerAsset()` and `runAnalysisForAsset()` enforce an explicit state machine: `queued` &rarr; `running` &rarr; `done` (or `failed`). Only assets in `queued` status can trigger an AI run. Database rows are keyed by unique `cloudinary_public_id`.

## 4. Cost Control for VLM Calls
- **Problem**: Sending full-resolution 4K or 12MP original photos directly to vision-language models increases latency and API token costs.
- **Decision**: All VLM calls request an on-the-fly Cloudinary transformation URL: `c_limit,w_1024,q_auto,f_jpg`. This delivers high-fidelity visual detail for surface scratches while keeping latency and costs minimal.

## 5. Neutral AI Post-Filter Guardrail
- **Problem**: LLMs occasionally adopt accusatory terminology ("tenant damaged cabinet door", "unreasonable wear and tear").
- **Decision**: Enforced `sanitizeObservationText()` in `src/lib/copy.ts`. Any prohibited term (from `BLAME_WORDS`) is stripped and replaced with neutral terms (`[visual irregularity]`), and descriptions are normalized to start with "Possible" or "Visible".

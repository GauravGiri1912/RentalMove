# RentalMove Hackathon Demo Script (Pixels to Products 2026)

**Target Demo Duration**: 3-4 minutes

## 1. Introduction (30 seconds)
- State the problem: *"Rental deposit disputes often turn into he-said-she-said arguments because condition photos are scattered across phone cameras, lack timestamps, and can't be quickly searched or compared."*
- Introduce RentalMove: *"RentalMove turns rental photos into a structured, searchable, and reviewable visual timeline powered by Cloudinary."*
- Tagline: *"Capture once. Find instantly. Compare over time."*

## 2. Baseline & Timeline Walkthrough (60 seconds)
- Point to **Property #381 Elmwood Ave (Apt 4B)** on the screen.
- Show the chronological timeline:
  - **Move-In 2024**: Kitchen baseline photo with the assistive observations the vision model produced (marked pending until a person reviews them).
  - Point out the **Original Kept (SHA-256 recorded)** badge: a fingerprint of the original file is stored so later changes can be detected.
  - **Inspection 2025**: The follow-up inspection photo of the same cabinet where the observation notes *"Existing cabinet mark reviewed, consistent with baseline move-in capture"*.
- Switch between **Tenant Mode** and **Manager Mode** in the top navigation.

## 3. Cloudinary Search API (45 seconds)
- Navigate to the **Search** screen (`/search`).
- Filter by room (`kitchen`) and issue (`scratch`).
- Highlight the **server-constructed Cloudinary Search expression**:
  `folder:properties/prop-381/* AND metadata.room=kitchen AND metadata.issue_category=scratch`
- Show instant results powered by Cloudinary's indexed structured metadata.

## 4. Cloudinary Under the Hood (30 seconds)
- Highlight the Cloudinary capabilities powering the pipeline:
  - Direct signed uploads with zero secret leaks.
  - 9 structured metadata fields automatically synchronized with AI analysis.
  - Dynamic on-the-fly transformations: optimized thumbnails (`c_fill,w_400,h_300`), review views (`c_limit,w_1600`), and AI model downscaling (`c_limit,w_1024,f_jpg`).
- Explain the strict **assistive AI guardrails**: neutral language only, no blame, no deposit deductions.

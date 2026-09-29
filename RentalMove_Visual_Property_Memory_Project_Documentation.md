A Cloudinary-centered system that turns property photos and inspection
media into a structured, searchable, reviewable visual history.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>THE CORE IDEA<br />
</strong>Capture the condition of a rental property at move-in, preserve
it as the baseline, and make later inspections and move-out evidence
searchable, comparable, and easy for people to review.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Item**             | **Decision / Target**                                                                 |
|----------------------|---------------------------------------------------------------------------------------|
| Hackathon            | Pixels to Products - Cloudinary AI Hackathon 2026                                     |
| Recommended track    | Track 1 - AI Media Pipelines (with a Track 3 product story)                           |
| Primary users        | Tenants and property managers                                                         |
| MVP media            | Photos first; short videos as optional enhancement                                    |
| MVP property scope   | One property, 4-6 rooms, 3 inspection states                                          |
| AI stance            | Assistive observations, never automatic legal/financial determinations                |
| Core Cloudinary role | Upload, metadata, AI analysis, search, transformations, delivery, workflow automation |
| Build principle      | Get one complete end-to-end workflow working before adding advanced CV                |

Prepared for internal team alignment

Version 1.0 \| 29 September 2026

# 1. Executive Summary

RentalMove is a visual property record designed for the moments when
apartment condition matters most: move-in, periodic inspection, and
move-out. Instead of leaving users with hundreds of unstructured phone
photos, RentalMove turns captured media into a property timeline
organized by property, inspection, room, date, and review status.

The combined concept connects two complementary workflows. The
tenant-facing workflow creates a reliable move-in baseline and a
move-out comparison. The property-manager workflow creates a
longitudinal inspection history that can be searched by room, date,
inspection type, or observation.

Cloudinary is the media backbone of the product. Uploaded photos and
videos are stored and delivered through Cloudinary; assets receive
structured metadata and tags; AI-powered media workflows help classify
and analyze images; Search enables room- and date-based retrieval;
transformations provide thumbnails and optimized delivery. Cloudinary
Structured Metadata supports typed fields and search, while MediaFlows
provides workflow automation. \[1\]\[2\]

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>WHAT THE PRODUCT IS NOT<br />
</strong>RentalMove is not a legal dispute engine, automated deposit
calculator, or definitive damage judge. It produces organized visual
evidence and AI observations that a tenant or property manager must
review.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Why this is a strong hackathon concept

| **Reason**            | **Why it matters**                                                                                                        |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------|
| Cloudinary is central | The product depends on media ingestion, organization, metadata, AI analysis, search, transformation and delivery.         |
| Clear problem         | Condition records are often fragmented, hard to retrieve, and difficult to compare over time.                             |
| Strong demo           | Upload media -\> auto-organize -\> detect possible issue -\> review -\> timeline -\> compare -\> natural-language search. |
| Feasible MVP          | Does not require training a novel vision model or real-time generative video.                                             |
| Two-sided product     | The same media history supports both tenant protection and property operations.                                           |
| Extensible            | Can evolve into a property inspection SaaS, not just a hackathon demo.                                                    |

# 2. Problem Statement

## 2.1 Formal Problem Statement

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>PROBLEM<br />
</strong>Rental properties generate a large amount of visual evidence at
move-in, inspection, maintenance, and move-out, but this evidence is
commonly stored as disconnected photos, videos, messages, and documents.
As a result, tenants and property managers struggle to establish what
condition a room or fixture was in at a specific time, retrieve the
right evidence quickly, and identify visible changes across
inspections.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.2 User Pain Points

- Photos are often named generically and have little useful context.

- Room-level organization is manual and inconsistent.

- Inspectors may need to search across many dates or folders to find a
  previous image.

- Visual comparisons are difficult when camera angle, lighting, or
  framing changes.

- Potential scratches, stains, cracks, or surface marks can be missed
  during a manual pass.

- Tenants and managers need evidence they can review together rather
  than an opaque AI verdict.

- Property history is rarely represented as a single searchable
  timeline.

## 2.3 Core User Need

Users need a simple way to capture property condition once and turn that
media into an organized visual memory that remains useful at later
inspections.

# 3. Proposed Solution

RentalMove creates a persistent visual record for each property. A user
captures or uploads inspection media. The system uploads it to
Cloudinary, enriches the assets with room/property/inspection metadata,
runs AI-assisted observations, asks the user to review flagged
observations, and stores the resulting record in a timeline.

## 3.1 Product Promise

“Capture once. Find instantly. Compare over time.”

## 3.2 Main Workflows

| **Workflow**        | **Outcome**                                                                       |
|---------------------|-----------------------------------------------------------------------------------|
| Move-In             | Creates the initial condition baseline for the property.                          |
| Periodic Inspection | Adds a dated snapshot of the property without replacing earlier evidence.         |
| Move-Out            | Creates a final snapshot and surfaces visually comparable prior evidence.         |
| Search              | Finds the relevant historical media using structured metadata and search queries. |
| Review              | Allows humans to accept, reject, or edit AI observations.                         |

# 4. Target Users & Use Cases

## 4.1 Tenant

- Document move-in condition quickly.

- Record visible issues with photo evidence.

- Review what the system noticed.

- Return later and create a move-out record.

- Compare current observations with the original baseline.

## 4.2 Property Manager / Inspector

- Maintain a visual record across multiple inspections.

- Find all evidence for a room or issue across dates.

- Review AI observations before accepting them into the inspection
  record.

- Compare current and previous room-level evidence.

- Use a consistent media workflow across properties.

## 4.3 Future B2B Users

Property-management companies, inspection vendors, student housing
operators, co-living operators, and facility teams are natural future
customers. These are future product directions, not required for the
hackathon MVP.

# 5. Scope Definition

## 5.1 MVP - Must Have

| **Feature**            | **MVP definition**                                              |
|------------------------|-----------------------------------------------------------------|
| Property creation      | Create/select a demo property and room list.                    |
| Inspection creation    | Create Move-In, Inspection, or Move-Out record.                 |
| Media capture/upload   | Upload images; optionally record/upload a short video.          |
| Cloudinary integration | Upload assets and store core metadata.                          |
| Room classification    | Map media to room using UI and/or AI-assisted classification.   |
| AI observations        | Flag possible visible issues such as scratch/stain/crack/mark.  |
| Human review           | Accept, reject, or edit observations.                           |
| Timeline               | Show dated inspection history.                                  |
| Comparison             | Show previous and current evidence side-by-side.                |
| Search                 | Search by room, date, inspection type, or observation.          |
| Optimized delivery     | Use Cloudinary transformations for thumbnails/preview delivery. |

## 5.2 Stretch Goals

- Short video walkthrough ingestion with representative-frame
  extraction.

- Better visual alignment for before/after comparison.

- Issue heatmap or image annotations.

- Natural-language search such as “show kitchen cabinet observations
  from 2025”.

- Shareable inspection report.

- Multi-property manager dashboard.

- Offline capture queue with later upload.

## 5.3 Explicitly Out of Scope

- Automatic legal conclusions.

- Automatic deposit deductions or monetary claims.

- Training a custom foundation vision model.

- Perfect defect detection for every property material.

- Full construction-grade inspection certification.

- Advanced insurance claims adjudication.

- Real-time video damage tracking.

# 6. Functional Requirements

| **ID** | **Requirement**                                                                                  |
|--------|--------------------------------------------------------------------------------------------------|
| FR-01  | The system shall allow a user to create or select a property.                                    |
| FR-02  | The system shall allow an inspection to be created for a property with date and inspection type. |
| FR-03  | The system shall allow image uploads and optionally short video uploads.                         |
| FR-04  | Each uploaded asset shall be associated with property and inspection identifiers.                |
| FR-05  | The system shall support room-level organization.                                                |
| FR-06  | The system shall generate or attach AI observations to eligible images.                          |
| FR-07  | AI observations shall include a human-review status.                                             |
| FR-08  | Users shall be able to accept, reject, or edit an observation.                                   |
| FR-09  | The system shall preserve previous inspection records rather than overwrite them.                |
| FR-10  | The system shall support historical search.                                                      |
| FR-11  | The system shall show selected prior/current media side-by-side.                                 |
| FR-12  | The system shall use Cloudinary for media storage/delivery and meaningful media operations.      |

## 6.1 Non-Functional Requirements

- Responsive UI for laptop and mobile-sized screens.

- Fast first preview through Cloudinary transformations and CDN
  delivery.

- Clear loading/error states for AI operations.

- No secrets in the frontend or public GitHub repository.

- AI results presented as observations with confidence/review state.

- Graceful fallback when AI analysis fails: asset remains available and
  can be reviewed manually.

# 7. User Experience

## 7.1 Tenant Flow

Dashboard -\> Property -\> Start Move-In -\> Capture/Upload -\>
Auto-organize -\> AI observations -\> Review -\> Confirm baseline -\>
Timeline.

## 7.2 Property Manager Flow

Dashboard -\> Property -\> Timeline -\> Select inspection -\>
Filter/search -\> Open room -\> Review observations -\> Compare with
prior inspection.

## 7.3 Proposed Screens

| **Screen**               | **Purpose**                                                       |
|--------------------------|-------------------------------------------------------------------|
| 1\. Landing / Demo Entry | Explain problem and enter the sample property.                    |
| 2\. Property Dashboard   | Show properties and latest inspection status.                     |
| 3\. Capture / Upload     | Upload images and create an inspection.                           |
| 4\. Processing           | Show Cloudinary/AI workflow progress.                             |
| 5\. Review Center        | Show flagged observations for human confirmation.                 |
| 6\. Property Timeline    | Show inspections across dates.                                    |
| 7\. Room History         | Show all media for a room across inspections.                     |
| 8\. Compare View         | Show selected prior/current images.                               |
| 9\. Search               | Find evidence using structured filters or natural-language input. |

# 8. System Architecture

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>ARCHITECTURE PRINCIPLE<br />
</strong>Use PostgreSQL/Supabase for application entities and Cloudinary
for media assets, media metadata, transformation, delivery, and media
workflow operations. Do not store large image/video binaries in your
relational database.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Layer**            | **Technology**                                                          | **Responsibility**                                                                       |
|----------------------|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Frontend             | Next.js / React / TypeScript                                            | Capture/upload UI, timeline, search, review, comparison.                                 |
| Backend              | FastAPI or Node.js/Express                                              | Auth/session orchestration, inspection APIs, database access, secure Cloudinary signing. |
| Application DB       | Supabase/PostgreSQL                                                     | Users, properties, rooms, inspections, observations, asset references.                   |
| Media layer          | Cloudinary                                                              | Upload, storage, transformations, delivery, metadata, tags, search, workflows.           |
| AI layer             | Cloudinary AI capabilities and/or external vision API only where needed | Room classification and visual observations.                                             |
| Client CV (optional) | Browser-side pose/vision only if needed                                 | Future or stretch functionality; not a dependency for MVP.                               |

## 8.1 End-to-End Media Flow

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>USER<br />
|<br />
v<br />
Web capture / file upload<br />
|<br />
v<br />
Backend creates inspection context<br />
|<br />
v<br />
Cloudinary Upload<br />
|<br />
+--&gt; Transform / optimize / thumbnail<br />
|<br />
+--&gt; Attach structured metadata + tags<br />
|<br />
+--&gt; AI analysis workflow<br />
| |<br />
| v<br />
| Observation + confidence<br />
| |<br />
v v<br />
Cloudinary asset &lt;--&gt; Application DB record<br />
|<br />
v<br />
Timeline / Search / Compare UI</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 9. Cloudinary Integration Plan

The hackathon requires Cloudinary to be an active part of the product,
not merely static image hosting. RentalMove is designed around that
requirement: the media lifecycle begins and ends with Cloudinary-managed
assets.

## 9.1 Cloudinary Capabilities to Use

| **Capability**                | **RentalMove usage**                                                                                                                                                  |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Upload API / Upload Widget    | Secure upload of inspection photos and optional videos.                                                                                                               |
| Structured Metadata           | Store property_id, inspection_id, room, inspection_type, capture_date, review_status, and issue category. Cloudinary documents typed fields and search on them. \[1\] |
| Search API                    | Find media by metadata/tags/inspection context.                                                                                                                       |
| AI / tagging workflows        | Classify and enrich incoming media; exact capability should be validated during the first spike.                                                                      |
| MediaFlows                    | Automate ingestion, analysis and downstream media actions; free tier currently lists 100 asset touchpoints/month and 3 workflows. \[3\]                               |
| Image transformations         | Create thumbnails, consistent previews, and responsive variants.                                                                                                      |
| Video transformation/delivery | Optional short walkthrough support.                                                                                                                                   |
| CDN delivery                  | Fast delivery of inspection galleries and comparison images.                                                                                                          |

## 9.2 Suggested Cloudinary Metadata Schema

| **Field**       | **Type / example**                                    | **Purpose**                |
|-----------------|-------------------------------------------------------|----------------------------|
| property_id     | String / property_381                                 | Links asset to property    |
| inspection_id   | String / insp_2026_001                                | Links asset to inspection  |
| inspection_type | Enum / move_in, inspection, move_out                  | Timeline grouping          |
| room            | Enum / kitchen, bathroom, bedroom, living_room        | Room retrieval             |
| sub_area        | String / lower_cabinet                                | Fine-grained location      |
| capture_date    | Date                                                  | Historical ordering        |
| issue_category  | Enum / none, scratch, stain, crack, dent, mark, other | Observation classification |
| review_status   | Enum / pending, accepted, rejected, edited            | Human review state         |
| ai_confidence   | Number / 0-1                                          | Confidence shown to user   |

Cloudinary currently supports typed structured metadata, validation,
defaults, mandatory fields, and searching on these fields. A product
environment can have up to 100 structured metadata fields. \[1\]

# 10. AI & Computer Vision Strategy

## 10.1 What AI should do

- Classify or suggest the room from visual content.

- Describe visible condition observations in neutral language.

- Suggest issue categories: possible scratch, possible stain, possible
  crack, possible dent, visible mark, etc.

- Estimate confidence and attach the observation to the asset.

- Assist with matching comparable room/evidence assets across
  inspections.

## 10.2 What AI should NOT do

- Declare that a tenant caused damage.

- Declare legal responsibility.

- Calculate deposit deductions.

- Treat a low-confidence observation as established fact.

- Delete or replace the original evidence asset.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>AI OUTPUT FORMAT<br />
</strong>“Possible scratch visible on lower kitchen cabinet. Confidence:
0.87. Review required.” This is intentionally different from “Tenant
damaged cabinet.”</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 10.3 Recommended MVP AI Approach

Do not train a model. Use a strong existing vision capability available
through the selected Cloudinary workflow or a small external inference
call when a Cloudinary-native capability cannot provide the needed
observation. Keep the AI output structured and deterministic enough for
the UI.

## 10.4 Comparison Strategy

Start with assisted comparison: the user selects a prior and current
image of the same room/area. The system returns a textual observation
and visually presents the two images side-by-side. Advanced pixel-level
alignment or segmentation can be added later only if time allows.

# 11. Data Model

| **Entity**  | **Key fields**                                                                |
|-------------|-------------------------------------------------------------------------------|
| User        | id, name, email, role                                                         |
| Property    | id, address_label, unit_label, created_at                                     |
| Room        | id, property_id, name, category                                               |
| Inspection  | id, property_id, type, captured_at, created_by, status                        |
| AssetRecord | id, inspection_id, room_id, cloudinary_public_id, secure_url, captured_at     |
| Observation | id, asset_id, category, description, confidence, review_status, reviewer_note |
| Comparison  | id, property_id, room_id, prior_asset_id, current_asset_id, summary           |

## 11.1 Example Asset Record

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>{<br />
"property_id": "property_381",<br />
"inspection_id": "insp_2026_001",<br />
"room": "kitchen",<br />
"sub_area": "lower_cabinet",<br />
"cloudinary_public_id":
"properties/381/inspections/2026-09-30/kitchen/cabinet_01",<br />
"issue_category": "scratch",<br />
"ai_confidence": 0.87,<br />
"review_status": "pending"<br />
}</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 12. API Design (Proposed)

| **Method** | **Endpoint**                    | **Purpose**                               |
|------------|---------------------------------|-------------------------------------------|
| POST       | /api/properties                 | Create property                           |
| GET        | /api/properties/:id             | Get property summary                      |
| POST       | /api/properties/:id/inspections | Create inspection                         |
| POST       | /api/uploads/sign               | Create secure upload parameters           |
| POST       | /api/assets/register            | Register Cloudinary asset in DB           |
| POST       | /api/assets/:id/analyze         | Trigger or request AI analysis            |
| PATCH      | /api/observations/:id           | Accept/reject/edit AI observation         |
| GET        | /api/properties/:id/timeline    | Get inspection timeline                   |
| GET        | /api/search                     | Search assets by property/room/date/issue |
| POST       | /api/comparisons                | Create/retrieve comparison                |

Keep Cloudinary API secrets on the backend. Frontend code should never
expose private API credentials. The hackathon explicitly requires teams
not to put API keys or credentials in public repositories. \[4\]

# 13. Cost & Free-Tier Plan

The hackathon page states that no credit card is required and that the
Cloudinary free tier is intended to provide what participants need to
build. Cloudinary currently lists a Free plan with 25 monthly credits
for transformations, storage, and bandwidth. One credit corresponds to
1,000 transformations, 1 GB storage, 1 GB image bandwidth, or 1 GB video
bandwidth on the Free plan. \[5\]

Cloudinary MediaFlows currently lists a free tier of 100 asset
touchpoints/month, 3 workflows, and 20 premium asset touchpoints. \[3\]

| **Usage area**   | **Hackathon strategy**                                                                |
|------------------|---------------------------------------------------------------------------------------|
| Image storage    | Keep demo dataset small; remove unnecessary test assets.                              |
| Transformations  | Create only the responsive sizes actually needed.                                     |
| AI calls         | Use a small curated test set; do not trigger analysis repeatedly on every UI refresh. |
| Video            | Keep optional and short for MVP.                                                      |
| Development      | Use local/test images for UI work and Cloudinary only for integration validation.     |
| Quota monitoring | Check usage before final demo run and keep a known-good demo dataset.                 |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>COST CONTROL RULE<br />
</strong>Never tie AI inference to a polling loop, every camera frame,
or every page refresh. One upload should lead to one controlled
processing path.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 14. Feasibility Analysis

| **Area**                | **Feasibility**         | **Why**                                                                                                                |
|-------------------------|-------------------------|------------------------------------------------------------------------------------------------------------------------|
| Cloudinary integration  | High                    | Core upload, metadata, search, transformations and delivery are mature platform capabilities.                          |
| Property timeline       | High                    | Mostly application logic plus asset metadata.                                                                          |
| Room organization       | High                    | Can start with UI selection and add AI assistance.                                                                     |
| AI observation          | Medium-High             | Existing vision capabilities can reduce model-building effort, but accuracy must be validated on real property images. |
| Historical search       | High                    | Structured metadata and Search API are a strong fit. \[1\]\[2\]                                                        |
| Before/after comparison | Medium                  | The UI is easy; robust change detection is harder because of lighting, camera angle and viewpoint.                     |
| Video                   | Medium                  | Technically supported, but adds processing and demo complexity.                                                        |
| Hackathon completion    | High with scope control | A useful MVP can avoid novel model training and real-time CV.                                                          |

## 14.1 Feasibility Gate

Within the first implementation session, the team should prove this
path: upload 3 sample images -\> Cloudinary asset exists -\> required
metadata is attached -\> one AI observation is produced or a mocked
observation contract is validated -\> asset appears in a timeline -\>
one search query returns it. If this chain works, proceed with
polishing; if not, simplify the AI step before building additional UI.

# 15. Risk Analysis & Mitigation

| **Risk**                                     | **Probability** | **Impact** | **Mitigation**                                                                                         |
|----------------------------------------------|-----------------|------------|--------------------------------------------------------------------------------------------------------|
| AI false positive/false negative             | High            | High       | Use “possible” language, show confidence, require human review, preserve original image.               |
| Lighting/camera angle breaks comparison      | High            | High       | Use guided capture, same-room selection, side-by-side comparison first; advanced alignment is stretch. |
| Cloudinary quota exceeded                    | Medium          | High       | Use curated demo data, avoid repeat processing, monitor quota, cache results.                          |
| AI service unavailable                       | Low-Medium      | High       | Store media first; degrade to manual review; keep a preprocessed demo dataset.                         |
| Too much scope                               | High            | High       | Freeze MVP: photos + timeline + review + search + comparison.                                          |
| Privacy concerns                             | Medium          | High       | Consent screen, minimal retention, secure uploads, clear privacy statement.                            |
| Users misunderstand AI output as legal truth | Medium          | High       | UI language explicitly says “AI observation - review required”.                                        |
| Poor room classification                     | Medium          | Medium     | Allow manual correction; do not block ingestion on AI classification.                                  |
| Video processing becomes a time sink         | Medium          | Medium     | Make video optional; prioritize still images.                                                          |
| Public repo secret leak                      | Low             | Very High  | Use .env, server-side credentials, secret scanning, and repository review before submission.           |

# 16. Privacy, Security & Responsible AI

## 16.1 Privacy

- Explain why photos are collected and what they are used for.

- Avoid collecting personal information that is not required for the
  workflow.

- Use secure transport and server-side secret management.

- Provide deletion controls where practical in the prototype.

- Do not make stronger retention/privacy promises than the implemented
  system can actually support.

## 16.2 Responsible AI

- Use neutral observation language.

- Always retain the original image as evidence.

- Allow users to correct AI-generated metadata.

- Do not infer intent, blame, fraud, or legal responsibility.

- Make uncertainty visible through confidence and review states.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>TRUST PRINCIPLE<br />
</strong>The AI helps people find and review evidence. It does not
decide who is responsible for a property condition.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 17. Implementation Plan

## 17.1 Suggested Stack

| **Component** | **Choice**                                                                  |
|---------------|-----------------------------------------------------------------------------|
| Frontend      | Next.js + React + TypeScript + Tailwind CSS                                 |
| Backend       | FastAPI or Node.js/Express                                                  |
| Database      | Supabase PostgreSQL                                                         |
| Media         | Cloudinary Image/Video platform                                             |
| Workflow      | Cloudinary MediaFlows where useful                                          |
| AI            | Cloudinary-supported AI capabilities; external vision API only where needed |
| Auth          | Supabase Auth or simple hackathon auth                                      |
| Hosting       | Vercel for frontend + Render/Railway/Fly.io for API, or equivalent          |

## 17.2 Build Phases

| **Phase**                   | **Work**                                                                                                     | **Exit criterion**                               |
|-----------------------------|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| Phase 0 - Feasibility spike | Create Cloudinary account, upload 3-5 images, verify metadata, transformations, search, and one AI workflow. | Must pass before full build.                     |
| Phase 1 - Core data model   | Properties, rooms, inspections, assets, observations.                                                        | Working API + DB.                                |
| Phase 2 - Upload pipeline   | Secure upload, Cloudinary public IDs, metadata assignment, thumbnails.                                       | One inspection fully stored.                     |
| Phase 3 - AI review         | Observation schema, AI call, review UI, fallback manual review.                                              | One photo -\> one observation -\> accept/reject. |
| Phase 4 - Timeline/search   | Inspection timeline, filters, historical search.                                                             | “Find bathroom photos from 2025” works.          |
| Phase 5 - Comparison        | Prior/current image selection and comparison view.                                                           | One visible before/after demo.                   |
| Phase 6 - Polish            | Loading states, errors, seeded demo data, README, demo video.                                                | Submission-ready.                                |

# 18. 4-Person Team Allocation

| **Member**            | **Primary ownership**                                            | **Secondary**                                  |
|-----------------------|------------------------------------------------------------------|------------------------------------------------|
| Person 1 - Frontend   | Dashboard, capture/upload UI, timeline, compare view             | Visual polish and demo flow                    |
| Person 2 - Backend/DB | API, Supabase schema, auth, asset records, observations          | Integration and error handling                 |
| Person 3 - Cloudinary | Upload API, metadata, transformations, Search API, MediaFlows    | Quota monitoring and README Cloudinary section |
| Person 4 - AI/CV      | Room/issue analysis, observation contract, comparison experiment | Seed data, testing, demo script                |

## 18.1 Collaboration Rule

Each person should have a clearly testable deliverable every few hours.
Merge only small, working increments. Keep the Cloudinary integration
isolated behind a small service/module so another teammate can replace
or mock it without rewriting the frontend.

# 19. Testing Strategy

| **Test area** | **Test cases**                                                                  |
|---------------|---------------------------------------------------------------------------------|
| Upload        | Valid JPG/PNG; large file; duplicate; network failure.                          |
| Metadata      | Correct property/inspection/room values; missing metadata; manual correction.   |
| AI            | Clear issue; no issue; ambiguous issue; poor image quality; non-property image. |
| Review        | Accept; reject; edit; revisit observation.                                      |
| Search        | Room; date; inspection type; issue category; no-result query.                   |
| Comparison    | Same area, different lighting, different viewpoint, missing prior image.        |
| Security      | Verify API secrets are backend-only; verify repo is clean of secrets.           |
| Quota         | Repeated upload/processing should not create uncontrolled API usage.            |

## 19.1 Demo Test Dataset

Prepare a deterministic demo property with four rooms and 20-30 curated
images. Include 3-5 intentionally visible observations (for example a
cabinet scratch, wall mark, tile stain) and several clean images so the
AI has both positive and negative examples.

# 20. Hackathon Demo Plan

The current hackathon requires a live working demo where possible, a
public GitHub repository, a README, a 2-4 minute demo video, and
completion of the Cloudinary feedback survey. The code freeze is listed
as 3 October 2026 at 18:45 UTC on the current HackIndia page. \[4\]

## 20.1 Recommended 2-4 Minute Story

1.  0:00-0:20 - Show the problem: scattered inspection photos with no
    reliable history.

2.  0:20-0:55 - Start a Move-In inspection and upload 4-6 photos.

3.  0:55-1:20 - Show Cloudinary-managed assets and AI-assisted
    room/issue observations.

4.  1:20-1:45 - Human reviews and confirms one possible scratch/stain.

5.  1:45-2:15 - Open the property timeline: Move-In -\> Inspection -\>
    Move-Out.

6.  2:15-2:45 - Search: “show bathroom images from the previous
    inspection”.

7.  2:45-3:15 - Open comparison view and show prior/current evidence
    side-by-side.

8.  3:15-3:40 - Explain why Cloudinary is core: upload, metadata, AI
    workflow, search, transformations, delivery.

9.  3:40-4:00 - Close with future expansion to a multi-property
    inspection platform.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>DEMO BACKUP<br />
</strong>Have the seeded demo dataset already processed. If an external
AI service is slow or unavailable, the UI should still demonstrate
timeline, search, comparison, and review using the stored outputs.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 21. Hackathon Alignment Checklist

| **Requirement from current hackathon page**                    | **RentalMove response**                                                                 |
|----------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Use Cloudinary as active part of product                       | Yes - core media lifecycle and metadata/search/workflows.                               |
| Upload/manage/transform/optimize/search/generate/deliver media | Yes - upload, metadata, transformations, search, delivery; AI analysis where available. |
| Live working demo where possible                               | Yes - browser app with seeded fallback.                                                 |
| Public GitHub repository                                       | Yes - required for submission.                                                          |
| README explaining track, problem, Cloudinary usage, testing    | Yes - required deliverable.                                                             |
| 2-4 minute demo video                                          | Yes - scripted above.                                                                   |
| Feedback survey                                                | Mandatory for prize consideration; team must complete it.                               |
| No credentials in public repo                                  | Enforce via environment variables and pre-submit secret scan.                           |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>TRACK POSITIONING<br />
</strong>Track 1 is the clearest technical story because media enters
the system and is automatically ingested, organized, enriched, analyzed,
searchable and delivered. Track 3 is a viable product framing if the
team wants to emphasize the startup/workflow story. The submission must
choose one track.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 22. Product Differentiation & Market Hypothesis

Virtual inspection tools and property-management software already exist,
so the goal is not to claim invention of “property photos”. The
differentiation is the media workflow: convert unstructured visual
evidence into a persistent, room-aware, searchable property memory that
can be revisited across inspection events.

| **Existing behavior**                 | **RentalMove behavior**                       |
|---------------------------------------|-----------------------------------------------|
| “Upload 80 photos.”                   | “Create a structured visual record.”          |
| Folder names / filenames              | Property + inspection + room + metadata       |
| Manual search                         | Structured search and filtering               |
| One-time inspection report            | Longitudinal visual timeline                  |
| Human-only review                     | AI-assisted observations + human confirmation |
| Separate move-in and move-out folders | Linked evidence across the property timeline  |

The market hypothesis is: tenants value better documentation and
managers value faster inspection retrieval/review. The hackathon MVP
should validate the workflow rather than attempt to prove a full
commercial market.

# 23. Decisions the Team Should Lock Before Coding

- Are we supporting photos only for MVP, with video as a stretch goal?
  Recommended: yes.

- Will AI analysis be Cloudinary-native, external, or hybrid?
  Recommended: Cloudinary-first, external only if needed.

- Which 4-6 rooms will the demo support? Recommended: living room,
  kitchen, bathroom, bedroom, optionally exterior.

- Which 4-6 issue categories will we recognize? Recommended: scratch,
  stain, crack, dent, mark, other.

- Will comparison be automatic or user-selected? Recommended:
  user-selected first, AI-assisted later.

- What is the exact fallback if AI is unavailable? Recommended: manual
  tagging and seeded demo results.

- What is the minimum “Cloudinary wow” moment? Recommended: upload -\>
  metadata/AI -\> searchable timeline.

# 24. Definition of Done

- User can create a property and inspection.

- User can upload at least 4 photos successfully.

- Assets are stored in Cloudinary and have meaningful metadata.

- At least one AI-assisted observation works or is represented by a
  clearly defined fallback workflow.

- User can review an observation.

- Timeline shows multiple inspection states.

- Search returns the correct historical assets.

- Comparison screen works for at least one room/area.

- Cloudinary role is visible in the README and demo.

- No API secrets are present in the repository.

- GitHub repo is public and has setup/test instructions.

- Demo video is between 2 and 4 minutes.

# 25. Current References & Sources

The following references were checked while preparing this document.
Because hackathon rules and pricing can change, the team should re-open
the official pages immediately before submission.

**\[1\] Cloudinary Structured Metadata documentation:**
https://cloudinary.com/documentation/structured_metadata - Typed fields,
validation and search support; last updated Jun 2026.

**\[2\] Cloudinary Search documentation:**
https://cloudinary.com/documentation/search_method - Asset search by
metadata/tags and related attributes.

**\[3\] Cloudinary MediaFlows product page:**
https://cloudinary.com/products/mediaflows - Current free tier:
\$0/month, 100 asset touchpoints/month, 3 workflows, 20 premium asset
touchpoints.

**\[4\] HackIndia - Pixels to Products Cloudinary AI Hackathon 2026:**
https://hackindia.org/2026/pixels-to-products-cloudinary-ai-hackathon-2026 -
Current tracks, required Cloudinary use, repo/demo/survey requirements,
and code freeze.

**\[5\] Cloudinary Billing and Plans:**
https://cloudinary.com/documentation/billing_and_plans - Current Free
plan: 25 credits/month; credit definitions.

**\[6\] Cloudinary MediaFlows documentation:**
https://cloudinary.com/documentation/mediaflows - Workflow automation
overview and current platform documentation.

# Appendix A - Example Demo Data

| **Property** | **Inspection**  | **Room**    | **Example observation**              |
|--------------|-----------------|-------------|--------------------------------------|
| \#381        | Move-In 2024    | Living Room | None                                 |
| \#381        | Move-In 2024    | Kitchen     | Possible scratch on lower cabinet    |
| \#381        | Move-In 2024    | Bathroom    | Possible water stain                 |
| \#381        | Inspection 2025 | Kitchen     | Existing cabinet mark reviewed       |
| \#381        | Inspection 2026 | Bathroom    | New visible discoloration for review |
| \#381        | Move-Out 2026   | Kitchen     | Current cabinet photo for comparison |

# Appendix B - Suggested Repository Structure

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>rentalmove/<br />
apps/<br />
web/<br />
api/<br />
packages/<br />
types/<br />
cloudinary/<br />
supabase/<br />
migrations/<br />
seed/<br />
docs/<br />
architecture.md<br />
demo-script.md<br />
scripts/<br />
seed-demo-assets.ts<br />
.env.example<br />
README.md</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>FINAL TEAM POSITION<br />
</strong>Build the visual memory and inspection workflow first. The
“smartness” should come from organizing, enriching, finding and
comparing media through Cloudinary, not from trying to solve every
computer-vision problem at once.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

// View model the pages render. Built from GET /api/properties/:id/snapshot by lib/view.ts.

export type RoomCategory = "living_room" | "kitchen" | "bathroom" | "bedroom" | "exterior" | "unknown";
export type IssueCategory = "scratch" | "stain" | "crack" | "dent" | "mark" | "other";
export type InspectionType = "move_in" | "inspection" | "move_out";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "edited";
export type AnalysisStatus =
  | "queued"
  | "running"
  | "done"
  | "completed"
  | "failed"
  | "quota_limited"
  | "retryable";
export type UserRole = "tenant" | "owner";
/** Normalized [x1, y1, x2, y2], each 0..1. */
export type BBox = [number, number, number, number];

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  initials: string;
  assigned_property_id?: string;
  owned_properties?: string[];
}

export interface Property {
  id: string;
  address_label: string;
  unit_label: string;
  owner_id?: string;
  status: "move_out_in_progress" | "active" | "no_inspections";
  cover?: string;
}

export interface Room {
  id: string;
  property_id: string;
  name: string;
  category: RoomCategory;
}

export interface Inspection {
  id: string;
  property_id: string;
  type: InspectionType;
  captured_at: string;
  status: "in_progress" | "completed";
  captured_by: string;
  /** User id of whoever ran the inspection (decides on its findings). */
  created_by: string | null;
}

export interface Asset {
  id: string;
  inspection_id: string;
  room_id: string;
  cloudinary_public_id: string;
  cloudinary_version?: number | null;
  /** Display URL (Cloudinary review rendition, 1600 px). */
  src: string;
  /** Light full-frame rendition (720 px, never cropped — finding boxes stay valid). */
  thumb: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  captured_at: string;
  analysis_status: AnalysisStatus;
  analysis_error?: string | null;
  people_detected?: boolean;
  staged?: boolean;
  reused_of?: string | null;
  reuse_distance?: number | null;
  image_quality?: string | null;
  /** From the file's EXIF via Cloudinary; undefined = not fingerprinted with EXIF yet. */
  exif?: { taken_at: string | null; software: string | null; camera: string | null } | null;
  /** When the photo reached RentalMove. */
  uploaded_at?: string;
}

export interface Observation {
  id: string;
  asset_id: string;
  category: IssueCategory;
  sub_area: string;
  description: string;
  confidence: number;
  bbox: BBox;
  review_status: ReviewStatus;
  reviewer_note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  pre_existing?: boolean;
  matches?: string | null;
  source: "ai" | "human";
}

export interface ComparisonChange {
  description: string;
  confidence: number;
  region: string;
  bbox?: BBox;
  kind: "new" | "worsened" | "pixel";
  grounded?: boolean;
}

export interface Comparison {
  id: string;
  room_id: string;
  prior_asset_id: string;
  current_asset_id: string;
  summary: string;
  changes: ComparisonChange[];
  caveats: string[];
  model_version: string;
  created_at: string;
}

export interface PipelineEvent {
  id: string;
  at: string;
  stage: string;
  label: string;
  detail: string;
  asset_id?: string | null;
  actor?: string | null;
}

export interface SearchFilter {
  room?: RoomCategory;
  inspection_type?: InspectionType;
  issue_category?: IssueCategory;
  review_status?: ReviewStatus;
  date_from?: string;
  date_to?: string;
  free_text?: string;
}

export interface ShareLink {
  id?: string;
  token_hint: string;
  /** Present only for links the current user created. */
  token?: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
  recipient?: string | null;
}

export type Stance = "agree" | "dispute";
export interface VoiceClip { url: string; duration: number; lang: string; transcribed: boolean }
export interface ThreadComment { id: string; author: string; role: UserRole; text: string; at: string; voice?: VoiceClip }
export interface SignatureRecord { at: string; hash: string; name: string }

export interface RoomMatch { verdict: "first" | "match" | "unclear" | "mismatch" | "confirmed"; reason: string | null; ref: string | null; view: number | null; phash: number | null; by: string | null; at: string }
export interface PrivacyRegion { id: string; bbox: BBox; source: "ocr" | "ai" | "manual"; label: string; by: string | null; at: string }
export interface OcrBudget { used: number; cap: number; available: boolean; reason: string | null }

export interface Calibration { line: BBox; cm: number; reference: string; by: string | null; at: string }
export interface Measure { extent: number; long_side: number; bbox_area: number; extent_prior: number | null; prior_asset_id: string | null; at: string }
export type WorkOrderStatus = "open" | "in_progress" | "done";
export interface RepairCheck { verdict: "reduced" | "unchanged" | "unclear"; same_view: boolean; view_match: number; extent_before: number; extent_after: number }
export interface WorkOrder {
  id: string;
  observation_id: string;
  status: WorkOrderStatus;
  assignee: string;
  note: string;
  due: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  photo: { public_id: string; secure_url: string; sha256: string | null; by: string | null; at: string; check: RepairCheck | null } | null;
  history: { at: string; by: string | null; text: string }[];
}

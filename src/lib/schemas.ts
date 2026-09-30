import { z } from "zod";

// --- Enums ---
export const RoomCategoryEnum = z.enum([
  "living_room",
  "kitchen",
  "bathroom",
  "bedroom",
  "exterior",
  "unknown",
]);
export type RoomCategory = z.infer<typeof RoomCategoryEnum>;

export const ImageQualityEnum = z.enum(["ok", "blurry", "too_dark", "not_a_room"]);
export type ImageQuality = z.infer<typeof ImageQualityEnum>;

export const IssueCategoryEnum = z.enum([
  "none",
  "scratch",
  "stain",
  "crack",
  "dent",
  "mark",
  "other",
]);
export type IssueCategory = z.infer<typeof IssueCategoryEnum>;

export const InspectionTypeEnum = z.enum(["move_in", "inspection", "move_out"]);
export type InspectionType = z.infer<typeof InspectionTypeEnum>;

export const ReviewStatusEnum = z.enum(["pending", "accepted", "rejected", "edited"]);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;

export const AnalysisStatusEnum = z.enum(["queued", "running", "done", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatusEnum>;

export const ObservationSourceEnum = z.enum(["ai", "human"]);
export type ObservationSource = z.infer<typeof ObservationSourceEnum>;

// --- Observation & AI Analysis Schemas ---
export const BoundingBoxSchema = z.tuple([
  z.number().min(0).max(1), // x1
  z.number().min(0).max(1), // y1
  z.number().min(0).max(1), // x2
  z.number().min(0).max(1), // y2
]);
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const ObservationItemSchema = z.object({
  category: z.enum(["scratch", "stain", "crack", "dent", "mark", "other"]),
  sub_area: z.string().default("general"),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  bbox: BoundingBoxSchema,
  /** The model's own "I am not sure about this one" (lib/certainty.ts). */
  unsure: z.boolean().optional(),
});
export type ObservationItem = z.infer<typeof ObservationItemSchema>;

export const ImageAnalysisSchema = z.object({
  room_guess: RoomCategoryEnum,
  image_quality: ImageQualityEnum,
  observations: z.array(ObservationItemSchema).default([]),
  /** Room areas visible in the photo (lib/coverage.ts vocabulary). */
  visible_areas: z.array(z.string()).optional(),
  /** False when the model cannot judge the photo (glare, too far, view blocked…). */
  can_assess: z.boolean().optional(),
  assess_note: z.string().max(200).optional(),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

export const ComparisonChangeSchema = z.object({
  description: z.string(),
  confidence: z.number().min(0).max(1),
  /** Which part of the matched frame the change was seen in, e.g. "top-left". */
  region: z.string().optional(),
  /** new = not visible before; worsened = visible before, more now; pixel = pixel change the model did not describe. */
  kind: z.enum(["new", "worsened", "pixel"]).optional(),
  /** Location in the current photo, normalised [x1,y1,x2,y2]. */
  bbox: BoundingBoxSchema.optional(),
  /** True when the box was snapped onto a region whose pixels actually changed. */
  grounded: z.boolean().optional(),
});

export const ComparisonResultSchema = z.object({
  summary: z.string(),
  changes: z.array(ComparisonChangeSchema).default([]),
  caveats: z.array(z.string()).default([]),
});
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

// --- Search Filter Schema (whitelisted only) ---
export const SearchFilterSchema = z.object({
  room: RoomCategoryEnum.optional(),
  inspection_type: InspectionTypeEnum.optional(),
  issue_category: IssueCategoryEnum.optional(),
  review_status: ReviewStatusEnum.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date_from format YYYY-MM-DD").optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date_to format YYYY-MM-DD").optional(),
  free_text: z.string().max(100).optional(),
});
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

// --- User & Role Schemas ---
export const UserRoleEnum = z.enum(["tenant", "owner"]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: UserRoleEnum,
  assigned_property_id: z.string().optional(),
  owned_properties: z.array(z.string()).default([]),
  created_at: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// --- Database Entity Schemas ---
export const PropertySchema = z.object({
  id: z.string(),
  address_label: z.string(),
  unit_label: z.string(),
  owner_id: z.string().optional(),
  created_at: z.string(),
});
export type Property = z.infer<typeof PropertySchema>;

export const PropertyCreateSchema = z.object({
  address_label: z.string().min(1, "Address is required"),
  unit_label: z.string().min(1, "Unit label is required"),
  owner_id: z.string().optional(),
  rooms: z.array(z.object({
    name: z.string(),
    category: RoomCategoryEnum,
  })).optional(),
});
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>;

export const PropertyTenantSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  tenant_id: z.string(),
  created_at: z.string(),
});
export type PropertyTenant = z.infer<typeof PropertyTenantSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  name: z.string(),
  category: RoomCategoryEnum,
  created_at: z.string().optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const InspectionSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  type: InspectionTypeEnum,
  captured_at: z.string(),
  created_by: z.string().nullable().optional(),
  status: z.enum(["in_progress", "completed"]).default("completed"),
  created_at: z.string(),
});
export type Inspection = z.infer<typeof InspectionSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  inspection_id: z.string(),
  room_id: z.string(),
  cloudinary_public_id: z.string(),
  secure_url: z.string().url(),
  resource_type: z.enum(["image", "video"]).default("image").optional(),
  format: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  bytes: z.number().optional(),
  etag: z.string().optional(),
  sha256: z.string().optional(),
  captured_at: z.string(),
  analysis_status: AnalysisStatusEnum.default("queued"),
  analysis_error: z.string().nullable().optional(),
  room_guess: RoomCategoryEnum.optional(),
  image_quality: ImageQualityEnum.optional(),
  created_at: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const ObservationSchema = z.object({
  id: z.string(),
  asset_id: z.string(),
  category: z.enum(["scratch", "stain", "crack", "dent", "mark", "other"]),
  sub_area: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BoundingBoxSchema,
  review_status: ReviewStatusEnum.default("pending"),
  reviewer_note: z.string().nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  source: ObservationSourceEnum.default("ai"),
  edited_from: z.any().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const ComparisonSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  room_id: z.string(),
  prior_asset_id: z.string(),
  current_asset_id: z.string(),
  summary: z.string(),
  changes: z.array(ComparisonChangeSchema),
  caveats: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  review_required: z.boolean().default(true).optional(),
  model_version: z.string(),
  created_at: z.string(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const ShareLinkSchema = z.object({
  id: z.string().optional(),
  token: z.string(),
  token_hash: z.string().optional(),
  property_id: z.string(),
  inspection_id: z.string().optional(),
  created_by: z.string().nullable().optional(),
  created_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable().optional(),
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

// --- Request / Response Schemas ---
export const UploadSignRequestSchema = z.object({
  property_id: z.string(),
  inspection_id: z.string(),
  room: RoomCategoryEnum,
  timestamp: z.number().optional(),
});
export type UploadSignRequest = z.infer<typeof UploadSignRequestSchema>;

export const AssetRegisterRequestSchema = z.object({
  property_id: z.string(),
  inspection_id: z.string(),
  room_id: z.string(),
  cloudinary_public_id: z.string(),
  secure_url: z.string().url(),
  resource_type: z.enum(["image", "video"]).default("image").optional(),
  etag: z.string().optional(),
  sha256: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  captured_at: z.string().optional(),
});
export type AssetRegisterRequest = z.infer<typeof AssetRegisterRequestSchema>;

export const ShareCreateSchema = z.object({
  property_id: z.string().min(1),
  inspection_id: z.string().optional(),
  expires_in_days: z.number().int().min(1).max(90).default(14),
  /** Printed into every shared image (per-recipient watermark) so a leak can be traced. */
  recipient: z.string().trim().min(1).max(40).optional(),
});
export type ShareCreate = z.infer<typeof ShareCreateSchema>;

export const ObservationUpdateSchema = z.object({
  review_status: ReviewStatusEnum,
  reviewer_note: z.string().optional(),
  edited_category: z.enum(["scratch", "stain", "crack", "dent", "mark", "other"]).optional(),
  edited_description: z.string().optional(),
  edited_sub_area: z.string().optional(),
});
export type ObservationUpdate = z.infer<typeof ObservationUpdateSchema>;

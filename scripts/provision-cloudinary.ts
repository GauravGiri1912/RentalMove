import { v2 as cloudinary } from "cloudinary";

/**
 * Idempotent provisioning script for Cloudinary Structured Metadata Fields.
 * Hackathon: Pixels to Products 2026, Track 1 (AI Media Pipelines)
 */

interface FieldDefinition {
  external_id: string;
  label: string;
  type: "string" | "enum" | "date" | "integer";
  values?: Array<{ value: string; label: string }>;
}

const METADATA_FIELDS: FieldDefinition[] = [
  {
    external_id: "property_id",
    label: "Property ID",
    type: "string",
  },
  {
    external_id: "inspection_id",
    label: "Inspection ID",
    type: "string",
  },
  {
    external_id: "inspection_type",
    label: "Inspection Type",
    type: "enum",
    values: [
      { value: "move_in", label: "Move-In Baseline" },
      { value: "inspection", label: "Periodic Inspection" },
      { value: "move_out", label: "Move-Out Review" },
    ],
  },
  {
    external_id: "room",
    label: "Room Category",
    type: "enum",
    values: [
      { value: "living_room", label: "Living Room" },
      { value: "kitchen", label: "Kitchen" },
      { value: "bathroom", label: "Bathroom" },
      { value: "bedroom", label: "Bedroom" },
      { value: "exterior", label: "Exterior" },
    ],
  },
  {
    external_id: "sub_area",
    label: "Sub-Area Detail",
    type: "string",
  },
  {
    external_id: "capture_date",
    label: "Capture Date",
    type: "date",
  },
  {
    external_id: "issue_category",
    label: "Issue Category",
    type: "enum",
    values: [
      { value: "none", label: "None" },
      { value: "scratch", label: "Scratch" },
      { value: "stain", label: "Stain" },
      { value: "crack", label: "Crack" },
      { value: "dent", label: "Dent" },
      { value: "mark", label: "Mark" },
      { value: "other", label: "Other" },
    ],
  },
  {
    external_id: "review_status",
    label: "Human Review Status",
    type: "enum",
    values: [
      { value: "pending", label: "Pending Review" },
      { value: "accepted", label: "Accepted" },
      { value: "rejected", label: "Rejected" },
      { value: "edited", label: "Edited" },
    ],
  },
  {
    external_id: "ai_confidence",
    label: "AI Confidence Score",
    type: "integer",
  },
];

async function provisionCloudinaryMetadata() {
  console.log("=================================================");
  console.log("RentalMove: Cloudinary Metadata Provisioning");
  console.log("=================================================");

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret || cloudName === "demo") {
    console.log("ℹ️  Cloudinary credentials not detected or set to demo.");
    console.log("👉 Skipping live Cloudinary Admin API provisioning.");
    console.log("✅ MockMediaProvider will simulate all 9 metadata fields offline.");
    return;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  console.log(`Connected to Cloudinary cloud: ${cloudName}`);
  console.log(`Checking and provisioning ${METADATA_FIELDS.length} structured metadata fields...`);

  for (const field of METADATA_FIELDS) {
    try {
      const payload: any = {
        external_id: field.external_id,
        label: field.label,
        type: field.type,
      };

      if (field.values) {
        payload.datasource = {
          values: field.values.map((v) => ({
            external_id: v.value,
            value: v.label,
          })),
        };
      }

      await cloudinary.api.add_metadata_field(payload);
      console.log(`  + Created metadata field: [${field.external_id}] (${field.type})`);
    } catch (err: any) {
      if (
        err?.error?.message?.includes("already exists") ||
        err?.message?.includes("already exists") ||
        err?.http_code === 409
      ) {
        console.log(`  ✓ Metadata field already exists: [${field.external_id}]`);
      } else {
        console.warn(`  ⚠️ Could not create field [${field.external_id}]:`, err?.message || err);
      }
    }
  }

  console.log("\nProvisioning completed successfully.");
}

provisionCloudinaryMetadata().catch((err) => {
  console.error("Provisioning error:", err);
  process.exit(1);
});

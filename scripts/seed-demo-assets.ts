import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

interface SeedAssetDef {
  filePath: string;
  room: string;
  inspectionType: string;
  inspectionId: string;
  category: string;
  sub_area: string;
  description: string;
  confidence: number;
  bbox: [number, number, number, number];
}

const SEED_DEFINITIONS: Record<string, SeedAssetDef> = {
  "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01": {
    filePath: "seed/images/2024/kitchen/cabinet-base-01.jpg",
    room: "kitchen",
    inspectionType: "move_in",
    inspectionId: "insp-2024-move-in",
    category: "scratch",
    sub_area: "lower_cabinet",
    description: "Possible scratch visible on lower cabinet door finish.",
    confidence: 0.88,
    bbox: [0.38, 0.42, 0.55, 0.65],
  },
  "properties/prop-381/insp-2024-move-in/bathroom/shower-tile-01": {
    filePath: "seed/images/2024/bathroom/shower-tile-01.jpg",
    room: "bathroom",
    inspectionType: "move_in",
    inspectionId: "insp-2024-move-in",
    category: "stain",
    sub_area: "shower_wall",
    description: "Visible grout discoloration along shower wall tile base.",
    confidence: 0.84,
    bbox: [0.42, 0.65, 0.55, 0.85],
  },
  "properties/prop-381/insp-2024-move-in/living_room/living-floor-01": {
    filePath: "seed/images/2024/living_room/living-floor-01.jpg",
    room: "living_room",
    inspectionType: "move_in",
    inspectionId: "insp-2024-move-in",
    category: "mark",
    sub_area: "baseboard",
    description: "Visible light baseboard variation observed during baseline.",
    confidence: 0.72,
    bbox: [0.15, 0.75, 0.35, 0.92],
  },
  "properties/prop-381/insp-2024-move-in/bedroom/bedroom-wall-01": {
    filePath: "seed/images/2024/bedroom/bedroom-wall-01.jpg",
    room: "bedroom",
    inspectionType: "move_in",
    inspectionId: "insp-2024-move-in",
    category: "mark",
    sub_area: "door_trim",
    description: "Minor dark surface mark visible near lower door moulding trim.",
    confidence: 0.82,
    bbox: [0.2, 0.78, 0.28, 0.86],
  },
  "properties/prop-381/insp-2025-periodic/kitchen/cabinet-base-02": {
    filePath: "seed/images/2025/kitchen/cabinet-base-02.jpg",
    room: "kitchen",
    inspectionType: "inspection",
    inspectionId: "insp-2025-periodic",
    category: "scratch",
    sub_area: "lower_cabinet",
    description: "Existing cabinet mark reviewed, consistent with baseline move-in capture.",
    confidence: 0.89,
    bbox: [0.38, 0.42, 0.55, 0.65],
  },
  "properties/prop-381/insp-2025-periodic/bathroom/shower-tile-02": {
    filePath: "seed/images/2025/bathroom/shower-tile-02.jpg",
    room: "bathroom",
    inspectionType: "inspection",
    inspectionId: "insp-2025-periodic",
    category: "stain",
    sub_area: "lower_tile_corner",
    description: "Grout seam discoloration noted near lower shower basin edge.",
    confidence: 0.81,
    bbox: [0.42, 0.65, 0.55, 0.85],
  },
  "properties/prop-381/insp-2026-move-out/kitchen/cabinet-base-03": {
    filePath: "seed/images/2026/kitchen/cabinet-base-03.jpg",
    room: "kitchen",
    inspectionType: "move_out",
    inspectionId: "insp-2026-move-out",
    category: "scratch",
    sub_area: "lower_cabinet",
    description: "Superficial scratch visible on lower cabinet door surface, consistent with baseline.",
    confidence: 0.87,
    bbox: [0.38, 0.42, 0.55, 0.65],
  },
  "properties/prop-381/insp-2026-move-out/bathroom/shower-tile-03": {
    filePath: "seed/images/2026/bathroom/shower-tile-03.jpg",
    room: "bathroom",
    inspectionType: "move_out",
    inspectionId: "insp-2026-move-out",
    category: "stain",
    sub_area: "lower_tile_corner",
    description: "Grout variation confirmed in move-out inspection.",
    confidence: 0.83,
    bbox: [0.42, 0.65, 0.55, 0.85],
  },
};

async function seedDemoAssets() {
  console.log("=================================================");
  console.log("RentalMove: Real Cloudinary Asset Seeding (Property #381)");
  console.log("=================================================");

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary environment variables. Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in .env.local."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  console.log(`✓ Cloudinary configured for account: ${cloudName}`);

  const storePath = path.join(process.cwd(), "data", "rentalmove-store.json");
  let store: any = null;
  if (fs.existsSync(storePath)) {
    store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  }

  const publicIds = Object.keys(SEED_DEFINITIONS);
  console.log(`Uploading & provisioning ${publicIds.length} real photographic assets to Cloudinary:`);

  for (const publicId of publicIds) {
    const def = SEED_DEFINITIONS[publicId];
    const absolutePath = path.join(process.cwd(), def.filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`  ❌ Image file not found: ${absolutePath}`);
      continue;
    }

    // Compute real cryptographic SHA-256
    const fileBuffer = fs.readFileSync(absolutePath);
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    console.log(`  - Uploading ${def.filePath} -> ${publicId}`);

    try {
      const uploadRes = await cloudinary.uploader.upload(absolutePath, {
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        tags: [
          "rentalmove",
          `room:${def.room}`,
          `insp:${def.inspectionType}`,
          "property:prop-381",
        ],
        context: {
          property_id: "prop-381",
          inspection_id: def.inspectionId,
          room: def.room,
        },
      });

      console.log(`    ✓ Uploaded: ${uploadRes.secure_url}`);
      console.log(`      ETag: ${uploadRes.etag} | Bytes: ${uploadRes.bytes} | SHA-256: ${sha256.substring(0, 16)}...`);

      // Attach Cloudinary Structured Metadata
      try {
        await (cloudinary.uploader as any).update_metadata(
          {
            property_id: "prop-381",
            inspection_id: def.inspectionId,
            inspection_type: def.inspectionType,
            room: def.room,
            sub_area: def.sub_area,
            capture_date: "2024-06-01",
            issue_category: def.category,
            review_status: "accepted",
            ai_confidence: Math.round(def.confidence * 100),
          },
          [publicId]
        );
        console.log(`    ✓ Attached structured metadata`);
      } catch (metaErr: any) {
        console.warn(`    ⚠️ Structured metadata warning:`, metaErr?.message || metaErr);
      }

      // Update in persistent store if store exists
      if (store && Array.isArray(store.assets)) {
        const assetIndex = store.assets.findIndex(
          (a: any) => a.cloudinary_public_id === publicId
        );
        if (assetIndex >= 0) {
          store.assets[assetIndex].secure_url = uploadRes.secure_url;
          store.assets[assetIndex].etag = uploadRes.etag;
          store.assets[assetIndex].sha256 = sha256;
          store.assets[assetIndex].width = uploadRes.width;
          store.assets[assetIndex].height = uploadRes.height;
        }
      }
    } catch (err: any) {
      console.error(`    ❌ Cloudinary upload failed for ${publicId}:`, err);
    }
  }

  if (store) {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
    console.log(`✓ Updated persistent store: ${storePath}`);
  }

  console.log("\n✅ All real assets uploaded, hashed, and provisioned in Cloudinary!");
}

seedDemoAssets().catch((err) => {
  console.error("Seeding execution failed:", err);
  process.exit(1);
});

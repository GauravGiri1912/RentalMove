import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { computeSha256 } from "../src/lib/hash";
import analysisData from "../seed/analysis.json";

async function seedDemoAssets() {
  console.log("=================================================");
  console.log("RentalMove: Seed Demo Assets (Property #381)");
  console.log("=================================================");

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const hasCloudinary = Boolean(cloudName && apiKey && apiSecret && cloudName !== "demo");

  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    console.log(`✓ Cloudinary configured: ${cloudName}`);
  } else {
    console.log("ℹ️  Cloudinary credentials not detected; running in mock verification mode.");
  }

  const seedDir = path.join(process.cwd(), "seed", "images");
  if (!fs.existsSync(seedDir)) {
    fs.mkdirSync(seedDir, { recursive: true });
  }

  // Iterate over pre-computed analysis keys
  const publicIds = Object.keys(analysisData);
  console.log(`Processing ${publicIds.length} seeded assets from analysis.json:`);

  for (const publicId of publicIds) {
    const analysis = (analysisData as any)[publicId];
    console.log(`  - [Asset] ${publicId}`);
    console.log(`    Room guess: ${analysis.room_guess} | Observations: ${analysis.observations.length}`);

    // If live Cloudinary, ensure remote upload exists or upload demo placeholder
    if (hasCloudinary) {
      try {
        const check = await cloudinary.api.resource(publicId);
        console.log(`    ✓ Verified asset in Cloudinary (etag: ${check.etag})`);
      } catch (err: any) {
        console.log(`    + Creating asset in Cloudinary for demo...`);
        // Upload a placeholder color SVG as base
        const sampleBase64 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="100%" height="100%" fill="%23223046"/><text x="50%" y="50%" fill="white" font-size="36" font-family="sans-serif" text-anchor="middle">${publicId}</text></svg>`;
        await cloudinary.uploader.upload(sampleBase64, {
          public_id: publicId,
          tags: ["rentalmove", `room:${analysis.room_guess}`],
          context: {
            property_id: "prop-381",
            room: analysis.room_guess,
          },
        });
        console.log(`    ✓ Uploaded demo asset successfully.`);
      }
    }
  }

  console.log("\n✅ Demo seeding completed successfully.");
}

seedDemoAssets().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});

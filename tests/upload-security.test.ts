import { describe, it, expect } from "vitest";
import { getMediaProvider } from "../src/lib/media";
import { UploadSignRequestSchema } from "../src/lib/schemas";
import { loadGray, ANALYSIS_WIDTH } from "../src/lib/pixel-node";
import sharp from "sharp";

describe("Phase 4: Cloudinary Upload Security & Media Optimization", () => {
  it("1. signUpload enforces allowed formats, resource type, and 20MB file limit", async () => {
    const media = getMediaProvider();
    const sig = await media.signUpload({
      propertyId: "prop-381",
      inspectionId: "insp-2024-move-in",
      inspectionType: "move_in",
      room: "kitchen",
    });

    expect(sig.allowedFormats).toBe("jpg,png,webp");
    expect(sig.resourceType).toBe("image");
    expect(sig.maxFileSize).toBe(20 * 1024 * 1024);
    expect(sig.folder).toBe("properties/prop-381/insp-2024-move-in/kitchen");
  });

  it("2. UploadSignRequestSchema rejects oversized files (>20MB) and invalid formats", () => {
    // Valid request
    const valid = UploadSignRequestSchema.safeParse({
      property_id: "prop-381",
      inspection_id: "insp-1",
      room: "kitchen",
      file_size: 5 * 1024 * 1024,
      format: "jpg",
    });
    expect(valid.success).toBe(true);

    // Oversized (>20MB)
    const oversized = UploadSignRequestSchema.safeParse({
      property_id: "prop-381",
      inspection_id: "insp-1",
      room: "kitchen",
      file_size: 25 * 1024 * 1024,
    });
    expect(oversized.success).toBe(false);

    // Unsupported format
    const badFormat = UploadSignRequestSchema.safeParse({
      property_id: "prop-381",
      inspection_id: "insp-1",
      room: "kitchen",
      format: "exe",
    });
    expect(badFormat.success).toBe(false);
  });

  it("3. loadGray processes buffer images at analysis width", async () => {
    // Create a 200x200 test image in memory with sharp
    const testBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();

    const gray = await loadGray(testBuffer, ANALYSIS_WIDTH);
    expect(gray.w).toBe(ANALYSIS_WIDTH);
    expect(gray.h).toBe(ANALYSIS_WIDTH);
    expect(gray.data.length).toBe(ANALYSIS_WIDTH * ANALYSIS_WIDTH);
  });
});

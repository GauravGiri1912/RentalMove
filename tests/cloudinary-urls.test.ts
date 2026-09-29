import { describe, it, expect } from "vitest";
import {
  thumbUrl,
  reviewUrl,
  vlmUrl,
  sharedUrl,
  matchedUrl,
  matchedTileUrl,
  evidenceUrl,
  toPublicId,
} from "../src/lib/cloudinary-urls";

describe("Cloudinary URL & Transformation Pipeline", () => {
  const samplePublicId = "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01";
  const sampleUrl = `https://res.cloudinary.com/demo/image/upload/v12345/${samplePublicId}.jpg`;

  it("extracts public_id accurately from full URLs or bare IDs", () => {
    expect(toPublicId(samplePublicId)).toBe(samplePublicId);
    expect(toPublicId(sampleUrl)).toBe(samplePublicId);
  });

  it("generates privacy-preserving face pixelated URLs for shared reports", () => {
    const url = sharedUrl(samplePublicId);
    expect(url).toContain("e_pixelate_faces:20");
    expect(url).toContain(samplePublicId);
  });

  it("generates matched crop and auto-contrast renditions for comparison", () => {
    const url = matchedUrl(samplePublicId);
    expect(url).toContain("c_fill,g_auto,w_1600,h_1200,e_auto_brightness,e_auto_contrast");
    expect(url).toContain("c_limit,w_1024,f_jpg,q_auto");
  });

  it("generates matched tile-by-tile quadrant crop URLs", () => {
    const tileUrl = matchedTileUrl(samplePublicId, { col: 0, row: 0, grid: 2 });
    expect(tileUrl).toContain("c_crop,g_north_west,w_0.5000,h_0.5000,x_0.0000,y_0.0000");

    const tileBottomRight = matchedTileUrl(samplePublicId, { col: 1, row: 1, grid: 2 });
    expect(tileBottomRight).toContain("c_crop,g_north_west,w_0.5000,h_0.5000,x_0.5000,y_0.5000");
  });

  it("constructs genuine Cloudinary evidence overlay URLs with hollow boxes and labels", () => {
    const url = evidenceUrl(
      samplePublicId,
      [
        {
          bbox: [0.38, 0.42, 0.55, 0.65],
          label: "scratch 88%",
        },
      ],
      { pixelateFaces: true }
    );

    expect(url).toContain("e_pixelate_faces:20");
    expect(url).toContain("l_rentalmove_ui:px");
    expect(url).toContain("co_rgb:ef4444"); // Red box layer
    expect(url).toContain("l_text:Arial_28_bold:scratch%2088"); // Label chip layer
    expect(url).toContain(samplePublicId);
  });
});

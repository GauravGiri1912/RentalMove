import { describe, it, expect } from "vitest";
import {
  filterObservations,
  filterComparisonChanges,
  iou,
  MAX_BOX_AREA,
  MIN_CONFIDENCE,
} from "../src/lib/observation-filter";
import { ObservationItem } from "../src/lib/schemas";

describe("Hallucination & Observation Filtering", () => {
  it("drops observations when image quality is not ok (blurry, dark, not_a_room)", () => {
    const rawObs: ObservationItem[] = [
      {
        category: "scratch",
        sub_area: "wall",
        description: "Possible scratch on wall",
        confidence: 0.9,
        bbox: [0.1, 0.1, 0.3, 0.3],
      },
    ];

    const resultBlurry = filterObservations(rawObs, "blurry");
    expect(resultBlurry.kept.length).toBe(0);
    expect(resultBlurry.dropped[0].reason).toBe("image_quality");

    const resultDark = filterObservations(rawObs, "too_dark");
    expect(resultDark.kept.length).toBe(0);

    const resultNotRoom = filterObservations(rawObs, "not_a_room");
    expect(resultNotRoom.kept.length).toBe(0);
  });

  it("filters out whole-photo boxes that fail to localize surface features (area > 70%)", () => {
    const rawObs: ObservationItem[] = [
      {
        category: "other",
        sub_area: "general",
        description: "Visible texture variation across entire frame",
        confidence: 0.85,
        bbox: [0, 0, 1, 1], // 100% of photo
      },
      {
        category: "scratch",
        sub_area: "cabinet",
        description: "Visible scratch on cabinet door",
        confidence: 0.85,
        bbox: [0.2, 0.2, 0.4, 0.4], // 4% of photo
      },
    ];

    const { kept, dropped } = filterObservations(rawObs, "ok");
    expect(kept.length).toBe(1);
    expect(kept[0].category).toBe("scratch");
    expect(dropped.some((d) => d.reason === "box_too_large")).toBe(true);
  });

  it("filters out fake findings containing 'AI analysis unavailable' or 'manual review required'", () => {
    const rawObs: ObservationItem[] = [
      {
        category: "other",
        sub_area: "general",
        description: "AI analysis unavailable. Manual review required.",
        confidence: 0.5,
        bbox: [0.1, 0.1, 0.3, 0.3],
      },
    ];

    const { kept, dropped } = filterObservations(rawObs, "ok");
    expect(kept.length).toBe(0);
    expect(dropped[0].reason).toBe("placeholder");
  });

  it("filters out negative statements ('no visible damage', 'clean condition', 'pristine')", () => {
    const rawObs: ObservationItem[] = [
      {
        category: "other",
        sub_area: "room",
        description: "No visible damage observed in this room",
        confidence: 0.9,
        bbox: [0.1, 0.1, 0.3, 0.3],
      },
      {
        category: "other",
        sub_area: "floor",
        description: "Appears clean and in good condition",
        confidence: 0.88,
        bbox: [0.1, 0.1, 0.3, 0.3],
      },
    ];

    const { kept, dropped } = filterObservations(rawObs, "ok");
    expect(kept.length).toBe(0);
    expect(dropped.every((d) => d.reason === "negative_statement")).toBe(true);
  });

  it("deduplicates overlapping boxes of the same category using IoU threshold", () => {
    const rawObs: ObservationItem[] = [
      {
        category: "scratch",
        sub_area: "cabinet",
        description: "Visible scratch on cabinet",
        confidence: 0.92,
        bbox: [0.2, 0.2, 0.4, 0.4],
      },
      {
        category: "scratch",
        sub_area: "cabinet",
        description: "Possible scratch on cabinet door edge",
        confidence: 0.78, // lower confidence duplicate
        bbox: [0.21, 0.21, 0.39, 0.39], // heavy overlap
      },
    ];

    const { kept, dropped } = filterObservations(rawObs, "ok");
    expect(kept.length).toBe(1);
    expect(kept[0].confidence).toBe(0.92);
    expect(dropped.some((d) => d.reason === "duplicate")).toBe(true);
  });

  it("calculates accurate IoU values", () => {
    const b1: [number, number, number, number] = [0, 0, 0.5, 0.5];
    const b2: [number, number, number, number] = [0, 0, 0.5, 0.5];
    expect(iou(b1, b2)).toBe(1.0);

    const b3: [number, number, number, number] = [0.5, 0.5, 1.0, 1.0];
    expect(iou(b1, b3)).toBe(0.0);
  });

  it("filters non-changes from comparison results", () => {
    const changes = [
      {
        description: "No visible changes observed since baseline",
        confidence: 0.9,
      },
      {
        description: "Surface condition remains identical and consistent with prior capture",
        confidence: 0.85,
      },
      {
        description: "Visible surface scratch appearing near baseboard not seen in prior baseline",
        confidence: 0.88,
      },
    ];

    const filtered = filterComparisonChanges(changes);
    expect(filtered.length).toBe(1);
    expect(filtered[0].description).toContain("Visible surface scratch");
  });
});

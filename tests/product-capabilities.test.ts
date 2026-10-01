import { describe, it, expect, beforeEach } from "vitest";
import {
  isSameSpot,
  iou,
  centreDist,
  getMatchingConfig,
  setMatchingConfig,
  resetMatchingConfig,
  DEFAULT_MATCHING_CONFIG,
} from "@/lib/matching-config";
import {
  getFloorPlanForProperty,
  hasPlan,
  PLAN_ROOMS,
} from "@/lib/floorplan";

describe("Phase 12 — Product Capability Corrections", () => {
  describe("Pixel Matching Thresholds & Finding Grounding", () => {
    beforeEach(() => {
      resetMatchingConfig();
    });

    it("matches findings with significant IoU overlap (True Positive)", () => {
      // Two boxes in the living room with ~50% overlap
      const boxA: [number, number, number, number] = [0.2, 0.2, 0.4, 0.4];
      const boxB: [number, number, number, number] = [0.25, 0.25, 0.45, 0.45];

      const overlap = iou(boxA, boxB);
      expect(overlap).toBeGreaterThan(DEFAULT_MATCHING_CONFIG.sameSpotIou);
      expect(isSameSpot(boxA, boxB)).toBe(true);
    });

    it("matches pinpoint findings by centroid proximity even when IoU is low (True Positive)", () => {
      // Two very small pinpoint scratch boxes (e.g. 0.02 x 0.02) slightly shifted
      const boxA: [number, number, number, number] = [0.5, 0.5, 0.52, 0.52];
      const boxB: [number, number, number, number] = [0.525, 0.525, 0.545, 0.545];

      const overlap = iou(boxA, boxB);
      const dist = centreDist(boxA, boxB);

      // IoU is 0 (disjoint), but distance is within SAME_SPOT_DIST (0.08)
      expect(overlap).toBe(0);
      expect(dist).toBeLessThanOrEqual(DEFAULT_MATCHING_CONFIG.sameSpotDist);
      expect(isSameSpot(boxA, boxB)).toBe(true);
    });

    it("rejects findings in distant parts of the room (True Negative)", () => {
      // Box in top-left vs box in bottom-right
      const boxA: [number, number, number, number] = [0.05, 0.05, 0.15, 0.15];
      const boxB: [number, number, number, number] = [0.8, 0.8, 0.95, 0.95];

      expect(iou(boxA, boxB)).toBe(0);
      expect(centreDist(boxA, boxB)).toBeGreaterThan(DEFAULT_MATCHING_CONFIG.sameSpotDist);
      expect(isSameSpot(boxA, boxB)).toBe(false);
    });

    it("allows adjusting matching thresholds dynamically and resetting cleanly", () => {
      const boxA: [number, number, number, number] = [0.1, 0.1, 0.2, 0.2];
      const boxB: [number, number, number, number] = [0.22, 0.22, 0.32, 0.32];

      // Normally too far
      expect(isSameSpot(boxA, boxB)).toBe(false);

      // Relax distance threshold
      setMatchingConfig({ sameSpotDist: 0.25 });
      expect(getMatchingConfig().sameSpotDist).toBe(0.25);
      expect(isSameSpot(boxA, boxB)).toBe(true);

      // Reset
      resetMatchingConfig();
      expect(getMatchingConfig().sameSpotDist).toBe(DEFAULT_MATCHING_CONFIG.sameSpotDist);
      expect(isSameSpot(boxA, boxB)).toBe(false);
    });
  });

  describe("Data-Driven Floor Plan Configuration", () => {
    it("returns architectural plan with dynamic unit label for standard apartment rooms", () => {
      const standardRooms = [
        { id: "r1", name: "Living Room", category: "living_room" },
        { id: "r2", name: "Kitchen", category: "kitchen" },
        { id: "r3", name: "Bathroom", category: "bathroom" },
        { id: "r4", name: "Bedroom", category: "bedroom" },
      ];

      const spec = getFloorPlanForProperty({ unit_label: "Apt 12B" }, standardRooms);
      expect(spec.unitLabel).toBe("Apt 12B");
      expect(spec.w).toBe(1000);
      expect(spec.h).toBe(640);
      expect(spec.rooms.length).toBeGreaterThanOrEqual(4);
      expect(spec.pins.length).toBeGreaterThanOrEqual(4);
    });

    it("synthesizes dynamic proportional layout for custom non-standard room layouts", () => {
      const customRooms = [
        { id: "r1", name: "Office", category: "other" },
        { id: "r2", name: "Patio", category: "exterior" },
      ];

      const spec = getFloorPlanForProperty({ unit_label: "Studio Loft" }, customRooms);
      expect(spec.unitLabel).toBe("Studio Loft");
      expect(spec.rooms).toHaveLength(2);
      expect(spec.rooms[0].label).toBe("Office");
      expect(spec.rooms[1].label).toBe("Patio");
      expect(spec.pins).toHaveLength(2);
    });

    it("hasPlan correctly evaluates room coverage", () => {
      expect(hasPlan([])).toBe(false);
      expect(hasPlan([{ category: "living_room" }])).toBe(true);
      expect(hasPlan([{ category: "unknown" }])).toBe(false);
    });
  });
});

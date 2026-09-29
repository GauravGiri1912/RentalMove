import { describe, it, expect } from "vitest";
import {
  ImageAnalysisSchema,
  SearchFilterSchema,
  BoundingBoxSchema,
  ObservationItemSchema,
} from "../src/lib/schemas";

describe("Zod Validation Schemas", () => {
  it("validates a compliant ImageAnalysis payload", () => {
    const valid = {
      room_guess: "kitchen",
      image_quality: "ok",
      observations: [
        {
          category: "scratch",
          sub_area: "lower_cabinet",
          description: "Possible scratch visible on lower cabinet door.",
          confidence: 0.88,
          bbox: [0.1, 0.2, 0.3, 0.4],
        },
      ],
    };

    const parsed = ImageAnalysisSchema.parse(valid);
    expect(parsed.room_guess).toBe("kitchen");
    expect(parsed.observations.length).toBe(1);
    expect(parsed.observations[0].category).toBe("scratch");
  });

  it("rejects invalid normalized bounding box coordinates outside [0, 1]", () => {
    expect(() => BoundingBoxSchema.parse([-0.1, 0.5, 0.8, 0.9])).toThrow();
    expect(() => BoundingBoxSchema.parse([0.1, 0.5, 1.2, 0.9])).toThrow();
  });

  it("validates whitelisted search filters and rejects unwhitelisted fields", () => {
    const filter = SearchFilterSchema.parse({
      room: "kitchen",
      issue_category: "scratch",
      date_from: "2024-01-01",
    });

    expect(filter.room).toBe("kitchen");
    expect(filter.issue_category).toBe("scratch");
    expect(filter.date_from).toBe("2024-01-01");

    // Invalid enum value rejected
    expect(() =>
      SearchFilterSchema.parse({
        room: "invalid_room_name",
      })
    ).toThrow();
  });
});

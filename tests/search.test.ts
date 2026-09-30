import { describe, it, expect } from "vitest";
import { buildCloudinarySearchExpression, filterByCaptureDate } from "../src/lib/search";

describe("Cloudinary Search Expression Builder", () => {
  it("builds a safe Cloudinary Search expression with folder and metadata clauses", () => {
    const { expression, validatedFilter } = buildCloudinarySearchExpression(
      {
        room: "kitchen",
        issue_category: "scratch",
        review_status: "accepted",
        date_from: "2024-01-01",
      },
      "prop-381"
    );

    expect(expression).toContain("public_id:properties/prop-381*");
    expect(expression).toContain("tags:kitchen");
    expect(expression).toContain("tags:scratch");
    // Colon-containing tag values must be quoted (verified against the live Cloudinary Search API).
    expect(expression).toContain('tags:"review:accepted"');
    expect(expression).not.toContain("tags:review:accepted");
    expect(expression).not.toContain("created_at"); // upload time is never used for date search
    expect(validatedFilter.room).toBe("kitchen");
  });

  it("does not put date filters into the Cloudinary expression", () => {
    const { expression } = buildCloudinarySearchExpression(
      { date_from: "2024-01-01", date_to: "2024-12-31" },
      "prop-381"
    );
    expect(expression).toBe("public_id:properties/prop-381*");
  });

  it("filters by the stored capture date, not the upload date", () => {
    const resources = [
      { public_id: "properties/prop-381/a" },
      { public_id: "properties/prop-381/b" },
      { public_id: "properties/prop-381/c" },
      { public_id: "properties/prop-381/unknown" },
    ];
    const captured = new Map([
      ["properties/prop-381/a", "2024-06-01T10:00:00Z"],
      ["properties/prop-381/b", "2025-06-01T10:00:00Z"],
      ["properties/prop-381/c", "2024-12-31T23:30:00Z"],
    ]);

    const in2024 = filterByCaptureDate(resources, captured, { date_from: "2024-01-01", date_to: "2024-12-31" });
    expect(in2024.map((r) => r.public_id)).toEqual(["properties/prop-381/a", "properties/prop-381/c"]);

    const from2025 = filterByCaptureDate(resources, captured, { date_from: "2025-01-01" });
    expect(from2025.map((r) => r.public_id)).toEqual(["properties/prop-381/b"]);

    // No date filter: everything passes through, including photos with no known date.
    expect(filterByCaptureDate(resources, captured, {})).toHaveLength(4);
  });

  it("sanitizes property IDs and prevents expression injection", () => {
    const { expression } = buildCloudinarySearchExpression(
      { room: "bathroom" },
      "prop-381; DROP TABLE users;--"
    );

    // Expression must only contain sanitized alphanumeric ID
    expect(expression).toContain("public_id:properties/prop-381DROPTABLEusers*");
    expect(expression).not.toContain(";");
  });

  it("sanitizes free text search query", () => {
    const { expression } = buildCloudinarySearchExpression({
      free_text: "cabinet <script>alert(1)</script>",
    });

    expect(expression).not.toContain("<script>");
    expect(expression).toContain("tags:cabinet");
  });
});

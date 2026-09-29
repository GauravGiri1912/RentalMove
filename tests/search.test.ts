import { describe, it, expect } from "vitest";
import { buildCloudinarySearchExpression } from "../src/lib/search";

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

    expect(expression).toContain("folder:properties/prop-381/*");
    expect(expression).toContain("metadata.room=kitchen");
    expect(expression).toContain("metadata.issue_category=scratch");
    expect(expression).toContain("metadata.review_status=accepted");
    expect(expression).toContain("metadata.capture_date>=2024-01-01");
    expect(validatedFilter.room).toBe("kitchen");
  });

  it("sanitizes property IDs and prevents expression injection", () => {
    const { expression } = buildCloudinarySearchExpression(
      { room: "bathroom" },
      "prop-381; DROP TABLE users;--"
    );

    // Expression must only contain sanitized alphanumeric ID
    expect(expression).toContain("folder:properties/prop-381DROPTABLEusers/*");
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

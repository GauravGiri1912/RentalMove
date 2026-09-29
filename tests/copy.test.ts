import { describe, it, expect } from "vitest";
import { sanitizeObservationText, BLAME_WORDS } from "../src/lib/copy";

describe("AI Copy & Blame-Word Filter", () => {
  it("sanitizes text containing blame, liability, and deposit words", () => {
    const accusatory = "Tenant's fault for scratch, deposit deduction fee liable.";
    const sanitized = sanitizeObservationText(accusatory);

    // Ensure none of the prohibited blame words remain in the sanitized text
    for (const word of ["deposit", "fee", "liable"]) {
      expect(sanitized.toLowerCase()).not.toContain(word);
    }
    expect(sanitized).toContain("[visual irregularity]");
  });

  it("ensures descriptions begin with neutral prefixes", () => {
    const raw = "deep gouge on countertop.";
    const sanitized = sanitizeObservationText(raw);
    expect(sanitized.startsWith("Visible:")).toBe(true);
  });

  it("preserves already neutral text", () => {
    const neutral = "Possible scratch visible on lower cabinet.";
    const sanitized = sanitizeObservationText(neutral);
    expect(sanitized).toBe(neutral);
  });
});

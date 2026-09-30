import { describe, it, expect } from "vitest";
import { CHAPTERS } from "../src/components/tour";
import fs from "fs";
import path from "path";

describe("Phase 5: Present Mode Performance Rewrite", () => {
  it("1. CHAPTERS configuration has valid structure, names, and non-empty beats", () => {
    expect(CHAPTERS.length).toBeGreaterThan(5);
    for (const c of CHAPTERS) {
      expect(c.name).toBeDefined();
      expect(c.purpose).toBeDefined();
      expect(c.beats.length).toBeGreaterThan(0);
      for (const b of c.beats) {
        expect(b.text.length).toBeGreaterThan(5);
      }
    }
  });

  it("2. tour.tsx has eliminated 9999px box-shadow and document.body.innerText polling", () => {
    const tourFilePath = path.resolve(process.cwd(), "src/components/tour.tsx");
    const content = fs.readFileSync(tourFilePath, "utf8");

    // No 9999px box shadow
    expect(content).not.toContain("9999px");

    // No document.body.innerText polling
    expect(content).not.toContain("document.body.innerText");

    // Uses hardware-accelerated SVG mask with ref
    expect(content).toContain("maskCutoutRef");
    expect(content).toContain("<mask id=\"rm-spotlight-mask\">");

    // Uses coalesced timer (200ms instead of 50ms)
    expect(content).not.toContain("setInterval(() => {\n      const e = base + (performance.now() - start) * speed;\n      setElapsed(e);\n      if (e >= total) {\n        clearInterval(id);\n        if (tour.step < FLAT.length - 1) setTour({ step: tour.step + 1 });\n        else setTour({ playing: false });\n      }\n    }, 50)");
    expect(content).toContain("200);");

    // Respects reduced motion and tab visibility
    expect(content).toContain("visibilitychange");
    expect(content).toContain("motion-reduce:transition-none");
  });
});

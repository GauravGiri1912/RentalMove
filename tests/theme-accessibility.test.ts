import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Phase 6: Theme & Accessibility Remediation", () => {
  const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const tailwindConfig = fs.readFileSync(path.resolve(process.cwd(), "tailwind.config.ts"), "utf8");
  const tourComponent = fs.readFileSync(path.resolve(process.cwd(), "src/components/tour.tsx"), "utf8");

  it("1. globals.css defines semantic presentation tokens for both :root and .dark", () => {
    // Light mode :root tokens
    expect(globalsCss).toContain("--presentation-overlay:");
    expect(globalsCss).toContain("--presentation-surface:");
    expect(globalsCss).toContain("--presentation-border:");
    expect(globalsCss).toContain("--presentation-text:");
    expect(globalsCss).toContain("--presentation-muted:");
    expect(globalsCss).toContain("--presentation-control:");

    // Ensure dark mode overrides them
    const darkSection = globalsCss.slice(globalsCss.indexOf(".dark {"));
    expect(darkSection).toContain("--presentation-overlay: 0 0 0;");
    expect(darkSection).toContain("--presentation-surface:");
    expect(darkSection).toContain("--presentation-text: 255 255 255;");
  });

  it("2. tailwind.config.ts exposes presentation color tokens", () => {
    expect(tailwindConfig).toContain('"presentation-overlay": token("presentation-overlay")');
    expect(tailwindConfig).toContain('"presentation-surface": token("presentation-surface")');
    expect(tailwindConfig).toContain('"presentation-border": token("presentation-border")');
    expect(tailwindConfig).toContain('"presentation-text": token("presentation-text")');
    expect(tailwindConfig).toContain('"presentation-muted": token("presentation-muted")');
    expect(tailwindConfig).toContain('"presentation-control": token("presentation-control")');
  });

  it("3. tour.tsx uses semantic tokens and avoids unreadable light mode hardcoding", () => {
    // Caption bar uses semantic presentation tokens
    expect(tourComponent).toContain("bg-presentation-surface/95");
    expect(tourComponent).toContain("text-presentation-text");
    expect(tourComponent).toContain("border-presentation-border");
    expect(tourComponent).toContain("text-presentation-muted");

    // Title card adapts between light mode bg-bg and dark mode
    expect(tourComponent).toContain("bg-bg/85 dark:bg-[#0b0c0e]/85");
    expect(tourComponent).toContain("text-ink dark:text-white");
    expect(tourComponent).toContain("text-ink-2 dark:text-white/80");
  });

  it("4. tour.tsx satisfies WCAG AA accessibility requirements", () => {
    // Accessible button labels
    expect(tourComponent).toContain('aria-label="Playback speed"');
    expect(tourComponent).toContain('aria-label="Previous step"');
    expect(tourComponent).toContain('aria-label="Next step"');
    expect(tourComponent).toContain('aria-label="Exit walkthrough"');
    expect(tourComponent).toContain('aria-label={tour.playing ? "Pause walkthrough" : "Play walkthrough"}');

    // Focus indicators on all buttons
    expect(tourComponent).toContain("focus-visible:ring-signal");

    // Reduced motion support
    expect(tourComponent).toContain("motion-reduce:transition-none");
  });
});

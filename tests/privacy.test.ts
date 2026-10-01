import { describe, it, expect } from "vitest";
import { coversFinding, mergeBoxes, MIN_TEXT_DENSITY, ocrBoxes, pad, pixelateSteps, snapToText, TEXTUAL, textDensity, withPixelEvidence, type Box } from "../src/lib/privacy";
import { fromLongSide } from "../src/lib/vision";
import { derivePrivacy, derivePrivacyScans, type PropertyEvent } from "../src/lib/events";
import { transformationFor } from "../src/lib/recipes";

let n = 0;
const ev = (p: Partial<PropertyEvent>): PropertyEvent => ({
  id: `e${++n}`, property_id: "prop-1", type: "privacy", resource_id: "a1", actor_id: "u", actor_name: "Alex", actor_role: "tenant", payload: {},
  created_at: new Date(2026, 0, 1, 0, n).toISOString(), ...p,
});

describe("model box convention", () => {
  it("converts long-side fractions to width/height fractions (measured on landscape and portrait)", () => {
    // Landscape 1024×765: the letter at y 0.62–0.93 came back as 0.45–0.69.
    const l = fromLongSide([0.57, 0.45, 0.86, 0.69], 1024, 765);
    expect(l[1]).toBeCloseTo(0.602, 2);
    expect(l[3]).toBeCloseTo(0.924, 2);
    expect(l[0]).toBe(0.57);
    // Portrait 600×896: x 0.22–0.82 came back as 0.15–0.56.
    const p = fromLongSide([0.15, 0.59, 0.56, 0.89], 600, 896);
    expect(p[0]).toBeCloseTo(0.224, 2);
    expect(p[2]).toBeCloseTo(0.836, 2);
    expect(p[1]).toBe(0.59);
    expect(fromLongSide([0.1, 0.9, 0.2, 0.95], 1000, 500)[3]).toBe(1); // clamped
  });
});

describe("regions", () => {
  it("merges the lines of one letter into one block and caps the count", () => {
    const lines: Box[] = [[0.5, 0.6, 0.8, 0.62], [0.5, 0.64, 0.78, 0.66], [0.5, 0.68, 0.7, 0.7]];
    expect(mergeBoxes(lines)).toEqual([[0.5, 0.6, 0.8, 0.7]]);
    const many: Box[] = Array.from({ length: 12 }, (_, i) => [i * 0.08, 0.1, i * 0.08 + 0.02, 0.12] as Box);
    expect(mergeBoxes(many, 0, 5)).toHaveLength(5);
  });

  it("reads Cloudinary adv_ocr geometry and drops the text itself", () => {
    const info = { status: "complete", data: [{ textAnnotations: [
      { description: "ELECTRICITY BILL\nMs. Priya Verma", boundingPoly: { vertices: [{ x: 672, y: 570 }, { x: 1000, y: 570 }, { x: 1000, y: 800 }, { x: 672, y: 800 }] } },
      { description: "ELECTRICITY", boundingPoly: { vertices: [{ x: 680, y: 575 }, { x: 800, y: 575 }, { x: 800, y: 600 }, { x: 680, y: 600 }] } },
      { description: "BILL", boundingPoly: { vertices: [{ x: 810, y: 575 }, { x: 860, y: 575 }, { x: 860, y: 600 }, { x: 810, y: 600 }] } },
      { description: "Priya", boundingPoly: { vertices: [{ x: 680, y: 612 }, { x: 740, y: 612 }, { x: 740, y: 632 }, { x: 680, y: 632 }] } },
    ] }] };
    const boxes = ocrBoxes(info, 1200, 896);
    expect(boxes).toHaveLength(1);
    const [x1, y1, x2, y2] = boxes[0];
    expect(x1).toBeLessThan(680 / 1200);
    expect(y1).toBeLessThan(575 / 896);
    expect(x2).toBeGreaterThan(860 / 1200);
    expect(y2).toBeGreaterThan(632 / 896);
    expect(JSON.stringify(boxes)).not.toMatch(/Priya|BILL/);
    expect(ocrBoxes({}, 1200, 896)).toEqual([]);
  });

  it("builds fractional Cloudinary pixelate steps that stay below 1", () => {
    expect(pixelateSteps([{ bbox: [0.56, 0.6194, 0.86, 0.93] }], 1200, 896)).toEqual(["e_pixelate_region:20,x_0.5600,y_0.6194,w_0.3000,h_0.3106"]);
    expect(pixelateSteps([{ bbox: [0, 0, 1, 1] }])[0]).toContain("w_0.9999,h_0.9999");
    expect(pixelateSteps([{ bbox: [0.5, 0.5, 0.501, 0.6] }])).toEqual([]); // too thin
  });

  it("puts the hiding steps first in every signed recipe", () => {
    const hide = ["e_pixelate_region:20,x_0.1000,y_0.1000,w_0.2000,h_0.2000"];
    expect(transformationFor({ kind: "tile", size: 160 }, hide).startsWith(hide[0] + "/")).toBe(true);
    expect(transformationFor({ kind: "tile", size: 160 })).not.toContain("pixelate_region");
  });

  it("warns when a hidden area would cover a finding", () => {
    expect(coversFinding([0.5, 0.5, 0.9, 0.9], [{ id: "f1", bbox: [0.6, 0.6, 0.7, 0.7] }, { id: "f2", bbox: [0.1, 0.1, 0.2, 0.2] }])).toEqual(["f1"]);
  });

  it("snaps a loose model box onto the text, including its last line", () => {
    const W = 400, H = 300;
    const data = new Uint8Array(W * H).fill(200);
    // A "letter": dark strokes on light paper at x 220–340, y 180–270.
    for (let y = 180; y < 270; y++) for (let x = 220; x < 340; x++) data[y * W + x] = ((y % 12) < 3 && (x % 7) < 4) ? 30 : 240;
    const g = { w: W, h: H, data };
    const s = snapToText(g, [0.53, 0.58, 0.86, 0.85]); // roughly right but cuts the last lines
    expect(s.snapped).toBe(true);
    expect(s.bbox[1]).toBeLessThan(180 / H);
    expect(s.bbox[3]).toBeGreaterThan(266 / H);
    const none = snapToText({ w: W, h: H, data: new Uint8Array(W * H).fill(128) }, [0.1, 0.1, 0.2, 0.2]);
    expect(none.snapped).toBe(false);
    expect(none.bbox).toEqual(pad([0.1, 0.1, 0.2, 0.2], 0.25, 0.02));
  });

  it("drops textual items whose box has no text-like pixels (hallucinated boxes over bare floor)", () => {
    const W = 400, H = 300;
    const data = new Uint8Array(W * H).fill(180);
    for (let y = 200; y < 240; y++) for (let x = 40; x < 100; x++) data[y * W + x] = ((y % 8) < 2 && (x % 5) < 3) ? 20 : 250; // a real screen
    const g = { w: W, h: H, data };
    const kept = withPixelEvidence(g, [
      { label: "tablet", bbox: [0.1, 0.66, 0.25, 0.8] as Box },
      { label: "clipboard", bbox: [0.5, 0.85, 0.9, 1] as Box }, // nothing there
      { label: "framed family photo", bbox: [0.6, 0.1, 0.8, 0.3] as Box }, // non-textual: kept
    ]);
    expect(kept.map((k) => k.label)).toEqual(["tablet", "framed family photo"]);
    expect(textDensity(g, [0.1, 0.66, 0.25, 0.8])).toBeGreaterThan(MIN_TEXT_DENSITY);
    expect(TEXTUAL.test("ID card")).toBe(true);
    expect(TEXTUAL.test("fridge")).toBe(false);
  });

  it("does not spread onto floorboards next to an item", () => {
    const W = 400, H = 300;
    const data = new Uint8Array(W * H).fill(200);
    // Wood grain across the whole bottom half (dense edges everywhere)…
    for (let y = 150; y < 300; y++) for (let x = 0; x < W; x++) data[y * W + x] = (y % 6 < 2) ? 90 : 210;
    // …and a small tablet screen at x 40–100, y 200–240 with text.
    for (let y = 200; y < 240; y++) for (let x = 40; x < 100; x++) data[y * W + x] = ((y % 8) < 2 && (x % 5) < 3) ? 20 : 250;
    const s = snapToText({ w: W, h: H, data }, [0.1, 0.66, 0.25, 0.8]);
    expect(s.bbox[2]).toBeLessThan(0.36); // at most half the box width beyond its right edge
    expect(s.bbox[0]).toBeGreaterThanOrEqual(0.025);
  });

  it("replays add / remove / rescan, keeping areas a person drew", () => {
    const events = [
      ev({ payload: { action: "add", region: { id: "m1", bbox: [0.1, 0.1, 0.2, 0.2], source: "manual", label: "photo" } } }),
      ev({ payload: { action: "add", region: { id: "a1", bbox: [0.5, 0.5, 0.6, 0.6], source: "ai", label: "letter" } } }),
      ev({ payload: { action: "scan", engine: "ai", found: 1 } }),
      ev({ payload: { action: "clear_source", source: "ai" } }), // a rescan replaces AI suggestions…
      ev({ payload: { action: "add", region: { id: "a2", bbox: [0.5, 0.55, 0.6, 0.7], source: "ai", label: "letter" } } }),
      ev({ payload: { action: "add", region: { id: "m2", bbox: [0.3, 0.3, 0.4, 0.4], source: "manual", label: "screen" } } }),
      ev({ payload: { action: "remove", id: "m2" } }),
    ];
    const r = derivePrivacy(events).a1;
    expect(r.map((x) => x.id)).toEqual(["m1", "a2"]); // …but never a person's box
    expect(derivePrivacyScans(events).a1).toMatchObject({ engine: "ai", found: 1 });
  });
});

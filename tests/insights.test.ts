import { describe, it, expect } from "vitest";
import { deriveCalibrations, deriveCoverage, deriveMeasures, deriveWorkOrders, type PropertyEvent } from "../src/lib/events";
import { cmPerPixel, findingSize, trend, fmtLength } from "../src/lib/measure";
import { wearContext, monthsBetween } from "../src/lib/wear";
import { cleanAreas, coverageFor } from "../src/lib/coverage";
import { fromCurrentFrame, toCurrentFrame, type Gray, type BBox } from "../src/lib/pixel";
import { measureBoxes } from "../src/lib/measure-node";

let n = 0;
const ev = (p: Partial<PropertyEvent>): PropertyEvent => ({
  id: `e${++n}`, property_id: "prop-1", type: "workorder", resource_id: "ob-1", actor_id: "u", actor_name: "Sarah", actor_role: "owner", payload: {},
  created_at: new Date(2026, 0, 1, 0, n).toISOString(), ...p,
});

describe("measurement", () => {
  it("sizes a finding from a scale line", () => {
    // 100 px line across a 8.6 cm switch plate on an 800×600 photo → 0.086 cm/px
    const ref = { line: [0.1, 0.5, 0.225, 0.5] as [number, number, number, number], cm: 8.6, reference: "switch" };
    expect(cmPerPixel(ref, 800, 600)).toBeCloseTo(0.086, 4);
    const s = findingSize([0.5, 0.5, 0.75, 0.55], 800, 600, ref, 0.001)!;
    expect(s.long_cm).toBeCloseTo(200 * 0.086, 3);
    expect(s.area_cm2).toBeCloseTo(0.001 * 480000 * 0.086 ** 2, 3);
    expect(findingSize([0, 0, 1, 1], 800, 600, undefined)).toBeNull();
    expect(fmtLength(17.2)).toBe("≈ 17 cm");
  });

  it("classifies growth between visits", () => {
    expect(trend(0, 0.002)?.kind).toBe("new");
    expect(trend(0.001, 0.002)).toEqual({ kind: "grew", ratio: 2 });
    expect(trend(0.001, 0.0011)?.kind).toBe("stable");
    expect(trend(0.001, 0.0005)?.kind).toBe("shrank");
    expect(trend(0, 0)).toBeNull();
    expect(trend(null, 0.1)).toBeNull();
  });

  it("maps boxes back to the prior frame (inverse of toCurrentFrame)", () => {
    const t = { dx: 0.03, dy: -0.02, scale: 1.04 };
    const b: BBox = [0.3, 0.3, 0.5, 0.45];
    const back = fromCurrentFrame(toCurrentFrame(b, t), t);
    back.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  });

  it("measures a mark that grows between visits at the same spot", () => {
    const W = 200, H = 150;
    const scene = (r: number): Gray => {
      const data = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const tex = 120 + 30 * Math.sin(x / 6) * Math.cos(y / 9); // textured wall so alignment is well posed
        data[y * W + x] = Math.hypot(x - 100, y - 75) < r ? 40 : tex;
      }
      return { w: W, h: H, data };
    };
    const [m] = measureBoxes(scene(0), scene(12), scene(6), [[0.4, 0.3, 0.6, 0.7]]);
    expect(m.extent).toBeGreaterThan(0);
    expect(m.extent_prior).toBeGreaterThan(0);
    expect(trend(m.extent_prior, m.extent)?.kind).toBe("grew");
    const [none] = measureBoxes(scene(0), scene(0), null, [[0.4, 0.3, 0.6, 0.7]]);
    expect(none.extent).toBe(0);
  });
});

describe("everyday-wear context", () => {
  it("gives neutral context, never a verdict", () => {
    expect(wearContext({ category: "mark", months: 18, long_cm: 6 }).level).toBe("typical");
    expect(wearContext({ category: "mark", months: 18, long_cm: 40 }).level).toBe("review");
    expect(wearContext({ category: "crack", months: 24 }).level).toBe("review");
    expect(wearContext({ category: "stain", sub_area: "shower grout", months: 12 }).level).toBe("typical");
    expect(wearContext({ category: "stain", sub_area: "shower grout", months: 12, trend_ratio: 3.4 }).level).toBe("review");
    for (const c of ["mark", "scratch", "stain", "dent", "crack", "other"]) {
      const t = wearContext({ category: c, months: 10, long_cm: 20 }).text.toLowerCase();
      expect(t).not.toMatch(/tenant|liab|fault|deduct|cost|charge|blame/);
    }
    expect(Math.round(monthsBetween("2024-01-01", "2026-01-01"))).toBe(24);
  });
});

describe("coverage checklist", () => {
  it("keeps only known areas and reports gaps with a reason", () => {
    expect(cleanAreas(["Shower", "tiles-grout", "toilet", "sofa", 3])).toEqual(["shower", "tiles_grout", "toilet"]);
    const c = coverageFor("bathroom", ["shower", "tiles_grout", "toilet", "sink", "floor"]);
    expect(c.covered).toBe(5);
    const gap = c.items.find((i) => !i.covered)!;
    expect(gap.label).toBe("Ceiling");
    expect(gap.why).toMatch(/mould/i);
    expect(coverageFor("exterior", []).total).toBe(0);
  });
});

describe("event replay — insights", () => {
  it("rebuilds a work order with status, photo check and cancel", () => {
    const events = [
      ev({ payload: { action: "create", assignee: "Ace Plumbing", note: "regrout" } }),
      ev({ payload: { action: "status", status: "in_progress" } }),
      ev({ actor_role: "tenant", actor_name: "Alex", payload: { action: "photo", public_id: "p/repairs/ob-1/x", secure_url: "u", sha256: "ab", check: { verdict: "reduced", same_view: true, view_match: 0.99, extent_before: 0.006, extent_after: 0 } } }),
      ev({ payload: { action: "status", status: "done" } }),
      ev({ resource_id: "ob-2", payload: { action: "status", status: "done" } }), // no create → ignored
    ];
    const w = deriveWorkOrders(events);
    expect(Object.keys(w)).toEqual(["ob-1"]);
    expect(w["ob-1"].status).toBe("done");
    expect(w["ob-1"].photo?.check?.verdict).toBe("reduced");
    expect(w["ob-1"].history.map((h) => h.text)).toEqual(["Work order created for Ace Plumbing", "Repair started", "Repair photo added — change no longer detected at the spot", "Marked repaired"]);
    expect(deriveWorkOrders([...events, ev({ payload: { action: "cancel" } })])["ob-1"]).toBeUndefined();
  });

  it("keeps the latest calibration, measure and coverage", () => {
    const cal = deriveCalibrations([
      ev({ type: "calibration", resource_id: "a1", payload: { line: [0, 0, 0.5, 0], cm: 80, reference: "door" } }),
      ev({ type: "calibration", resource_id: "a2", payload: { line: [0, 0, 0.5, 0], cm: 80, reference: "door" } }),
      ev({ type: "calibration", resource_id: "a2", payload: { cleared: true } }),
    ]);
    expect(cal.a1.cm).toBe(80);
    expect(cal.a2).toBeUndefined();
    const m = deriveMeasures([ev({ type: "measure", payload: { extent: 0.0066, extent_prior: 0.002, long_side: 0.2, bbox_area: 0.03, prior_asset_id: "a0" } })]);
    expect(m["ob-1"]).toMatchObject({ extent: 0.0066, extent_prior: 0.002, prior_asset_id: "a0" });
    expect(deriveCoverage([ev({ type: "coverage", resource_id: "a1", payload: { areas: ["floor"] } })])).toEqual({ a1: ["floor"] });
  });
});

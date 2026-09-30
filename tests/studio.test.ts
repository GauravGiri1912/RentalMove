import { describe, it, expect } from "vitest";
import { deriveStances, deriveThreads, deriveSignatures, deriveFingerprints, type PropertyEvent } from "../src/lib/events";
import { align, diff, ground, iou, toCurrentFrame, warp, describeRegion, type Gray } from "../src/lib/pixel";
import { hamming, REUSE_MAX_DISTANCE } from "../src/lib/fingerprint";
import { markPreExisting, reportContentHash, reportInspections } from "../src/lib/snapshot";
import type { Asset, Inspection, Observation } from "../src/lib/schemas";

let n = 0;
const ev = (p: Partial<PropertyEvent>): PropertyEvent => ({
  id: `e${++n}`,
  property_id: "prop-1",
  type: "stance",
  resource_id: "ob-1",
  actor_id: "u",
  actor_name: "Alex",
  actor_role: "tenant",
  payload: {},
  created_at: new Date(2026, 0, 1, 0, n).toISOString(),
  ...p,
});

describe("event replay", () => {
  it("keeps the latest position per role and lets a null stance withdraw it", () => {
    const s = deriveStances([
      ev({ payload: { stance: "agree" } }),
      ev({ actor_role: "owner", payload: { stance: "dispute" } }),
      ev({ payload: { stance: "dispute" } }),
      ev({ actor_role: "owner", payload: { stance: null } }),
    ]);
    expect(s["ob-1"]).toEqual({ tenant: "dispute" });
  });

  it("ignores system actors for positions and comments", () => {
    expect(deriveStances([ev({ actor_role: "system", payload: { stance: "agree" } })])).toEqual({});
    expect(deriveThreads([ev({ type: "comment", actor_role: "system", payload: { text: "x" } })])).toEqual({});
  });

  it("orders comments and derives signatures with withdrawal", () => {
    const t = deriveThreads([ev({ type: "comment", payload: { text: "first" } }), ev({ type: "comment", actor_role: "owner", actor_name: "Sarah", payload: { text: "second" } })]);
    expect(t["ob-1"].map((c) => c.text)).toEqual(["first", "second"]);
    const sig = deriveSignatures([ev({ type: "signature", payload: { hash: "a".repeat(64) } }), ev({ type: "signature", actor_role: "owner", payload: { hash: "b".repeat(64) } }), ev({ type: "signature", payload: { hash: null } })]);
    expect(Object.keys(sig)).toEqual(["owner"]);
  });

  it("keeps the latest fingerprint per asset", () => {
    const f = deriveFingerprints([ev({ type: "fingerprint", resource_id: "a1", payload: { phash: "00" } }), ev({ type: "fingerprint", resource_id: "a1", payload: { phash: "ff" } })]);
    expect(f.a1.phash).toBe("ff");
  });
});

// Synthetic grey image with a few rectangles as texture.
function scene(w = 200, h = 150, marks: [number, number, number, number, number][] = []): Gray {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = 150 + 60 * Math.sin(x / 9) * Math.cos(y / 13);
  for (const [x1, y1, x2, y2, v] of marks) for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) data[y * w + x] = v;
  return { data, w, h };
}

describe("pixel engine", () => {
  it("finds a new mark and nothing else", () => {
    const a = scene();
    const b = scene(200, 150, [[120, 90, 140, 104, 20]]);
    const d = diff(a, b);
    expect(d.regions.length).toBe(1);
    expect(iou(d.regions[0], [120 / 200, 90 / 150, 140 / 200, 104 / 150])).toBeGreaterThan(0.4);
  });

  it("detects a 1-pixel-wide line (thin scratches must survive the misalignment filter)", () => {
    const a = scene();
    const b = scene(200, 150, [[60, 70, 110, 71, 30]]);
    expect(diff(a, b).regions.length).toBeGreaterThanOrEqual(1);
  });

  it("reports no change when only exposure differs", () => {
    const a = scene();
    const b = { ...a, data: a.data.map((v) => v * 1.08) };
    expect(diff(a, b).regions).toEqual([]);
  });

  it("recovers a shift between two captures", () => {
    const a = scene(240, 180, [[40, 40, 70, 60, 30]]);
    const shifted = warp(a, { dx: 6, dy: -4, scale: 1 });
    const t = align(shifted, a);
    expect(Math.abs(t.dx - 6)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.dy + 4)).toBeLessThanOrEqual(1);
  });

  it("maps boxes between frames and describes regions", () => {
    expect(toCurrentFrame([0.4, 0.4, 0.6, 0.6], { dx: 0.1, dy: 0, scale: 1 })).toEqual([0.5, 0.4, 0.7, 0.6]);
    expect(describeRegion([0.7, 0.7, 0.9, 0.9])).toBe("bottom-right");
    expect(describeRegion([0.4, 0.4, 0.6, 0.6])).toBe("centre");
  });

  it("snaps a model box onto the overlapping region, else the nearest, else nothing", () => {
    const regions: [number, number, number, number][] = [[0.5, 0.6, 0.6, 0.75], [0.1, 0.1, 0.2, 0.2]];
    expect(ground([0.45, 0.5, 0.58, 0.65], regions)?.box).toEqual(regions[0]);
    expect(ground([0.6, 0.45, 0.66, 0.55], regions)?.box).toEqual(regions[0]);
    expect(ground([0.9, 0.9, 0.95, 0.95], regions, 0.1)).toBeNull();
  });
});

describe("fingerprints", () => {
  it("measures hash distance in bits", () => {
    expect(hamming("868531785c5cabb7", "868531785c5cabb7")).toBe(0);
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(hamming("0000000000000000", "0000000000000001")).toBeLessThanOrEqual(REUSE_MAX_DISTANCE);
    expect(hamming("abc", "abcd")).toBe(64);
  });
});

const insp = (id: string, type: Inspection["type"], at: string): Inspection => ({ id, property_id: "p", type, captured_at: at, status: "completed", created_at: at });
const asset = (id: string, inspection_id: string, room_id = "kitchen", sha = id): Asset =>
  ({ id, inspection_id, room_id, cloudinary_public_id: `p/${id}`, secure_url: `https://x/${id}`, sha256: sha, captured_at: "", analysis_status: "done", created_at: "" }) as Asset;
const obs = (id: string, asset_id: string, bbox: Observation["bbox"], extra: Partial<Observation> = {}): Observation =>
  ({ id, asset_id, category: "scratch", sub_area: "door", description: "Possible scratch", confidence: 0.8, bbox, review_status: "accepted", source: "ai", created_at: "", updated_at: "", ...extra }) as Observation;

describe("pre-existing matching and report hash", () => {
  const inspections = [insp("in", "move_in", "2024-06-01"), insp("out", "move_out", "2026-09-26")];
  const assets = [asset("a-in", "in"), asset("a-out", "out")];
  const base = obs("o1", "a-in", [0.4, 0.4, 0.5, 0.5]);
  const same = obs("o2", "a-out", [0.41, 0.41, 0.51, 0.51], { review_status: "pending" });
  const fresh = obs("o3", "a-out", [0.1, 0.8, 0.2, 0.9]);

  it("marks a later finding at the same spot and category as pre-existing", () => {
    const m = markPreExisting(inspections, assets, [base, same, fresh]);
    expect(m.find((o) => o.id === "o2")?.pre_existing).toBe(true);
    expect(m.find((o) => o.id === "o2")?.matches).toBe("o1");
    expect(m.find((o) => o.id === "o3")?.pre_existing).toBe(false);
    expect(m.find((o) => o.id === "o1")?.pre_existing).toBe(false);
  });

  it("does not match against rejected earlier findings or other categories", () => {
    const m = markPreExisting(inspections, assets, [{ ...base, review_status: "rejected" }, same]);
    expect(m.find((o) => o.id === "o2")?.pre_existing).toBe(false);
    const m2 = markPreExisting(inspections, assets, [{ ...base, category: "stain" }, same]);
    expect(m2.find((o) => o.id === "o2")?.pre_existing).toBe(false);
  });

  it("report hash is stable and changes when an included finding changes", () => {
    const m = markPreExisting(inspections, assets, [base, same, fresh]);
    const h1 = reportContentHash("p", inspections, assets, m, {});
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(reportContentHash("p", inspections, assets, m, {})).toBe(h1);
    const edited = m.map((o) => (o.id === "o3" ? { ...o, description: "Changed text" } : o));
    expect(reportContentHash("p", inspections, assets, edited, {})).not.toBe(h1);
    expect(reportContentHash("p", inspections, assets, m, { o3: { tenant: "dispute" } })).not.toBe(h1);
    expect(reportContentHash("p", inspections, [assets[0], asset("a-out", "out", "kitchen", "tampered")], m, {})).not.toBe(h1);
  });

  it("report compares first move-in with the latest inspection", () => {
    const r = reportInspections([insp("x", "inspection", "2025-01-01"), ...inspections]);
    expect(r.baseline?.id).toBe("in");
    expect(r.current?.id).toBe("out");
  });
});

describe("phone handoff tokens", async () => {
  const { signHandoff, verifyHandoff } = await import("../src/lib/handoff");
  const claims = { p: "prop-381", i: "insp-2026-move-out", r: "room-kitchen", u: "user-owner-1", n: "Sarah", role: "owner" as const };

  it("round-trips a valid token", () => {
    const { token } = signHandoff(claims);
    expect(verifyHandoff(token)).toMatchObject(claims);
  });

  it("rejects a token edited to reach another room", () => {
    const { token } = signHandoff(claims);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), r: "room-bathroom" })).toString("base64url");
    expect(verifyHandoff(`${forged}.${mac}`)).toBeNull();
  });

  it("rejects a forged signature and garbage", () => {
    const { token } = signHandoff(claims);
    expect(verifyHandoff(`${token.split(".")[0]}.AAAA`)).toBeNull();
    expect(verifyHandoff("not-a-token")).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token } = signHandoff(claims, -1000);
    expect(verifyHandoff(token)).toBeNull();
  });
});

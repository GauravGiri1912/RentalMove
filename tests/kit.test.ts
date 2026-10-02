import { describe, it, expect, beforeAll } from "vitest";
import { buildRooms, cleanText, isDamageShot, isValidShot, shotLabel, shotListFor, KIT_ROOM_TYPES } from "../src/lib/kit";
import { sealHash, signKit, verifyKit } from "../src/lib/kit-crypto";
import { deriveKit, type PropertyEvent } from "../src/lib/events";

beforeAll(() => { process.env.HANDOFF_SECRET = "test-secret-for-kit-tokens"; });

let n = 0;
const ev = (payload: Record<string, any>): PropertyEvent => ({
  id: `e${++n}`, property_id: "kit-1", type: "kit", resource_id: null, actor_id: null, actor_name: "Asha", actor_role: "tenant", payload,
  created_at: new Date(2026, 9, 1, 10, n).toISOString(),
});

describe("shot lists", () => {
  it("start with a wide shot, follow the room checklist, and have unique ids", () => {
    for (const t of KIT_ROOM_TYPES) {
      const shots = shotListFor(t.category);
      expect(shots[0].id).toBe("wide");
      expect(new Set(shots.map((s) => s.id)).size).toBe(shots.length);
      expect(shots.length).toBeGreaterThanOrEqual(4);
      for (const s of shots) expect(s.prompt.length).toBeGreaterThan(10);
    }
    const bathroom = shotListFor("bathroom").map((s) => s.id);
    expect(bathroom).toContain("ceiling");
    expect(bathroom).toContain("tiles-and-grout");
    expect(shotListFor("bathroom").find((s) => s.id === "ceiling")!.tip).toMatch(/mould/i);
    expect(shotListFor("kitchen").find((s) => s.id === "hob-and-oven")!.areas).toEqual(["hob_oven"]);
  });

  it("accepts only that room's shots, plus up to three damage close-ups", () => {
    expect(isValidShot("kitchen", "worktop")).toBe(true);
    expect(isValidShot("kitchen", "shower-or-bath")).toBe(false);
    expect(isValidShot("kitchen", "damage-3")).toBe(true);
    expect(isValidShot("kitchen", "damage-4")).toBe(false);
    expect(isDamageShot("damage-1")).toBe(true);
    expect(shotLabel("kitchen", "damage-2")).toBe("Existing damage 2");
    expect(shotLabel("kitchen", "sink")).toBe("Sink");
  });

  it("falls back to a generic list for room types without a checklist", () => {
    expect(shotListFor("exterior").map((s) => s.id)).toEqual(["wide", "walls", "floor", "ceiling"]);
  });

  it("names rooms by count and caps the total", () => {
    expect(buildRooms({ bedroom: 2, kitchen: 1, bathroom: 1, living_room: 1 }).map((r) => r.name)).toEqual(["Living room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom"]);
    expect(buildRooms({ bedroom: 99 })).toHaveLength(6); // per-type maximum
    expect(buildRooms({})).toEqual([]);
    expect(buildRooms({ living_room: 3, kitchen: 2, bedroom: 6, bathroom: 4, exterior: 2 })).toHaveLength(12); // overall maximum
  });
});

describe("kit links", () => {
  it("round-trip, and keep the tenant's and the read-only scope apart", () => {
    const w = verifyKit(signKit({ p: "kit-1", i: "insp-1", s: "w" }))!;
    const r = verifyKit(signKit({ p: "kit-1", i: "insp-1", s: "r" }))!;
    expect(w).toMatchObject({ p: "kit-1", i: "insp-1", s: "w" });
    expect(r.s).toBe("r");
    expect(w.exp).toBeGreaterThan(Date.now() + 364 * 864e5); // records are needed for years
  });

  it("reject tampering, other secrets and garbage", () => {
    const t = signKit({ p: "kit-1", i: "insp-1", s: "r" });
    const [body, mac] = t.split(".");
    const widened = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), s: "w" })).toString("base64url");
    expect(verifyKit(`${widened}.${mac}`)).toBeNull(); // read link cannot be upgraded to write
    expect(verifyKit(`${body}.${mac.slice(0, -2)}AA`)).toBeNull();
    expect(verifyKit("garbage")).toBeNull();
    expect(verifyKit("")).toBeNull();
    process.env.HANDOFF_SECRET = "a-different-secret";
    expect(verifyKit(t)).toBeNull();
    process.env.HANDOFF_SECRET = "test-secret-for-kit-tokens";
    expect(verifyKit(t)).not.toBeNull();
  });
});

describe("sealing", () => {
  const base = { kit: "kit-1", name: "Asha", address: "12 Lake Rd", rooms: [{ id: "r1", name: "Kitchen", shots: [{ shot: "wide", sha256: "a".repeat(64) }, { shot: "sink", sha256: "b".repeat(64) }] }, { id: "r2", name: "Bedroom", shots: [{ shot: "wide", sha256: "c".repeat(64) }] }] };

  it("is stable regardless of order, and changes with any photo, name or room", () => {
    const h = sealHash(base);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(sealHash({ ...base, rooms: [...base.rooms].reverse().map((r) => ({ ...r, shots: [...r.shots].reverse() })) })).toBe(h);
    expect(sealHash({ ...base, rooms: [{ ...base.rooms[0], shots: [{ shot: "wide", sha256: "d".repeat(64) }, base.rooms[0].shots[1]] }, base.rooms[1]] })).not.toBe(h);
    expect(sealHash({ ...base, name: "Asha K" })).not.toBe(h);
    expect(sealHash({ ...base, rooms: [base.rooms[0]] })).not.toBe(h);
    expect(sealHash({ ...base, kit: "kit-2" })).not.toBe(h);
  });
});

describe("kit events", () => {
  it("rebuilds progress: retakes replace, skips are cleared by a photo, the first seal wins", () => {
    const kit = deriveKit([
      ev({ action: "shot", room_id: "r1", shot_id: "wide", asset_id: "ignored-before-create" }),
      ev({ action: "create", name: "Asha", address: "12 Lake Rd" }),
      ev({ action: "shot", room_id: "r1", shot_id: "wide", asset_id: "a1" }),
      ev({ action: "shot", room_id: "r1", shot_id: "wide", asset_id: "a2" }), // retake
      ev({ action: "skip", room_id: "r1", shot_id: "sink" }),
      ev({ action: "skip", room_id: "r1", shot_id: "wide" }), // already photographed: not skipped
      ev({ action: "shot", room_id: "r1", shot_id: "sink", asset_id: "a3" }), // later photo clears the skip
      ev({ action: "seal", hash: "h1", photos: 2, missing: 4 }),
      ev({ action: "seal", hash: "h2", photos: 9, missing: 0 }),
    ])!;
    expect(kit.name).toBe("Asha");
    expect(kit.shots.r1).toEqual({ wide: "a2", sink: "a3" });
    expect(kit.skipped.r1).toEqual([]);
    expect(kit.sealed).toMatchObject({ hash: "h1", photos: 2, missing: 4 });
    expect(deriveKit([])).toBeNull();
    expect(deriveKit([ev({ action: "shot", room_id: "r1", shot_id: "wide", asset_id: "x" })])).toBeNull();
  });
});

describe("form text", () => {
  it("is trimmed, flattened and stripped of markup characters", () => {
    expect(cleanText("  Asha\n<script>  K ", 60)).toBe("Asha script K");
    expect(cleanText("x".repeat(500), 120)).toHaveLength(120);
    expect(cleanText(undefined, 10)).toBe("");
  });
});

describe("kit confirmations and link replacement", () => {
  const ev = (payload: Record<string, unknown>, n: number) => ({ id: `e${n}`, seq: n, property_id: "kit-x", type: "kit", resource_id: null, actor_id: null, actor_name: null, actor_role: null, payload, created_at: `2026-01-0${n}T00:00:00Z` }) as any;
  const base = [ev({ action: "create", name: "T", address: "A" }, 1), ev({ action: "seal", hash: "h1", photos: 2, missing: 0 }, 2)];
  it("counts a confirmation of the sealed hash once per name", () => {
    const k = deriveKit([...base, ev({ action: "ack", name: "Rao", hash: "h1" }, 3), ev({ action: "ack", name: "rao", hash: "h1" }, 4)])!;
    expect(k.acks.map((a) => a.name)).toEqual(["Rao"]);
  });
  it("ignores a confirmation of a different record", () => {
    expect(deriveKit([...base, ev({ action: "ack", name: "Rao", hash: "other" }, 3)])!.acks).toHaveLength(0);
  });
  it("each rotate bumps the read generation", () => {
    expect(deriveKit([...base, ev({ action: "rotate" }, 3), ev({ action: "rotate" }, 4)])!.readGen).toBe(2);
  });
});

describe("kit sharing is private by default", () => {
  const ev = (payload: Record<string, unknown>, n: number) => ({ id: `s${n}`, seq: n, property_id: "kit-y", type: "kit", resource_id: null, actor_id: null, actor_name: null, actor_role: null, payload, created_at: `2026-02-0${n}T00:00:00Z` }) as any;
  const base = [ev({ action: "create", name: "T", address: "A" }, 1)];
  it("a new kit is not shared", () => { expect(deriveKit(base)!.sharing).toBe(false); });
  it("sharing follows the latest on/off decision", () => {
    expect(deriveKit([...base, ev({ action: "share", on: true }, 2)])!.sharing).toBe(true);
    expect(deriveKit([...base, ev({ action: "share", on: true }, 2), ev({ action: "share", on: false }, 3), ev({ action: "rotate" }, 4)])).toMatchObject({ sharing: false, readGen: 1 });
  });
});

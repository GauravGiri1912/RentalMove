import { describe, it, expect } from "vitest";
import { decideMatch, pickPrimary } from "../src/lib/roommatch";
import { canDecide } from "../src/lib/decide";
import { deriveRoomMatch, type PropertyEvent } from "../src/lib/events";

let n = 0;
const ev = (p: Partial<PropertyEvent>): PropertyEvent => ({
  id: `e${++n}`, property_id: "prop-1", type: "roommatch", resource_id: "a1", actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: {},
  created_at: new Date(2026, 0, 1, 0, n).toISOString(), ...p,
});

describe("room match", () => {
  it("uses the measured bands, and asks a person in between", () => {
    expect(decideMatch(0.995, 6).verdict).toBe("match"); // demo retakes
    expect(decideMatch(0.317, 24).verdict).toBe("mismatch"); // phone photo of another room
    expect(decideMatch(-0.12, 36).verdict).toBe("mismatch");
    expect(decideMatch(0.5, 18).verdict).toBe("unclear"); // a different angle?
    expect(decideMatch(0.3, 12).verdict).toBe("match"); // hashes agree strongly
    expect(decideMatch(0.3, 17).verdict).toBe("unclear"); // signals disagree → a person decides
  });

  it("never picks a mismatched photo as the comparison photo, unless confirmed", () => {
    const photos = [{ id: "seed" }, { id: "phone" }, { id: "retake" }];
    const m: any = { seed: { verdict: "match", view: 0.99 }, phone: { verdict: "mismatch", view: 0.3 }, retake: { verdict: "unclear", view: 0.55 } };
    expect(pickPrimary(photos, m)?.id).toBe("seed");
    expect(pickPrimary([{ id: "phone" }], m)).toBeUndefined();
    expect(pickPrimary([{ id: "phone" }, { id: "retake" }], { ...m, phone: { verdict: "confirmed", view: 0.3 } })?.id).toBe("phone");
  });

  it("lets a person's confirmation override later automatic checks", () => {
    const r = deriveRoomMatch([
      ev({ payload: { verdict: "mismatch", view: 0.31, phash: 24, ref: "asset-03" } }),
      ev({ actor_name: "Sarah", actor_role: "owner", payload: { action: "confirm" } }),
      ev({ payload: { verdict: "mismatch", view: 0.31, phash: 24, ref: "asset-03" } }),
    ]);
    expect(r.a1).toMatchObject({ verdict: "confirmed", by: "Sarah", view: 0.31 });
  });
});

describe("who decides on findings", () => {
  it("is whoever ran the inspection, else the owner", () => {
    expect(canDecide("user-owner-1", "user-owner-1", "user-owner-1")).toBe(true);
    expect(canDecide("user-tenant-1", "user-owner-1", "user-owner-1")).toBe(false);
    expect(canDecide("user-tenant-1", "user-tenant-1", "user-owner-1")).toBe(true); // tenant-run move-in
    expect(canDecide("user-owner-1", "user-tenant-1", "user-owner-1")).toBe(false);
    expect(canDecide("user-owner-1", null, "user-owner-1")).toBe(true);
  });
});

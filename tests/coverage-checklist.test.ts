import { describe, it, expect } from "vitest";
import { visitSealHash, type SealedRoom } from "../src/lib/coverage-node";
import { computeCoverage, isResolved, itemKey } from "../src/lib/coverage";
import { deriveCoverageSkips, deriveCoverageSlots, deriveCoverage, deriveSubmitted, type PropertyEvent } from "../src/lib/events";

const ev = (n: number, resource_id: string | null, payload: Record<string, unknown>): PropertyEvent =>
  ({ id: `e${n}`, property_id: "p", type: "coverage", resource_id, actor_id: null, actor_name: "Tina", actor_role: "tenant", payload, created_at: `2026-02-0${n}T10:00:00Z` }) as PropertyEvent;

describe("room checklist", () => {
  it("one photo does not complete a room", () => {
    const r = computeCoverage("kitchen", [{ id: "a", slot: "sink", areas: ["sink"] }]);
    expect(r.total).toBe(6);
    expect(r.covered).toBe(1);
    expect(isResolved(r)).toBe(false);
  });

  it("a photo filed under an item covers it before the model has looked", () => {
    const r = computeCoverage("kitchen", [{ id: "a", slot: "sink", areas: null }]);
    expect(r.items.find((i) => i.key === "sink")).toMatchObject({ covered: true, source: "declared", check: null });
  });

  it("the model seeing an area covers the item even if nothing was filed under it", () => {
    const r = computeCoverage("bedroom", [{ id: "a", areas: ["walls", "floor"] }]);
    expect(r.items.filter((i) => i.covered).map((i) => i.key)).toEqual(["walls", "floor"]);
    expect(r.items.find((i) => i.key === "walls")?.source).toBe("seen");
  });

  it("flags a photo filed under an item the analysed photo does not show", () => {
    const r = computeCoverage("kitchen", [{ id: "a", slot: "hob_oven", areas: ["floor"] }]);
    const hob = r.items.find((i) => i.key === "hob_oven")!;
    expect(hob.covered).toBe(true); // the person said so …
    expect(hob.check).toMatch(/could not see hob & oven/i); // … but the model disagrees, so it is flagged
  });

  it("a skip or not-applicable decision resolves an item without pretending it was photographed", () => {
    const skips = { sink: { kind: "skip" as const, reason: "cupboard locked" }, floor: { kind: "na" as const, reason: "n/a" } };
    const r = computeCoverage("bathroom", [{ id: "a", slot: "toilet", areas: null }], skips);
    expect(r.items.find((i) => i.key === "sink")).toMatchObject({ covered: false, resolved: { kind: "skip" } });
    expect(r.covered).toBe(1);
    expect(r.skipped).toBe(2);
    expect(isResolved(r)).toBe(false); // shower, tiles and ceiling still open
  });

  it("a room is resolved only when every item is photographed or explained", () => {
    const photos = ["walls", "floor", "window_frame", "door"].map((k) => ({ id: k, slot: k, areas: null }));
    expect(isResolved(computeCoverage("bedroom", photos))).toBe(false);
    expect(isResolved(computeCoverage("bedroom", photos, { ceiling: { kind: "skip", reason: "too high to reach" } }))).toBe(true);
  });

  it("item keys are stable and match the checklist labels", () => {
    expect(itemKey("Shower or bath")).toBe("shower_or_bath");
    expect(itemKey("Window & frame")).toBe("window_frame");
    expect(computeCoverage("bathroom", []).items.map((i) => i.key)).toContain("shower_or_bath");
  });

  it("room types without a checklist have nothing to complete", () => {
    expect(computeCoverage("exterior", []).total).toBe(0);
    expect(isResolved(computeCoverage("exterior", []))).toBe(false);
  });
});

describe("checklist events", () => {
  it("latest filing wins and null clears it", () => {
    const s = deriveCoverageSlots([ev(1, "asset1", { action: "slot", item: "sink" }), ev(2, "asset1", { action: "slot", item: "floor" }), ev(3, "asset2", { action: "slot", item: "sink" }), ev(4, "asset2", { action: "slot", item: null })]);
    expect(s).toEqual({ asset1: "floor" });
  });

  it("skips are keyed by room, visit and item, and can be undone", () => {
    const e = [
      ev(1, "room1", { action: "skip", inspection_id: "i1", item: "sink", kind: "skip", reason: "locked" }),
      ev(2, "room1", { action: "skip", inspection_id: "i1", item: "floor", kind: "na", reason: "n/a" }),
      ev(3, "room1", { action: "unskip", inspection_id: "i1", item: "floor" }),
      ev(4, "room1", { action: "skip", inspection_id: "i2", item: "sink", kind: "skip", reason: "other visit" }),
    ];
    const s = deriveCoverageSkips(e);
    expect(Object.keys(s).sort()).toEqual(["room1|i1|sink", "room1|i2|sink"]);
    expect(s["room1|i1|sink"]).toMatchObject({ kind: "skip", reason: "locked", by: "Tina" });
  });

  it("submission is recorded per visit and the first one counts", () => {
    const s = deriveSubmitted([ev(1, null, { action: "submit", inspection_id: "i1" }), ev(2, null, { action: "submit", inspection_id: "i1" })]);
    expect(s.i1.at).toBe("2026-02-01T10:00:00Z");
    expect(s.i2).toBeUndefined();
  });

  it("filing, skipping and submitting events do not disturb the model's area list", () => {
    const e = [ev(1, "asset1", { areas: ["sink", "floor"] }), ev(2, "asset1", { action: "slot", item: "sink" }), ev(3, "room1", { action: "skip", inspection_id: "i1", item: "x", kind: "na" }), ev(4, null, { action: "submit", inspection_id: "i1" })];
    expect(deriveCoverage(e)).toEqual({ asset1: ["sink", "floor"] });
  });
});

describe("visit submission seal", () => {
  const room = (over: Partial<SealedRoom> = {}): SealedRoom => ({ id: "r1", name: "Kitchen", photos: [{ id: "a", sha256: "aa", slot: "sink", uploaded_at: null }, { id: "b", sha256: "bb", slot: null, uploaded_at: null }], items: [{ key: "sink", label: "Sink", status: "photographed", reason: null, check: null }, { key: "floor", label: "Floor", status: "skipped", reason: "locked", check: null }], ...over });
  const h = (rooms: SealedRoom[]) => visitSealHash("i1", rooms);
  it("is a stable SHA-256", () => { expect(h([room()])).toMatch(/^[a-f0-9]{64}$/); expect(h([room()])).toBe(h([room()])); });
  it("does not depend on photo order or on timestamps", () => {
    const r = room();
    expect(h([r])).toBe(h([room({ photos: [...r.photos].reverse().map((p) => ({ ...p, uploaded_at: "2030-01-01" })) })]));
  });
  it("changes when a photo, its filing, a skip or a reason changes", () => {
    const base = h([room()]);
    expect(h([room({ photos: [{ id: "a", sha256: "ZZ", slot: "sink", uploaded_at: null }, { id: "b", sha256: "bb", slot: null, uploaded_at: null }] })])).not.toBe(base);
    expect(h([room({ photos: [{ id: "a", sha256: "aa", slot: "floor", uploaded_at: null }, { id: "b", sha256: "bb", slot: null, uploaded_at: null }] })])).not.toBe(base);
    expect(h([room({ items: [{ key: "sink", label: "Sink", status: "photographed", reason: null, check: null }, { key: "floor", label: "Floor", status: "skipped", reason: "different reason", check: null }] })])).not.toBe(base);
    expect(h([room({ photos: [...room().photos, { id: "c", sha256: "cc", slot: null, uploaded_at: null }] })])).not.toBe(base);
  });
  it("ignores what the vision model saw", () => {
    const seen = room({ items: [{ key: "sink", label: "Sink", status: "photographed", reason: null, check: "model could not see it" }, { key: "floor", label: "Floor", status: "skipped", reason: "locked", check: null }, { key: "worktop", label: "Worktop", status: "seen", reason: null, check: null }] });
    expect(h([seen])).toBe(h([room()]));
  });
});

describe("submission events", () => {
  const e = (n: number, payload: Record<string, unknown>) => ({ id: `e${n}`, property_id: "p", type: "coverage", resource_id: null, actor_id: null, actor_name: "T", actor_role: "tenant", payload, created_at: `2026-03-0${n}T10:00:00Z` }) as PropertyEvent;
  it("keeps the seal and counts", () => {
    expect(deriveSubmitted([e(1, { action: "submit", inspection_id: "i1", hash: "h1", photos: 4, skipped: 2 })]).i1).toMatchObject({ hash: "h1", photos: 4, skipped: 2, reopen_request: null });
  });
  it("records a reopen request, and reopening clears the submission so a new one gets a new seal", () => {
    const base = [e(1, { action: "submit", inspection_id: "i1", hash: "h1" }), e(2, { action: "reopen_request", inspection_id: "i1", note: "add the hob" })];
    expect(deriveSubmitted(base).i1.reopen_request?.note).toBe("add the hob");
    const reopened = [...base, e(3, { action: "reopen", inspection_id: "i1" })];
    expect(deriveSubmitted(reopened).i1).toBeUndefined();
    expect(deriveSubmitted([...reopened, e(4, { action: "submit", inspection_id: "i1", hash: "h2" })]).i1.hash).toBe("h2");
  });
  it("ignores a reopen request for a visit that is not submitted", () => {
    expect(deriveSubmitted([e(1, { action: "reopen_request", inspection_id: "i1", note: "x" })]).i1).toBeUndefined();
  });
});

import { deriveInvites } from "../src/lib/events";
import { signInvite, verifyInvite } from "../src/lib/invite-crypto";
import { canCreateProperty } from "../src/lib/auth";

describe("tenant invitations", () => {
  const e = (n: number, payload: Record<string, unknown>, name = "Owen") => ({ id: `i${n}`, property_id: "p", type: "invite", resource_id: null, actor_id: `u${n}`, actor_name: name, actor_role: "owner", payload, created_at: `2026-04-0${n}T10:00:00Z` }) as PropertyEvent;
  const future = "2999-01-01T00:00:00Z";
  it("a new invitation is pending", () => {
    expect(deriveInvites([e(1, { action: "create", id: "a", expires_at: future })])).toMatchObject([{ id: "a", status: "pending", email: null }]);
  });
  it("the first acceptance wins; later ones and revokes do nothing", () => {
    const inv = deriveInvites([e(1, { action: "create", id: "a", expires_at: future }), e(2, { action: "accept", id: "a" }, "Tina"), e(3, { action: "accept", id: "a" }, "Mallory"), e(4, { action: "revoke", id: "a" })])[0];
    expect(inv).toMatchObject({ status: "accepted", accepted_by: "Tina" });
  });
  it("a revoked invitation cannot be accepted", () => {
    expect(deriveInvites([e(1, { action: "create", id: "a", expires_at: future }), e(2, { action: "revoke", id: "a" }), e(3, { action: "accept", id: "a" })])[0].status).toBe("revoked");
  });
  it("expires by date", () => {
    expect(deriveInvites([e(1, { action: "create", id: "a", expires_at: "2026-04-02T00:00:00Z" })], Date.parse("2026-05-01"))[0].status).toBe("expired");
  });
  it("ignores accept/revoke events for invitations that were never created", () => {
    expect(deriveInvites([e(1, { action: "accept", id: "ghost" })])).toEqual([]);
  });
  it("tokens are signed: they verify, and cannot be edited, forged or reused after expiry", () => {
    const t = signInvite({ p: "prop-1", id: "abc", exp: Date.now() + 60_000 });
    expect(verifyInvite(t)).toMatchObject({ p: "prop-1", id: "abc" });
    const [body, mac] = t.split(".");
    const other = Buffer.from(JSON.stringify({ p: "prop-2", id: "abc", exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyInvite(`${other}.${mac}`)).toBeNull();
    expect(verifyInvite(`${body}.AAAA`)).toBeNull();
    expect(verifyInvite("garbage")).toBeNull();
    expect(verifyInvite(signInvite({ p: "prop-1", id: "abc", exp: Date.now() - 1 }))).toBeNull();
  });
  it("the same invitation always gives the same link", () => {
    const exp = Date.now() + 60_000;
    expect(signInvite({ p: "p", id: "x", exp })).toBe(signInvite({ p: "p", id: "x", exp }));
  });
});

describe("who may start a property", () => {
  const u = (o: Record<string, unknown>) => ({ id: "u", name: "U", email: "u@x", role: "tenant", owned_properties: [], ...o }) as any;
  it("a new account can", () => { expect(canCreateProperty(u({}))).toEqual({ ok: true }); });
  it("a tenant of a property cannot", () => { expect(canCreateProperty(u({ assigned_property_id: "p1" })).ok).toBe(false); });
  it("an owner can, up to three", () => {
    expect(canCreateProperty(u({ role: "owner", owned_properties: ["a", "b"] })).ok).toBe(true);
    expect(canCreateProperty(u({ role: "owner", owned_properties: ["a", "b", "c"] })).ok).toBe(false);
  });
});

import { deriveKit, deriveRemovals } from "../src/lib/events";

describe("removed photos and kit retakes", () => {
  const e = (n: number, type: string, resource_id: string | null, payload: Record<string, unknown>, name = "Tina") => ({ id: `r${n}`, property_id: "p", type, resource_id, actor_id: `u${n}`, actor_name: name, actor_role: "tenant", payload, created_at: `2026-05-0${n}T10:00:00Z` }) as PropertyEvent;
  it("a removal keeps who, when and the fingerprint, not the image", () => {
    const r = deriveRemovals([e(1, "removal", "asset-1", { room_id: "room-1", inspection_id: "i1", sha256: "abc", public_id: "x/y" })]);
    expect(r).toEqual([{ asset_id: "asset-1", room_id: "room-1", inspection_id: "i1", sha256: "abc", at: "2026-05-01T10:00:00Z", by: "Tina" }]);
    expect(JSON.stringify(r)).not.toContain("x/y");
  });
  it("ignores other event types", () => { expect(deriveRemovals([e(1, "coverage", "a", { action: "slot" })])).toEqual([]); });
  const kit = [e(1, "kit", null, { action: "create", name: "T", address: "A" }), e(2, "kit", "a1", { action: "shot", room_id: "r", shot_id: "sink", asset_id: "a1" })];
  it("removing a kit photo sends the shot back to not photographed", () => {
    expect(deriveKit(kit)!.shots).toEqual({ r: { sink: "a1" } });
    expect(deriveKit([...kit, e(3, "kit", "a1", { action: "unshot", room_id: "r", shot_id: "sink", asset_id: "a1" })])!.shots).toEqual({ r: {} });
  });
  it("a retake replaces the earlier photo of that shot", () => {
    expect(deriveKit([...kit, e(3, "kit", "a2", { action: "shot", room_id: "r", shot_id: "sink", asset_id: "a2" })])!.shots).toEqual({ r: { sink: "a2" } });
  });
});

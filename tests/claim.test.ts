import { describe, it, expect } from "vitest";
import { assessClaim, draftReply, money, parseClaim, EXAMPLES, REPLY_DISCLAIMER, type ClaimData } from "../src/lib/claim";

describe("reading a landlord's message", () => {
  it("finds the room, the part, the damage and the rupee amount", () => {
    const c = parseClaim("Shower glass is damaged, deducting ₹4,000 from your deposit.");
    expect(c.rooms).toContain("bathroom"); // "shower" implies the bathroom
    expect(c.concepts.map((x) => x.key)).toEqual(expect.arrayContaining(["glass", "shower"]));
    expect(c.damage).toContain("other");
    expect(c.amount).toEqual({ value: 4000, currency: "INR" });
  });
  it("reads amounts written in common ways", () => {
    expect(parseClaim("cut Rs 6500").amount).toEqual({ value: 6500, currency: "INR" });
    expect(parseClaim("cut Rs. 6,500 please").amount).toEqual({ value: 6500, currency: "INR" });
    expect(parseClaim("3000 rupees will be deducted").amount).toEqual({ value: 3000, currency: "INR" });
    expect(parseClaim("INR 12000").amount).toEqual({ value: 12000, currency: "INR" });
    expect(parseClaim("$250 for the stain").amount).toEqual({ value: 250, currency: "USD" });
    expect(parseClaim("no money mentioned").amount).toBeNull();
  });
  it("understands common Hinglish", () => {
    const c = parseClaim("Bathroom ka shishe pe daag hai, 3000 rupees deposit se kategi.");
    expect(c.rooms).toContain("bathroom");
    expect(c.concepts.map((x) => x.key)).toContain("glass");
    expect(c.damage).toContain("stain");
    expect(c.amount?.value).toBe(3000);
  });
  it("does not mistake words inside other words (a 'tap' is not in 'metap', 'wall' not in 'waller')", () => {
    expect(parseClaim("the metaphor of a waller").concepts).toEqual([]);
  });
  it("finds nothing in a message that names nothing", () => {
    const c = parseClaim("We need to talk about your deposit.");
    expect(c.rooms).toEqual([]);
    expect(c.concepts).toEqual([]);
  });
  it("every built-in example is understood", () => {
    for (const ex of EXAMPLES) { const c = parseClaim(ex); expect(c.concepts.length + c.damage.length).toBeGreaterThan(0); expect(c.amount).not.toBeNull(); }
  });
  it("formats money for the reply", () => {
    expect(money({ value: 4000, currency: "INR" })).toBe("₹4,000");
    expect(money(null)).toBeNull();
  });
});

// A small property: bathroom has a move-in and a move-out photo; the kitchen only has move-out.
const base = (over: Partial<ClaimData> = {}): ClaimData => ({
  rooms: [{ id: "r-bath", name: "Bathroom", category: "bathroom" }, { id: "r-kit", name: "Kitchen", category: "kitchen" }],
  inspections: [{ id: "i-in", type: "move_in", captured_at: "2024-06-01T10:00:00Z" }, { id: "i-out", type: "move_out", captured_at: "2026-06-01T10:00:00Z" }],
  assets: [
    { id: "a-bath-in", room_id: "r-bath", inspection_id: "i-in", sha256: "aa" },
    { id: "a-bath-out", room_id: "r-bath", inspection_id: "i-out", sha256: "bb" },
    { id: "a-kit-out", room_id: "r-kit", inspection_id: "i-out", sha256: "cc" },
  ],
  observations: [],
  roomMatch: {},
  measures: {},
  baselineId: "i-in",
  currentId: "i-out",
  ...over,
});
const obs = (id: string, asset_id: string, description: string, extra: Record<string, unknown> = {}) => ({ id, asset_id, category: "stain", sub_area: "shower_wall", description, review_status: "accepted", pre_existing: false, ...extra });
const claim = (text: string) => parseClaim(text);

describe("looking the claim up in the record", () => {
  it("ALREADY THERE: the move-out finding matches the same spot at move-in", () => {
    const r = assessClaim(claim("Shower glass is damaged, deducting ₹4,000"), base({ observations: [obs("o1", "a-bath-out", "Dark speckles on the glass shower screen", { pre_existing: true })] }));
    expect(r.overall).toBe("already_there");
    expect(r.items[0].room.name).toBe("Bathroom");
    expect(r.items[0].then?.asset_id).toBe("a-bath-in");
    expect(r.items[0].now?.asset_id).toBe("a-bath-out");
    expect(r.items[0].nowMatched.map((m) => m.id)).toEqual(["o1"]);
  });
  it("ALREADY THERE: also when only the move-in photo shows it", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ observations: [obs("o1", "a-bath-in", "Streaks on the glass shower screen")] }));
    expect(r.overall).toBe("already_there");
    expect(r.items[0].nowMatched).toEqual([]);
    expect(r.items[0].thenMatched).toHaveLength(1);
  });
  it("WORSE: it was there at move-in but the pixel comparison says it grew", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ observations: [obs("o1", "a-bath-out", "Stains on the glass shower screen", { pre_existing: true })], measures: { o1: { extent: 0.04, extent_prior: 0.01 } } }));
    expect(r.overall).toBe("worse");
    expect(r.items[0].nowMatched[0].trend).toBe("grew");
  });
  it("NEW: seen at move-out and not at move-in is NOT presented as the tenant's win", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ observations: [obs("o1", "a-bath-out", "Crack across the glass shower screen", { category: "crack" })] }));
    expect(r.overall).toBe("new");
    const reply = draftReply(r);
    expect(reply).not.toMatch(/already there when I moved in/i);
    expect(reply).toMatch(/do not see it in my photos from then/i);
  });
  it("NOT FOUND: nothing matches in either photo, and it says that is not proof", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ observations: [obs("o1", "a-bath-out", "Scuff on the white wall", { category: "mark", sub_area: "wall" })] }));
    expect(r.overall).toBe("not_found");
    expect(r.items[0].detail).toMatch(/not that it cannot exist/i);
  });
  it("NO BASELINE: no move-in photo of the room means it cannot be shown either way", () => {
    const r = assessClaim(claim("kitchen worktop is burnt, Rs 5000"), base({ observations: [obs("k1", "a-kit-out", "Burn mark on the worktop", { category: "mark" })] }));
    expect(r.overall).toBe("no_baseline");
    expect(draftReply(r)).not.toMatch(/already there/i);
  });
  it("a NAMED kind of damage must match: a crack claim is not 'already there' because of a stain on the same part", () => {
    const r = assessClaim(claim("The shower glass is cracked, Rs 5000"), base({ observations: [obs("o1", "a-bath-out", "Dark stains on the glass shower screen", { pre_existing: true, category: "stain" })] }));
    expect(r.overall).toBe("not_found");
    expect(r.items[0].detail).toMatch(/different mark/i);
    expect(r.items[0].detail).toMatch(/crack/i);
  });
  it("…and a general word like 'damaged' still matches any kind on that part", () => {
    const r = assessClaim(claim("The shower glass is damaged"), base({ observations: [obs("o1", "a-bath-out", "Dark stains on the glass shower screen", { pre_existing: true, category: "stain" })] }));
    expect(r.overall).toBe("already_there");
  });
  it("…and the right kind of damage on the right part still matches", () => {
    const r = assessClaim(claim("The shower glass is stained"), base({ observations: [obs("o1", "a-bath-out", "Dark stains on the glass shower screen", { pre_existing: true, category: "stain" })] }));
    expect(r.overall).toBe("already_there");
  });
  it("explains when the move-in photo exists but was left out as a different room", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ roomMatch: { "a-bath-in": { verdict: "mismatch", view: 0.1 } } }));
    expect(r.items[0].detail).toMatch(/flagged as not matching this room/i);
  });
  it("rejected findings do not count as findings", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ observations: [obs("o1", "a-bath-out", "Marks on the glass shower screen", { review_status: "rejected", pre_existing: true })] }));
    expect(r.overall).toBe("not_found");
  });
  it("UNCLEAR: a message that names no part does not guess", () => {
    const r = assessClaim(claim("There is damage, we will deduct money"), base({ observations: [obs("o1", "a-bath-out", "Marks on the glass shower screen", { pre_existing: true })] }));
    expect(r.understood).toBe(false);
    expect(r.overall).toBe("unclear");
  });
  it("with no room named, only rooms where something matches are shown", () => {
    const r = assessClaim(claim("the glass has a scratch"), base({ observations: [obs("o1", "a-bath-in", "Scratch on the glass shower screen", { category: "scratch" })] }));
    expect(r.items.map((i) => i.room.name)).toEqual(["Bathroom"]);
  });
  it("a photo flagged as a different room is not used as the move-in photo", () => {
    const r = assessClaim(claim("shower glass is damaged"), base({ roomMatch: { "a-bath-in": { verdict: "mismatch", view: 0.1 } }, observations: [obs("o1", "a-bath-in", "Streaks on the glass shower screen")] }));
    expect(r.overall).toBe("no_baseline");
  });
  it("the strongest answer for the tenant comes first when several rooms match", () => {
    const d = base({ observations: [obs("o1", "a-bath-out", "Marks on the glass shower screen", { pre_existing: true }), obs("k1", "a-kit-out", "Glass cracked on the cabinet", { category: "crack" })] });
    expect(assessClaim(claim("glass is damaged"), d).items[0].verdict).toBe("already_there");
  });
});

describe("the drafted reply", () => {
  const already = assessClaim(claim("Shower glass is damaged, deducting ₹4,000"), base({ observations: [obs("o1", "a-bath-out", "Dark speckles on the glass shower screen", { pre_existing: true })] }));
  it("states what the record shows, with the dates and the amount", () => {
    const r = draftReply(already, { tenantName: "Alex", landlordName: "Mr Rao", verifyUrl: "https://x.test/verify" });
    expect(r).toMatch(/^Hi Mr Rao,/);
    expect(r).toMatch(/1 June 2024/);
    expect(r).toMatch(/₹4,000/);
    expect(r).toMatch(/already there when I moved in/i);
    expect(r).toMatch(/https:\/\/x\.test\/verify/);
    expect(r).toMatch(/Alex$/);
  });
  it("never leaves a template placeholder behind", () => {
    for (const ex of EXAMPLES) {
      const r = draftReply(assessClaim(claim(ex), base()), { tenantName: "Alex" });
      expect(r).not.toMatch(/\{\{|\}\}|undefined|null|NaN/);
    }
  });
  it("is polite: no accusations and no legal threats", () => {
    const r = draftReply(already);
    expect(r).not.toMatch(/sue|lawyer|legal action|court|illegal|fraud|liar/i);
  });
  it("carries the not-legal-advice disclaimer text for the page", () => {
    expect(REPLY_DISCLAIMER).toMatch(/not legal advice/i);
    expect(REPLY_DISCLAIMER).toMatch(/does not decide who is responsible/i);
  });
});

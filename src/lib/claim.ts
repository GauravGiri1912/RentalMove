/**
 * claim.ts — "your landlord says you broke it?"
 *
 * Takes the text of a landlord's message, works out which room and which part it is about, and looks the claim up
 * in the record: is there a matching finding in the move-out photo, and was it already there in the move-in photo?
 * Then drafts a reply.
 *
 * Deterministic on purpose (patterns and word lists, no AI call): it is free, instant, reproducible, and it works
 * in English and common Hinglish. It cannot understand unusual wording, so when it is unsure it says so and asks for
 * the room and item instead of guessing. Pure and browser-safe so the same code runs in tests, the API and the page.
 */

import { pickPrimary } from "./roommatch";

export type RoomCategory = "living_room" | "kitchen" | "bathroom" | "bedroom" | "exterior";
export type DamageKind = "scratch" | "stain" | "crack" | "dent" | "mark" | "other";

// ---------------------------------------------------------------------------
// Reading the message
// ---------------------------------------------------------------------------

const ROOM_WORDS: Record<RoomCategory, string[]> = {
  bathroom: ["bathroom", "washroom", "restroom", "toilet", "shower", "bath tub", "bathtub", "snanghar"],
  kitchen: ["kitchen", "rasoi", "modular kitchen"],
  bedroom: ["bedroom", "bed room"],
  living_room: ["living room", "livingroom", "living", "hall", "lounge", "drawing room", "baithak"],
  exterior: ["balcony", "terrace", "garden", "patio", "exterior"],
};

interface Concept { key: string; label: string; claim: string[]; evidence: string[]; room?: RoomCategory }
/** What the landlord might name (`claim`) and the words a recorded finding would use for it (`evidence`). */
const CONCEPTS: Concept[] = [
  { key: "glass", label: "glass", claim: ["glass", "screen", "shishe", "shisha", "kaanch", "kanch"], evidence: ["glass", "screen"] },
  { key: "shower", label: "shower", claim: ["shower"], evidence: ["shower"], room: "bathroom" },
  { key: "toilet", label: "toilet", claim: ["toilet", "commode", " wc", "flush"], evidence: ["toilet", "commode", "cistern", "seat"], room: "bathroom" },
  { key: "tiles", label: "tiles", claim: ["tile", "tiles", "grout", "tiling"], evidence: ["tile", "grout"] },
  { key: "sink", label: "sink or tap", claim: ["sink", "basin", " tap", "faucet", "washbasin"], evidence: ["sink", "basin", "tap", "faucet"] },
  { key: "floor", label: "floor", claim: ["floor", "flooring", "laminate", "parquet", "carpet", "farsh"], evidence: ["floor", "laminate", "parquet", "carpet"] },
  { key: "wall", label: "wall or paint", claim: ["wall", "walls", "paint", "painting", "deewar", "diwar", "plaster", "skirting"], evidence: ["wall", "paint", "plaster", "skirting"] },
  { key: "ceiling", label: "ceiling", claim: ["ceiling", "chhat", "seepage", "damp", "dampness"], evidence: ["ceiling", "damp"] },
  { key: "mould", label: "mould", claim: ["mould", "mold", "fungus", "seelan"], evidence: ["mould", "mold", "fungus"] },
  { key: "cabinet", label: "cabinets", claim: ["cabinet", "cabinets", "cupboard", "wardrobe", "drawer", "almirah", "shelf"], evidence: ["cabinet", "cupboard", "drawer", "wardrobe", "shelf"] },
  { key: "worktop", label: "worktop", claim: ["worktop", "counter", "countertop", "platform", "slab", "kitchen top"], evidence: ["worktop", "counter", "slab", "platform"], room: "kitchen" },
  { key: "hob", label: "hob or oven", claim: ["hob", "oven", "chimney", "stove", "burner", "gas stove"], evidence: ["hob", "oven", "stove", "burner", "chimney"], room: "kitchen" },
  { key: "door", label: "door", claim: ["door", "darwaza", "handle", "lock"], evidence: ["door", "handle"] },
  { key: "window", label: "window", claim: ["window", "khidki", "pane", "window frame"], evidence: ["window", "pane"] },
];

const DAMAGE_WORDS: Record<DamageKind, string[]> = {
  scratch: ["scratch", "scratches", "scratched", "kharonch", "scrape", "scraped"],
  stain: ["stain", "stains", "stained", "daag", "dirty", "grime", "gandagi", "spot", "spots", "discolour", "discolor"],
  crack: ["crack", "cracked", "broken", "broke", "break", "shattered", "tut", "toot", "tuta", "tooti", "split"],
  dent: ["dent", "dented", "chip", "chipped"],
  mark: ["mark", "marks", "scuff", "scuffed", "burn", "burnt", "burned", "hole", "holes", "peeling"],
  other: ["damage", "damaged", "kharab", "ruined", "destroyed", "worn"],
};

export interface ParsedClaim {
  raw: string;
  rooms: RoomCategory[];
  concepts: { key: string; label: string }[];
  damage: DamageKind[];
  amount: { value: number; currency: "INR" | "USD" | "GBP" | "EUR" } | null;
}

const has = (hay: string, word: string) => (word.startsWith(" ") ? ` ${hay} `.includes(word) : new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(hay));

function parseAmount(text: string): ParsedClaim["amount"] {
  const sym: [RegExp, "INR" | "USD" | "GBP" | "EUR"][] = [
    [/(?:₹|rs\.?|inr)\s*([\d][\d,]*(?:\.\d+)?)/i, "INR"],
    [/([\d][\d,]*(?:\.\d+)?)\s*(?:rupees?|rs\b|inr|₹)/i, "INR"],
    [/\$\s*([\d][\d,]*(?:\.\d+)?)/, "USD"],
    [/£\s*([\d][\d,]*(?:\.\d+)?)/, "GBP"],
    [/€\s*([\d][\d,]*(?:\.\d+)?)/, "EUR"],
  ];
  for (const [re, currency] of sym) {
    const m = text.match(re);
    if (m) {
      const value = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0 && value < 1e8) return { value, currency };
    }
  }
  return null;
}

export function parseClaim(raw: string): ParsedClaim {
  const text = ` ${raw.toLowerCase().replace(/\s+/g, " ")} `;
  const rooms = (Object.keys(ROOM_WORDS) as RoomCategory[]).filter((r) => ROOM_WORDS[r].some((w) => has(text, w)));
  const concepts = CONCEPTS.filter((c) => c.claim.some((w) => has(text, w))).map((c) => ({ key: c.key, label: c.label }));
  // A named part implies its room ("shower" -> bathroom) when the message does not name one.
  for (const c of CONCEPTS) if (c.room && concepts.some((x) => x.key === c.key) && !rooms.includes(c.room)) rooms.push(c.room);
  // "Glass" next to "shower" is the shower glass, not a window: the specific part wins.
  const damage = (Object.keys(DAMAGE_WORDS) as DamageKind[]).filter((d) => DAMAGE_WORDS[d].some((w) => has(text, w)));
  return { raw, rooms, concepts, damage, amount: parseAmount(raw) };
}

// ---------------------------------------------------------------------------
// Looking it up in the record
// ---------------------------------------------------------------------------

export interface ClaimData {
  rooms: { id: string; name: string; category: string }[];
  inspections: { id: string; type: string; captured_at: string }[];
  assets: { id: string; room_id: string; inspection_id: string; sha256?: string | null }[];
  observations: { id: string; asset_id: string; category: string; sub_area: string; description: string; review_status: string; pre_existing?: boolean }[];
  roomMatch: Record<string, { verdict: any; view: number | null }>;
  measures: Record<string, { extent: number; extent_prior: number | null }>;
  baselineId: string | null;
  currentId: string | null;
}

export type Verdict = "already_there" | "worse" | "new" | "not_found" | "no_baseline" | "no_current" | "unclear";

export interface Matched { id: string; description: string; sub_area: string; pre_existing: boolean; review_status: string; trend: "grew" | "same" | "smaller" | null; asset_id: string }
export interface Snap { asset_id: string; inspection_id: string; date: string; sha256: string | null }
export interface ClaimItem {
  room: { id: string; name: string; category: string };
  verdict: Verdict;
  headline: string;
  detail: string;
  then: Snap | null;
  now: Snap | null;
  /** Findings in the move-out photo that match the claim. */
  nowMatched: Matched[];
  /** Findings in the move-in photo that match the claim. */
  thenMatched: Matched[];
}
export interface ClaimResult { claim: ParsedClaim; items: ClaimItem[]; overall: Verdict; understood: boolean }

const GROW = 1.25;

function trendOf(m: { extent: number; extent_prior: number | null } | undefined): Matched["trend"] {
  if (!m || !m.extent_prior || m.extent_prior <= 0) return null;
  const r = m.extent / m.extent_prior;
  return r >= GROW ? "grew" : r <= 1 / GROW ? "smaller" : "same";
}

export function assessClaim(claim: ParsedClaim, d: ClaimData): ClaimResult {
  const usableConcepts = CONCEPTS.filter((c) => claim.concepts.some((x) => x.key === c.key));
  const text = (o: ClaimData["observations"][number]) => `${o.category} ${o.sub_area} ${o.description}`.toLowerCase();
  // "Damaged" is general; "cracked", "stained", "scratched" name a kind. When the message names a kind, a finding of
  // another kind on the same part is NOT a match: telling a tenant "already there" about a different mark would be false comfort.
  const kinds = claim.damage.filter((k) => k !== "other");
  const kindOk = (o: ClaimData["observations"][number]) => {
    if (!kinds.length) return true;
    const t = text(o);
    return kinds.some((k) => o.category === k || DAMAGE_WORDS[k].some((w) => has(t, w)));
  };
  const partOk = (o: ClaimData["observations"][number], roomCat: string) => {
    const t = text(o);
    const forRoom = usableConcepts.filter((c) => !c.room || c.room === roomCat);
    return forRoom.length ? forRoom.some((c) => c.evidence.some((w) => t.includes(w))) : null; // null = no part named
  };
  const matches = (o: ClaimData["observations"][number], roomCat: string) => {
    const part = partOk(o, roomCat);
    if (part === null) return kinds.length > 0 && kindOk(o);
    return part && kindOk(o);
  };
  /** Findings on the named part that are of a different kind than the message says. */
  const related = (o: ClaimData["observations"][number], roomCat: string) => partOk(o, roomCat) === true && !kindOk(o);

  const date = (id: string | null) => d.inspections.find((i) => i.id === id)?.captured_at ?? "";
  const primary = (roomId: string, inspId: string | null) => (inspId ? pickPrimary(d.assets.filter((a) => a.room_id === roomId && a.inspection_id === inspId), d.roomMatch as any) : undefined);
  const snap = (a: ClaimData["assets"][number] | undefined, inspId: string | null): Snap | null => (a && inspId ? { asset_id: a.id, inspection_id: inspId, date: date(inspId), sha256: a.sha256 ?? null } : null);

  const understood = usableConcepts.length > 0 || (claim.damage.length > 0 && claim.rooms.length > 0);
  // Which rooms to look in: the ones named; otherwise every room (the part named may only exist in one).
  const roomCats: string[] = claim.rooms.length ? claim.rooms : [];
  const candidates = d.rooms.filter((r) => (roomCats.length ? roomCats.includes(r.category) : true));

  const items: ClaimItem[] = [];
  for (const room of candidates) {
    const base = primary(room.id, d.baselineId);
    const cur = primary(room.id, d.currentId);
    const active = (a: ClaimData["assets"][number] | undefined) => (a ? d.observations.filter((o) => o.asset_id === a.id && o.review_status !== "rejected") : []);
    const live = (a: ClaimData["assets"][number] | undefined) => active(a).filter((o) => matches(o, room.category));
    const otherKinds = [...active(base), ...active(cur)].filter((o) => related(o, room.category)).length;
    const toMatched = (o: ClaimData["observations"][number]): Matched => ({ id: o.id, description: o.description, sub_area: o.sub_area, pre_existing: !!o.pre_existing, review_status: o.review_status, trend: trendOf(d.measures[o.id]), asset_id: o.asset_id });
    const nowM = live(cur).map(toMatched), thenM = live(base).map(toMatched);
    const item = (verdict: Verdict, headline: string, detail: string): ClaimItem => ({ room, verdict, headline, detail, then: snap(base, d.baselineId), now: snap(cur, d.currentId), nowMatched: nowM, thenMatched: thenM });

    // With no room named, only rooms where something matches are worth showing.
    if (!roomCats.length && !nowM.length && !thenM.length) continue;

    if (!understood) { items.push(item("unclear", "Not enough to go on", "The message does not name a part of the home (for example shower glass, floor, wall or cabinet).")); continue; }
    if (!base) {
      const leftOut = d.assets.some((a) => a.room_id === room.id && a.inspection_id === d.baselineId);
      items.push(item("no_baseline", `No usable move-in photo of the ${room.name.toLowerCase()}`, leftOut
        ? "There is a move-in photo, but it was flagged as not matching this room and left out, so RentalMove cannot use it to show the claim was already there. If the flag is wrong, confirm the photo in Capture and ask again."
        : "Without a photo from move-in, RentalMove cannot show that this was already there. A move-in record made at the start would have."));
      continue;
    }
    if (!cur) { items.push(item("no_current", `No move-out photo of the ${room.name.toLowerCase()}`, "There is no photo of this room at the latest visit to compare against.")); continue; }

    const already = nowM.some((m) => m.pre_existing) || thenM.length > 0;
    if (!nowM.length && !thenM.length) {
      items.push(item("not_found", "RentalMove found nothing matching in either photo",
        otherKinds > 0
          ? `There ${otherKinds === 1 ? "is a different mark" : `are ${otherKinds} different marks`} recorded on that part, but none described as ${kinds.join(" or ")}. That is not proof it is not there, so look at the two photos yourself.`
          : "No finding in the move-in or move-out photo matches this. That means it was not detected, not that it cannot exist somewhere the photos do not show, so look at the two photos yourself."));
    } else if (already) {
      const grew = nowM.some((m) => m.trend === "grew");
      items.push(grew
        ? item("worse", "It was there at move-in, but looks bigger now", "A matching mark is in the move-in photo, and the pixel comparison says it has grown since. The part that was there at move-in is not yours; the growth may be discussed.")
        : item("already_there", "Already there at move-in", nowM.length ? "A matching finding in the move-out photo lines up with the same spot in the move-in photo, and it is not noticeably larger now." : "A matching mark is in the move-in photo, and nothing matching is recorded in the move-out photo."));
    } else {
      items.push(item("new", "Seen at move-out, not at move-in", "A matching finding is in the move-out photo and none is in the move-in photo. The claim may be fair; ask for the landlord's photos and how the amount was worked out."));
    }
  }

  if (!items.length) {
    items.push({ room: { id: "", name: "the home", category: "" }, verdict: "unclear", headline: understood ? "Nothing in the record matches this" : "Not enough to go on", detail: understood ? "No room has a finding that matches what the message describes." : "Mention the room and the part (for example \"bathroom shower glass\"), and try again.", then: null, now: null, nowMatched: [], thenMatched: [] });
  }

  // The most useful answer first: the one that helps the tenant most, then the ones that need attention.
  const order: Verdict[] = ["already_there", "worse", "new", "not_found", "no_baseline", "no_current", "unclear"];
  items.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
  return { claim, items, overall: items[0].verdict, understood };
}

// ---------------------------------------------------------------------------
// The reply
// ---------------------------------------------------------------------------

const MONEY: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };
export const money = (a: ParsedClaim["amount"]) => (a ? `${MONEY[a.currency]}${a.value.toLocaleString("en-IN")}` : null);

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "move-in");

export const REPLY_DISCLAIMER = "This is a draft to edit before you send it. It is not legal advice, and RentalMove does not decide who is responsible.";

/** A polite reply the tenant can edit. It states only what the record shows. */
export function draftReply(result: ClaimResult, ctx: { tenantName?: string; landlordName?: string; verifyUrl?: string } = {}): string {
  const top = result.items[0];
  const amt = money(result.claim.amount);
  const part = result.claim.concepts.map((c) => c.label)[0] ?? "the item";
  const where = top.room.name && top.room.id ? top.room.name.toLowerCase() : "the home";
  const hello = `Hi${ctx.landlordName ? ` ${ctx.landlordName}` : ""},`;
  const sign = `\n\nThanks,\n${ctx.tenantName ?? ""}`.trimEnd();
  const verify = ctx.verifyUrl ? `\n\nAny photo can be checked against the record at ${ctx.verifyUrl}.` : "";
  const thenDate = top.then ? fmt(top.then.date) : "";
  const nowDate = top.now ? fmt(top.now.date) : "";
  const ask = `Could you please send the photos you are relying on and a breakdown of how${amt ? ` ${amt}` : " the amount"} was worked out?`;

  switch (top.verdict) {
    case "already_there":
      return `${hello}\n\nThanks for flagging the ${part} in the ${where}. I checked my move-in record, which was made on ${thenDate}: that mark was already there when I moved in, in the same spot, and it is not noticeably larger at the ${nowDate} visit.${amt ? `\n\nBecause it was there from the start, I do not think ${amt} should be deducted for it.` : "\n\nBecause it was there from the start, I do not think it should be deducted."} The photos are fingerprinted and sealed, so they cannot have been changed since.${verify}\n\nHappy to go through the photos together.${sign}`;
    case "worse":
      return `${hello}\n\nThanks for flagging the ${part} in the ${where}. My move-in record from ${thenDate} shows a mark in that spot already, so the part that was there from the start should not be charged. I can see it looks larger at the ${nowDate} visit, and I am willing to discuss a fair share for the difference.${amt ? ` Could you explain how ${amt} was worked out, so we can separate the two?` : ""}${verify}${sign}`;
    case "new":
      return `${hello}\n\nThanks for letting me know about the ${part} in the ${where}. I have checked my move-in record from ${thenDate}, and I do not see it in my photos from then, but I do see it in the photos from ${nowDate}. ${ask} I would like to understand what happened and look at it together.${verify}${sign}`;
    case "not_found":
      return `${hello}\n\nThanks for flagging the ${part} in the ${where}. I have checked my move-in and move-out photos and could not find it in either. ${ask}${verify}${sign}`;
    case "no_baseline":
    case "no_current":
    case "unclear":
    default:
      return `${hello}\n\nThanks for your message about the ${part} in the ${where}. Before anything is deducted, ${ask.charAt(0).toLowerCase()}${ask.slice(1)} I will compare it with my records and get back to you.${verify}${sign}`;
  }
}

export const EXAMPLES = [
  "Shower glass is damaged, deducting ₹4,000 from your deposit.",
  "Bathroom floor tiles are stained and the glass has marks. Rs 6500 will be cut from the deposit.",
  "Bathroom ka shishe pe daag hai, 3000 rupees deposit se kategi.",
];

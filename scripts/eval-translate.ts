/**
 * eval-translate.ts — translates this property's record text into Hindi through the same
 * cached path the report uses, and prints English → Hindi pairs for a human check.
 *
 *   npx tsx --env-file=.env scripts/eval-translate.ts
 *
 * Automatic checks: every string translated, Devanagari-only script, numbers/units preserved,
 * and no blame/cost vocabulary introduced (Hindi terms for fault, liability, penalty, deduction).
 */

import { getDatabase } from "../src/lib/db";
import { translateTexts, validTranslation } from "../src/lib/translate";
import { wearContext } from "../src/lib/wear";

const P = "prop-381";
const BLAME = /दोष|ज़िम्मेदार|जिम्मेदार|जुर्माना|कटौती|हर्जाना|लापरवाह|क्षतिपूर्ति/;

async function main() {
  const db = getDatabase();
  const rooms = await db.getRooms(P);
  const insps = await db.getInspections(P);
  const assets = await db.getAssetsForInspections(insps.map((i) => i.id));
  const obs = await db.getObservationsForAssets(assets.map((a) => a.id));
  const texts = [
    ...rooms.map((r) => r.name),
    ...obs.map((o) => o.description),
    ...[...new Set(obs.map((o) => o.sub_area.replace(/_/g, " ")))],
    wearContext({ category: "stain", sub_area: "shower base", months: 24, trend_ratio: 3.4 }).text,
    wearContext({ category: "mark", sub_area: "wall", months: 24, long_cm: 6 }).text,
    "Grew ×3.4 since the last visit",
    "Ceiling",
    "Tiles & grout",
  ];
  const t0 = Date.now();
  const r = await translateTexts(P, "hi", texts);
  console.log(`translated now: ${r.translated_now}, failed: ${r.failed}, ${Date.now() - t0} ms\n`);
  let issues = 0;
  for (const en of [...new Set(texts)]) {
    const hi = r.translations[en];
    const nums = en.match(/\d+(\.\d+)?/g) ?? [];
    const problems = [
      !hi && "missing",
      hi && !validTranslation("hi", hi) && "wrong script",
      hi && nums.some((x) => !hi.includes(x)) && "number changed",
      hi && BLAME.test(hi) && "blame vocabulary",
    ].filter(Boolean);
    if (problems.length) issues++;
    console.log(`${problems.length ? "!! " + problems.join(", ") : "ok"}\n  EN ${en}\n  HI ${hi ?? "—"}`);
  }
  console.log(`\n${issues} string(s) with issues of ${new Set(texts).size}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

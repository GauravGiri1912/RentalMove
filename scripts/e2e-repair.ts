/**
 * e2e-repair.ts — the repair loop end to end against a running server, through Cloudinary.
 *
 *   npx tsx --env-file=.env scripts/e2e-repair.ts [baseUrl=http://localhost:3000]
 *
 * Opens a work order on the bathroom grout finding, uploads (signed, direct to Cloudinary)
 *   1. a re-shot of the room WITHOUT the change (stands in for a real repair) → expect "reduced"
 *   2. a re-shot of the finding photo itself (nothing repaired)               → expect "unchanged"
 *   3. a photo of a different room                                            → expect "unclear"
 * and reads the server's verdicts. Cancels the work order at the end, so no simulated repair
 * is left on record. The three test photos stay in Cloudinary under properties/prop-381/repairs/.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const P = "prop-381";
const IMG = (p: string) => fs.readFileSync(path.join(process.cwd(), "seed/images", p));

async function reshot(buf: Buffer) {
  const m = await sharp(buf).metadata();
  const W = m.width!, H = m.height!;
  return sharp(buf).resize(Math.round(W * 1.04), Math.round(H * 1.04)).extract({ left: Math.round(W * 0.03), top: Math.round(H * 0.025), width: W, height: H }).modulate({ brightness: 1.03 }).jpeg({ quality: 88 }).toBuffer();
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: "sarah.owner@rentalmove.demo", password: "DemoPassword123!" });
  if (error) throw error;
  const H = { Authorization: `Bearer ${data.session!.access_token}`, "Content-Type": "application/json" };
  const call = async (p: string, body?: unknown) => {
    const r = await fetch(BASE + p, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const snap = (await call(`/api/properties/${P}/snapshot`)).body;
  const bath26 = snap.assets.find((a: any) => a.cloudinary_public_id.includes("2026") && a.cloudinary_public_id.includes("bathroom")) ?? snap.assets.find((a: any) => a.id === "asset-08");
  const grout = snap.observations
    .filter((o: any) => o.asset_id === bath26.id && snap.measures[o.id]?.extent > 0)
    .sort((a: any, b: any) => snap.measures[b.id].extent - snap.measures[a.id].extent)[0];
  console.log(`finding ${grout.id} on ${bath26.id}: ${grout.category} — ${grout.description.slice(0, 70)}…`);
  if (snap.work_orders?.[grout.id]) await call(`/api/observations/${grout.id}/workorder`, { action: "cancel" });

  const wo = `/api/observations/${grout.id}/workorder`;
  console.log("create:", (await call(wo, { action: "create", assignee: "e2e test", note: "automated check" })).status);

  const cases: [string, Buffer, string][] = [
    ["repaired (re-shot of the room without the change)", await reshot(IMG("2024/bathroom/shower-tile-01.jpg")), "reduced"],
    ["not repaired (re-shot of the finding photo)", await reshot(IMG("2026/bathroom/shower-tile-03.jpg")), "unchanged"],
    ["different room", IMG("2026/kitchen/cabinet-base-03.jpg"), "unclear"],
  ];
  let ok = 0;
  for (const [label, buf, expected] of cases) {
    const sig = (await call(wo, { action: "sign" })).body;
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "repair.jpg");
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature);
    form.append("folder", sig.folder);
    form.append("tags", sig.tags);
    const up = await (await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: form })).json();
    if (!up.public_id) throw new Error(`upload failed: ${JSON.stringify(up).slice(0, 200)}`);
    const r = await call(wo, { action: "photo", public_id: up.public_id });
    const c = r.body?.check;
    const pass = c?.verdict === expected;
    if (pass) ok++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}: ${c?.verdict} (expected ${expected}) · view ${c?.view_match?.toFixed(2)} · before ${(c?.extent_before * 1e4).toFixed(1)}‱ after ${(c?.extent_after * 1e4).toFixed(1)}‱`);
  }
  const after = (await call(`/api/properties/${P}/snapshot`)).body.work_orders[grout.id];
  console.log(`history: ${after.history.map((h: any) => h.text).join(" | ")}`);
  console.log("cancel:", (await call(wo, { action: "cancel" })).status);
  console.log(`\n${ok}/${cases.length} verdicts as expected`);
  process.exit(ok === cases.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

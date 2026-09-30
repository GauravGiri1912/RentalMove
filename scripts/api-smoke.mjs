/**
 * api-smoke.mjs — integration checks against a running server, as both demo users.
 * Leaves no lasting data: positions and signatures are withdrawn, test links revoked.
 *
 *   node scripts/api-smoke.mjs [baseUrl=http://localhost:3000]
 */
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.loadEnvFile(".env");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.argv[2] || "http://localhost:3000";
const P = "prop-381";
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };

async function login(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: "DemoPassword123!" });
  if (error) throw error;
  return { Authorization: `Bearer ${data.session.access_token}` };
}
async function call(h, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...h, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let b = null;
  try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}

const owner = await login("sarah.owner@rentalmove.demo");
const tenant = await login("alex.tenant@rentalmove.demo");

// Snapshot
const snap = await call(owner, "GET", `/api/properties/${P}/snapshot`);
check("snapshot loads for owner", snap.status === 200 && snap.body.assets.length > 0, `${snap.body?.assets?.length} assets, ${snap.body?.observations?.length} findings, event store ${snap.body?.meta?.event_store}`);
check("snapshot has report hash", /^[a-f0-9]{64}$/.test(snap.body?.report?.content_hash ?? ""));
check("unauthenticated snapshot is 401", (await call({}, "GET", `/api/properties/${P}/snapshot`)).status === 401);
const obs = snap.body.observations.find((o) => o.review_status === "pending") ?? snap.body.observations[0];

// Positions (stance) — set, then withdraw
const st1 = await call(tenant, "POST", `/api/observations/${obs.id}/stance`, { stance: "dispute" });
check("tenant can dispute a finding", st1.status === 200);
const snap2 = await call(tenant, "GET", `/api/properties/${P}/snapshot`);
check("dispute appears in snapshot", snap2.body.stances[obs.id]?.tenant === "dispute");
check("withdraw position", (await call(tenant, "POST", `/api/observations/${obs.id}/stance`, { stance: null })).status === 200);
check("invalid stance rejected", (await call(tenant, "POST", `/api/observations/${obs.id}/stance`, { stance: "maybe" })).status === 400);
check("empty comment rejected", (await call(tenant, "POST", `/api/observations/${obs.id}/comments`, { text: "  " })).status === 400);
check("stance on unknown finding is 403", (await call(tenant, "POST", `/api/observations/obs-does-not-exist/stance`, { stance: "agree" })).status === 403);

// Signatures — stale hash refused, current accepted, then withdrawn
const stale = await call(owner, "POST", "/api/report/sign", { property_id: P, hash: "0".repeat(64) });
check("signing a stale report hash is refused (409)", stale.status === 409);
const cur = (await call(owner, "GET", `/api/properties/${P}/snapshot`)).body.report.content_hash;
check("owner signs current hash", (await call(owner, "POST", "/api/report/sign", { property_id: P, hash: cur })).status === 200);
check("withdraw signature", (await call(owner, "POST", "/api/report/sign", { property_id: P, hash: null })).status === 200);

// Media signing — owner may sign generative recipes, tenant may not
const assetId = snap.body.assets[0].id;
const ownGen = await call(owner, "POST", "/api/media/sign", { items: [{ asset_id: assetId, recipe: { kind: "listing", remove: false, enhance: true, ratio: "3:2", watermark: true } }] });
check("owner gets a signed listing URL", ownGen.status === 200 && /\/s--[^/]+--\//.test(ownGen.body.urls[0]), ownGen.body?.urls?.[0]?.slice(0, 90));
check("tenant cannot sign generative recipes (403)", (await call(tenant, "POST", "/api/media/sign", { items: [{ asset_id: assetId, recipe: { kind: "listing", remove: true, enhance: false, ratio: "1:1", watermark: true } }] })).status === 403);
check("raw transformation strings are rejected (400)", (await call(owner, "POST", "/api/media/sign", { items: [{ asset_id: assetId, recipe: { kind: "raw", t: "e_gen_remove" } }] })).status === 400);
const lab = await call(tenant, "POST", "/api/media/sign", { items: [{ asset_id: assetId, recipe: { kind: "lab", crop: "4:3", width: 600, effects: ["pixelate"], format: "auto", quality: "auto" } }] });
check("tenant can sign a lab recipe", lab.status === 200);
const labImg = await fetch(lab.body.urls[0]);
check("signed lab URL renders on Cloudinary", labImg.status === 200, `${labImg.headers.get("content-type")} ${labImg.headers.get("content-length")} B`);

// Share link with recipient watermark → public view → revoke
const share = await call(owner, "POST", "/api/share", { property_id: P, expires_in_days: 1, recipient: "API smoke test" });
check("create share link with recipient", share.status === 201 && share.body.share_url.includes("/r/"));
const pub = await call({}, "GET", `/api/share/${share.body.token}`);
const img = pub.body?.report?.rooms?.find((r) => r.after || r.before);
const u = img?.after?.url ?? img?.before?.url ?? "";
check("public share view works without login", pub.status === 200);
check("shared images are pixelated + watermarked + signed", u.includes("e_pixelate_faces") && u.includes("l_text") && /\/s--[^/]+--\//.test(u));
check("public view hides pending findings", pub.body.report.rooms.every((r) => r.findings.every((f) => f.review_status === "accepted" || f.review_status === "edited")));
check("tenant cannot revoke owner's link (403)", (await call(tenant, "DELETE", `/api/share/${share.body.token}`)).status === 403);
check("anonymous cannot revoke (401)", (await call({}, "DELETE", `/api/share/${share.body.token}`)).status === 401);
check("owner revokes", (await call(owner, "DELETE", `/api/share/${share.body.token}`)).status === 200);
check("revoked link is gone (404)", (await call({}, "GET", `/api/share/${share.body.token}`)).status === 404);

// Verify
const withSha = snap.body.assets.find((a) => a.sha256);
const v1 = await call({}, "POST", "/api/verify", { sha256: withSha.sha256 });
check("verify matches a recorded file", v1.status === 200 && v1.body.match === true, `${v1.body?.room} · ${v1.body?.inspection_type}`);
check("verify does not reveal the address", !JSON.stringify(v1.body).includes("Elmwood"));
check("verify reports unknown files", (await call({}, "POST", "/api/verify", { sha256: "a".repeat(64) })).body.match === false);

// Phone handoff
const insp = snap.body.inspections[snap.body.inspections.length - 1];
const room = snap.body.rooms[0];
const ho = await call(tenant, "POST", "/api/handoff", { property_id: P, inspection_id: insp.id, room_id: room.id });
check("create handoff token", ho.status === 201);
const info = await call({}, "GET", `/api/handoff/${ho.body.token}/info`);
check("phone can read handoff info without login", info.status === 200 && info.body.room === room.name);
const sig = await call({}, "POST", `/api/handoff/${ho.body.token}/sign`);
check("phone gets an upload signature scoped to the room", sig.status === 200 && sig.body.folder === `properties/${P}/${insp.id}/${room.category}`, sig.body?.folder);
const tampered = ho.body.token.slice(0, -3) + "AAA";
check("tampered handoff token is refused (401)", (await call({}, "GET", `/api/handoff/${tampered}/info`)).status === 401);
check("register outside the token's scope is refused (403)", (await call({}, "POST", `/api/handoff/${ho.body.token}/register`, { cloudinary_public_id: "properties/prop-999/x/y/z", secure_url: "https://res.cloudinary.com/x/y.jpg", sha256: "b".repeat(64) })).status === 403);

// Security fixes
check("finding edits require access (tenant → unknown finding 403)", (await call(tenant, "PATCH", "/api/observations/obs-nope", { review_status: "accepted" })).status === 403);
const sign = await call(owner, "POST", "/api/uploads/sign", { property_id: P, inspection_id: insp.id, room: room.category });
check("upload tags carry the real inspection type", sign.status === 200 && sign.body.tags.includes(insp.type), sign.body?.tags);

// Insights: measures, coverage, calibration, repair loop
check("snapshot carries measures and coverage", Object.keys(snap.body.measures ?? {}).length > 0 && Object.keys(snap.body.coverage ?? {}).length > 0, `${Object.keys(snap.body.measures ?? {}).length} measures, ${Object.keys(snap.body.coverage ?? {}).length} coverage`);
const grown = Object.values(snap.body.measures ?? {}).filter((m) => m.extent_prior > 0 && m.extent / m.extent_prior >= 1.25);
check("a finding measures as grown between visits", grown.length > 0, grown.map((m) => `×${(m.extent / m.extent_prior).toFixed(2)}`).join(", "));
const asset0 = snap.body.assets[0];
const hadCal = !!snap.body.calibrations?.[asset0.id];
check("calibration rejects a too-short line (400)", (await call(tenant, "POST", `/api/assets/${asset0.id}/calibration`, { line: [0.5, 0.5, 0.505, 0.5], cm: 8.6, reference: "switch" })).status === 400);
check("calibration saves", (await call(tenant, "POST", `/api/assets/${asset0.id}/calibration`, { line: [0.1, 0.5, 0.3, 0.5], cm: 8.6, reference: "switch" })).status === 200);
const snapCal = await call(owner, "GET", `/api/properties/${P}/snapshot`);
check("calibration appears in snapshot", snapCal.body.calibrations?.[asset0.id]?.cm === 8.6);
if (!hadCal) await call(tenant, "POST", `/api/assets/${asset0.id}/calibration`, { clear: true });
check("calibration on a foreign photo is refused (403)", (await call(tenant, "POST", "/api/assets/asset-nope/calibration", { clear: true })).status === 403);
const woObs = snap.body.observations.find((o) => !snap.body.work_orders?.[o.id]);
check("tenant cannot create a work order (403)", (await call(tenant, "POST", `/api/observations/${woObs.id}/workorder`, { action: "create", assignee: "x" })).status === 403);
check("status without a work order is 404", (await call(owner, "POST", `/api/observations/${woObs.id}/workorder`, { action: "status", status: "done" })).status === 404);
check("owner creates a work order", (await call(owner, "POST", `/api/observations/${woObs.id}/workorder`, { action: "create", assignee: "Smoke Test Ltd", note: "smoke" })).status === 200);
check("duplicate work order is 409", (await call(owner, "POST", `/api/observations/${woObs.id}/workorder`, { action: "create" })).status === 409);
const woSig = await call(tenant, "POST", `/api/observations/${woObs.id}/workorder`, { action: "sign" });
check("repair upload signature is scoped to the finding, no webhook", woSig.status === 200 && woSig.body.folder === `properties/${P}/repairs/${woObs.id}` && !woSig.body.notificationUrl, woSig.body?.folder);
check("repair photo outside the folder is refused (400)", (await call(tenant, "POST", `/api/observations/${woObs.id}/workorder`, { action: "photo", public_id: `properties/${P}/other/x` })).status === 400);
check("owner moves work order to in progress", (await call(owner, "POST", `/api/observations/${woObs.id}/workorder`, { action: "status", status: "in_progress" })).status === 200);
const snapWo = await call(tenant, "GET", `/api/properties/${P}/snapshot`);
check("tenant sees the work order", snapWo.body.work_orders?.[woObs.id]?.status === "in_progress");
check("owner cancels the work order", (await call(owner, "POST", `/api/observations/${woObs.id}/workorder`, { action: "cancel" })).status === 200);

// Features 6–9: photo time, Hindi report, voice notes, not-sure bucket
check("snapshot carries EXIF read state and assessments", snap.body.assets.every((a) => "exif" in a) && "assessments" in snap.body);
check("translate needs login (401)", (await call({}, "POST", "/api/translate", { property_id: P, lang: "hi", texts: ["x"] })).status === 401);
check("translate rejects unsupported languages (400)", (await call(tenant, "POST", "/api/translate", { property_id: P, lang: "fr", texts: ["x"] })).status === 400);
check("translate refuses a foreign property (403)", (await call(tenant, "POST", "/api/translate", { property_id: "prop-999", lang: "hi", texts: ["x"] })).status === 403);
const cachedText = snap.body.observations.find((o) => o.asset_id === "asset-08")?.description;
const tr = await call(tenant, "POST", "/api/translate", { property_id: P, lang: "hi", texts: [cachedText] });
check("translation served from cache (no model call)", tr.status === 200 && tr.body.translated_now === 0 && /[ऀ-ॿ]/.test(tr.body.translations?.[cachedText] ?? ""), (tr.body.translations?.[cachedText] ?? "").slice(0, 40));
const vs = await call(tenant, "POST", `/api/observations/${obs.id}/voice`);
check("voice upload signature is scoped to the finding, no webhook", vs.status === 200 && vs.body.folder === `properties/${P}/voice/${obs.id}` && !vs.body.notificationUrl, vs.body?.folder);
check("voice note from another finding's folder is refused (400)", (await call(tenant, "POST", `/api/observations/${obs.id}/comments`, { text: "", voice: { public_id: `properties/${P}/voice/other/x`, lang: "hi-IN" } })).status === 400);
check("empty comment without voice is refused (400)", (await call(tenant, "POST", `/api/observations/${obs.id}/comments`, { text: "" })).status === 400);
check("voice sign on a foreign finding is refused (403)", (await call(tenant, "POST", "/api/observations/obs-nope/voice")).status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

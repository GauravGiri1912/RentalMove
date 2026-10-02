/**
 * e2e-photo-visibility.ts — does a freshly captured photo actually appear on every screen that should show it?
 *
 *   npx tsx --env-file=.env scripts/e2e-photo-visibility.ts [baseUrl=http://localhost:3000]
 *
 * Makes a throwaway property (owner: the demo owner) with a Kitchen, uploads TWO real photos the way the app does
 * (signed upload straight to Cloudinary, then register): a move-in photo and a later "current" photo. Then opens each
 * studio screen in a phone-sized browser and checks that each photo is on the page and really loaded (not a broken
 * image), and that the public share link shows them too. Prints a table; fails on any screen where a photo that
 * should be there is missing. Cost: two uploads and two vision-model analyses. Cleans up after itself.
 */

import fs from "fs";
import path from "path";
import puppeteer, { type Page } from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { getDatabase } from "../src/lib/db";
import { ensureCloudinaryConfig } from "../src/lib/media";

const BASE = process.argv[2] || "http://localhost:3000";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const OUT = path.join(process.cwd(), ".e2e", "visibility");
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  ensureCloudinaryConfig();
  const db = getDatabase();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: "sarah.owner@rentalmove.demo", password: "DemoPassword123!" });
  if (error) throw error;
  const h = { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" };
  const call = async (method: string, p: string, body?: unknown) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

  const prop = await db.createProperty({ address_label: "E2E visibility sandbox", unit_label: "-", owner_id: data.user.id, rooms: [{ name: "Kitchen", category: "kitchen" }] });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const problems: string[] = [];
  const uploaded: string[] = [];
  const table: { page: string; baseline: string; current: string }[] = [];
  try {
    const room = (await db.getRooms(prop.id))[0];
    const base = await db.createInspection({ property_id: prop.id, type: "move_in", captured_at: "2024-06-01T10:00:00Z", status: "completed", captured_by: "Sarah", created_by: data.user.id } as any);
    const cur = await db.createInspection({ property_id: prop.id, type: "inspection", captured_at: new Date().toISOString(), status: "completed", captured_by: "Sarah", created_by: data.user.id } as any);

    // Upload exactly as the capture page does: sign, direct upload to Cloudinary, register.
    const sendPhoto = async (inspId: string, file: string) => {
      const buf = fs.readFileSync(path.join(process.cwd(), "seed/images", file));
      // Signed here without the webhook (CLOUDINARY_NOTIFICATION_URL points at a deployed app, which should not hear about
      // throwaway test photos). Registration below is the app's real path.
      const cfg = cloudinary.config();
      const folder = `properties/${prop.id}/${inspId}/${room.category}`, tags = "e2e-visibility", timestamp = Math.floor(Date.now() / 1000);
      const sig = { cloudName: cfg.cloud_name, apiKey: cfg.api_key, timestamp, folder, tags, signature: cloudinary.utils.api_sign_request({ folder, tags, timestamp }, cfg.api_secret as string) };
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "p.jpg");
      for (const k of ["apiKey", "timestamp", "signature", "folder", "tags"]) form.append(k === "apiKey" ? "api_key" : k, String((sig as any)[k]));
      let up: any;
      for (let i = 1; ; i++) { try { up = await (await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) })).json(); break; } catch (e) { if (i >= 3) throw e; await sleep(2000 * i); } }
      if (!up.public_id) throw new Error(`upload refused: ${JSON.stringify(up).slice(0, 160)}`);
      uploaded.push(up.public_id);
      const sha = (await import("crypto")).createHash("sha256").update(buf).digest("hex");
      const reg = await call("POST", "/api/assets/register", { property_id: prop.id, inspection_id: inspId, room_id: room.id, cloudinary_public_id: up.public_id, secure_url: up.secure_url, etag: up.etag, sha256: sha, width: up.width, height: up.height, captured_at: new Date().toISOString() });
      if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body).slice(0, 160)}`);
      return { id: reg.body.id as string, publicId: up.public_id as string };
    };
    const A = await sendPhoto(base.id, "2024/kitchen/cabinet-base-01.jpg");
    const B = await sendPhoto(cur.id, "2026/kitchen/cabinet-base-03.jpg");
    const done = async () => { const s = (await call("GET", `/api/properties/${prop.id}/snapshot`)).body; const st = (s?.assets ?? []).map((a: any) => a.analysis_status); return st.length === 2 && st.every((x: string) => ["done", "completed", "failed", "quota_limited"].includes(x)); };
    for (let i = 0; i < 90 && !(await done()); i++) await sleep(2000);
    const snap = (await call("GET", `/api/properties/${prop.id}/snapshot`)).body;
    check("both photos are registered and analysed", (snap.assets ?? []).length === 2, (snap.assets ?? []).map((a: any) => a.analysis_status).join(", "));

    const share = await call("POST", "/api/share", { property_id: prop.id, expires_in_days: 1 });
    const shareUrl: string | undefined = share.body?.share_url;

    // Browser: sign in, pick the sandbox, then visit each screen.
    const page: Page = await (await browser.createBrowserContext()).newPage();
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (e: any) => problems.push(`[pageerror] ${String(e.message).slice(0, 160)}`));
    const until = async (fn: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(300); } return false; };
    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    for (const b of await page.$$("button")) if ((await b.evaluate((el) => el.textContent ?? "")).includes("Sarah Jenkins")) { await b.click(); break; }
    await page.waitForFunction(() => location.pathname === "/", { timeout: 30000 });

    const openSandbox = async (p: string) => {
      await page.goto(BASE + p, { waitUntil: "networkidle2" });
      await until(async () => (await page.$("select[aria-label=Property]")) !== null, 45000);
      await page.select("select[aria-label=Property]", prop.id);
      if (!(await until(async () => (await page.evaluate(() => (document.querySelector("select[aria-label=Property]") as HTMLSelectElement | null)?.value)) === prop.id, 45000))) throw new Error(`sandbox not shown on ${p}`);
      await sleep(2500);
    };
    /** Photos of this property that are on the page and fully loaded (naturalWidth > 0), by public id. */
    const seen = async () => page.evaluate((ids) => {
      const out: Record<string, { present: number; loaded: number }> = {};
      for (const id of ids) out[id] = { present: 0, loaded: 0 };
      for (const im of Array.from(document.images)) {
        const src = decodeURIComponent(im.currentSrc || im.src);
        for (const id of ids) if (src.includes(id)) { out[id].present++; if (im.complete && im.naturalWidth > 0) out[id].loaded++; else if (!im.complete) out[id].present--; }
      }
      return out;
    }, [A.publicId, B.publicId]);
    const scrollAll = async (pg: Page) => { await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); }); await sleep(800); };

    const mark = (s: { present: number; loaded: number }) => (s.loaded > 0 ? "shown" : s.present > 0 ? "BROKEN" : "—");
    // expectations: which screens must show which photo
    const screens: { name: string; path: string; wantBase: boolean; wantCur: boolean }[] = [
      { name: "Overview", path: "/", wantBase: false, wantCur: true },
      { name: "Capture", path: "/capture", wantBase: false, wantCur: true },
      { name: "Property memory", path: "/memory", wantBase: true, wantCur: true },
      { name: "Timeline", path: "/timeline", wantBase: true, wantCur: true },
      { name: "Room page", path: `/rooms/${room.id}`, wantBase: true, wantCur: true },
      { name: "Compare", path: `/compare?room=${room.id}`, wantBase: true, wantCur: true },
      { name: "Review", path: "/review", wantBase: false, wantCur: false },
      { name: "Evidence report", path: "/report", wantBase: true, wantCur: true },
      { name: "Search", path: "/search", wantBase: false, wantCur: false },
    ];
    for (const sc of screens) {
      await openSandbox(sc.path);
      // some screens fill in after a moment
      await scrollAll(page);
      await until(async () => { const s = await seen(); return (!sc.wantBase || s[A.publicId].loaded > 0) && (!sc.wantCur || s[B.publicId].loaded > 0); }, 12000);
      const s = await seen();
      table.push({ page: sc.name, baseline: mark(s[A.publicId]), current: mark(s[B.publicId]) });
      const okBase = !sc.wantBase || s[A.publicId].loaded > 0, okCur = !sc.wantCur || s[B.publicId].loaded > 0;
      const broken = s[A.publicId].present > s[A.publicId].loaded || s[B.publicId].present > s[B.publicId].loaded;
      check(`${sc.name}: ${[sc.wantBase && "move-in photo", sc.wantCur && "new photo"].filter(Boolean).join(" + ") || "no photo required"} shown, none broken`, okBase && okCur && !broken, `move-in ${mark(s[A.publicId])}, new ${mark(s[B.publicId])}`);
      await page.screenshot({ path: path.join(OUT, `${sc.name.replace(/\s+/g, "-").toLowerCase()}.png`) });
    }

    // Public share link (no login): must show the photos too.
    if (shareUrl) {
      const pub: Page = await (await browser.createBrowserContext()).newPage();
      await pub.setViewport({ width: 390, height: 900, isMobile: true });
      const t0 = Date.now();
      const api = await fetch(BASE + "/api/share/" + shareUrl.split("/r/")[1]);
      const rep = (await api.json().catch(() => ({}))) as any;
      console.log(`  share API: ${api.status} in ${Date.now() - t0} ms; rooms in report: ${rep?.report?.rooms?.length ?? "n/a"}; keys: ${Object.keys(rep?.report ?? rep ?? {}).join(",").slice(0, 120)}`);
      await pub.goto(shareUrl, { waitUntil: "networkidle2" });
      await until(async () => (await pub.$$("img")).length > 0, 40000);
      await scrollAll(pub);
      const s = await pub.evaluate((ids) => {
        const out: Record<string, { present: number; loaded: number }> = {};
        for (const id of ids) out[id] = { present: 0, loaded: 0 };
        for (const im of Array.from(document.images)) { const src = decodeURIComponent(im.currentSrc || im.src); for (const id of ids) if (src.includes(id)) { out[id].present++; if (im.complete && im.naturalWidth > 0) out[id].loaded++; else if (!im.complete) out[id].present--; } }
        return out;
      }, [A.publicId, B.publicId]);
      table.push({ page: "Public share link", baseline: mark(s[A.publicId]), current: mark(s[B.publicId]) });
      check("Public share link: both photos shown, none broken", s[A.publicId].loaded > 0 && s[B.publicId].loaded > 0 && s[A.publicId].present === s[A.publicId].loaded && s[B.publicId].present === s[B.publicId].loaded, `move-in ${mark(s[A.publicId])}, new ${mark(s[B.publicId])}`);
      await pub.screenshot({ path: path.join(OUT, "public-share.png"), fullPage: true });
    } else check("a public share link could be created", false, JSON.stringify(share.body)?.slice(0, 100));

    console.log("\nWhere each photo appears:");
    console.log("screen".padEnd(20) + "move-in photo".padEnd(16) + "new photo");
    for (const r of table) console.log(r.page.padEnd(20) + r.baseline.padEnd(16) + r.current);
    check("no page errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    for (const id of uploaded) await cloudinary.uploader.destroy(id, { invalidate: true }).catch(() => {});
    await db.deleteProperty?.(prop.id);
    check("the sandbox property is deleted", (await db.getProperty(prop.id)) === null);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

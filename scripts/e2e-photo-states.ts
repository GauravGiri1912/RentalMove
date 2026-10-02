/**
 * e2e-photo-states.ts — a photo must stay visible on every screen whatever state its AI analysis is in.
 *
 *   npx tsx --env-file=.env scripts/e2e-photo-states.ts [baseUrl=http://localhost:3000]
 *
 * Throwaway property with four rooms. Each room has a move-in photo and a later photo; the later photo's analysis
 * is left in a different state per room: queued, running, failed, quota_limited (no AI is called: records are
 * written directly after a real Cloudinary upload). Then each screen is opened in a phone-sized browser and every
 * photo must be on the page and really loaded. Cleans up after itself.
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
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROOMS = [
  { name: "Kitchen", category: "kitchen", status: "queued", img: "kitchen/cabinet-base-%Y.jpg" },
  { name: "Living Room", category: "living_room", status: "running", img: "living_room/living-floor-%Y.jpg" },
  { name: "Bathroom", category: "bathroom", status: "failed", img: "bathroom/shower-tile-%Y.jpg" },
  { name: "Bedroom", category: "bedroom", status: "quota_limited", img: "bedroom/%Y" },
] as const;

async function main() {
  ensureCloudinaryConfig();
  const db = getDatabase();
  const cfg = cloudinary.config();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: "sarah.owner@rentalmove.demo", password: "DemoPassword123!" });
  if (error) throw error;

  // Real files to use (any room photo will do; find one per room type).
  const pick = (cat: string) => { for (const y of ["2024", "2025", "2026"]) { const d = path.join(process.cwd(), "seed/images", y, cat); if (fs.existsSync(d)) { const f = fs.readdirSync(d).find((x) => /\.jpe?g$/i.test(x)); if (f) return path.join(d, f); } } return path.join(process.cwd(), "seed/images/2024/kitchen/cabinet-base-01.jpg"); };

  const prop = await db.createProperty({ address_label: "E2E photo-states sandbox", unit_label: "-", owner_id: data.user.id, rooms: ROOMS.map((r) => ({ name: r.name, category: r.category })) });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const uploaded: string[] = [];
  const problems: string[] = [];
  try {
    const rooms = await db.getRooms(prop.id);
    const base = await db.createInspection({ property_id: prop.id, type: "move_in", captured_at: "2024-06-01T10:00:00Z", status: "completed", captured_by: "Sarah", created_by: data.user.id } as any);
    const cur = await db.createInspection({ property_id: prop.id, type: "inspection", captured_at: new Date().toISOString(), status: "completed", captured_by: "Sarah", created_by: data.user.id } as any);

    const put = async (inspId: string, roomCat: string, file: string, status: string) => {
      const buf = fs.readFileSync(file);
      const folder = `properties/${prop.id}/${inspId}/${roomCat}`, tags = "e2e-photo-states", timestamp = Math.floor(Date.now() / 1000);
      const signature = cloudinary.utils.api_sign_request({ folder, tags, timestamp }, cfg.api_secret as string);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "p.jpg");
      for (const [k, v] of Object.entries({ api_key: cfg.api_key, timestamp, signature, folder, tags })) form.append(k, String(v));
      let up: any;
      for (let i = 1; ; i++) { try { up = await (await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud_name}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) })).json(); break; } catch (e) { if (i >= 3) throw e; await sleep(2000 * i); } }
      if (!up.public_id) throw new Error(`upload refused: ${JSON.stringify(up).slice(0, 140)}`);
      uploaded.push(up.public_id);
      const room = rooms.find((r) => r.category === roomCat)!;
      const a = await db.upsertAsset({ inspection_id: inspId, room_id: room.id, cloudinary_public_id: up.public_id, secure_url: up.secure_url, resource_type: "image", etag: up.etag, sha256: (await import("crypto")).createHash("sha256").update(buf).digest("hex"), width: up.width, height: up.height, captured_at: new Date().toISOString(), analysis_status: status as any, analysis_error: status === "failed" ? "test: analysis failed" : null } as any);
      return { id: a.id, publicId: up.public_id as string };
    };
    const photos: { room: string; status: string; base: string; cur: string }[] = [];
    for (const r of ROOMS) {
      const file = pick(r.category);
      const b = await put(base.id, r.category, file, "done");
      const c = await put(cur.id, r.category, file, r.status);
      photos.push({ room: r.name, status: r.status, base: b.publicId, cur: c.publicId });
    }
    check("eight photos are stored (a move-in and a later photo in each of four rooms)", photos.length === 4 && uploaded.length === 8);

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
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await sleep(800);
    };
    const loadedIds = async (ids: string[]) => page.evaluate((list) => {
      const ok = new Set<string>(), broken = new Set<string>();
      for (const im of Array.from(document.images)) {
        const src = decodeURIComponent(im.currentSrc || im.src);
        for (const id of list) if (src.includes(id)) { if (im.complete && im.naturalWidth > 0) ok.add(id); else if (im.complete) broken.add(id); }
      }
      return { ok: [...ok], broken: [...broken] };
    }, ids);

    // Screens and the photos each must show. Room-specific screens are checked per room.
    const everyCur = photos.map((p) => p.cur), everyBase = photos.map((p) => p.base);
    const generic: { name: string; path: string; must: string[] }[] = [
      { name: "Property memory", path: "/memory", must: [...everyBase, ...everyCur] },
      { name: "Timeline", path: "/timeline", must: [...everyBase, ...everyCur] },
    ];
    const table: string[][] = [];
    for (const g of generic) {
      await openSandbox(g.path);
      await until(async () => (await loadedIds(g.must)).ok.length === g.must.length, 15000);
      const r = await loadedIds(g.must);
      const missing = photos.flatMap((p) => [p.base, p.cur].filter((id) => !r.ok.includes(id)).map((id) => `${p.room}/${id === p.base ? "move-in" : p.status}`));
      table.push([g.name, `${r.ok.length}/${g.must.length}`, missing.join(", ") || "-"]);
      check(`${g.name}: every photo shown whatever its analysis state`, missing.length === 0 && r.broken.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
    }
    // The evidence report must show the new photo even when its analysis has not finished, and say so.
    await openSandbox("/report");
    await until(async () => (await loadedIds([...everyBase, ...everyCur])).ok.length === 8, 20000);
    const rep = await loadedIds([...everyBase, ...everyCur]);
    const repText = await page.evaluate(() => document.body.innerText);
    const notes = (await page.$$("[data-testid=report-analysis-note]")).length;
    table.push(["Evidence report (all four states)", `${rep.ok.length}/8`, rep.ok.length === 8 ? "-" : "some missing"]);
    check("Evidence report: every move-in and new photo is shown whatever its analysis state", rep.ok.length === 8 && rep.broken.length === 0, `${rep.ok.length}/8`);
    check("…and each unfinished or failed analysis says so, and that it is not the same as no damage", notes === 4 && /not the same as no damage/.test(repText) && /still running/.test(repText), `${notes} notes`);
    for (const p of photos) {
      const room = rooms.find((r) => r.name === p.room)!;
      for (const [name, route, must] of [
        [`Room page · ${p.room} (${p.status})`, `/rooms/${room.id}`, [p.base, p.cur]],
        [`Compare · ${p.room} (${p.status})`, `/compare?room=${room.id}`, [p.base, p.cur]],
        [`Capture · ${p.room} (${p.status})`, `/capture?room=${room.id}`, [p.cur]],
      ] as [string, string, string[]][]) {
        await openSandbox(route);
        await until(async () => (await loadedIds(must)).ok.length === must.length, 15000);
        const r = await loadedIds(must);
        table.push([name, `${r.ok.length}/${must.length}`, must.filter((id) => !r.ok.includes(id)).map((id) => (id === p.base ? "move-in" : p.status)).join(", ") || "-"]);
        check(`${name}: shows ${must.length === 2 ? "both photos" : "the new photo"}`, r.ok.length === must.length && r.broken.length === 0, r.ok.length === must.length ? "" : `shown ${r.ok.length}/${must.length}`);
        const txt = async (sel: string) => page.$eval(sel, (e: any) => String(e.innerText)).catch(() => "");
        if (route.startsWith("/compare")) {
          const then = await txt("[data-testid=ctx-then]"), now = await txt("[data-testid=ctx-now]");
          check(`${name}: labels Then (move-in) and Now (this visit) with dates`, /then/i.test(then) && /Move-in/i.test(then) && /2024/.test(then) && /now/i.test(now) && /2026/.test(now), `${then.replace(/\s+/g, " ")} | ${now.replace(/\s+/g, " ")}`);
          if (/Not checked yet/.test(await txt("[data-testid=ctx-roommatch]"))) {
            await page.evaluate(() => (document.querySelector("[data-testid=roomcheck-run]") as HTMLElement | null)?.click());
            await until(async () => !/Not checked yet/.test(await txt("[data-testid=ctx-roommatch]")), 30000);
            check(`${name}: "Check now" runs the room check and shows a verdict`, /Same room\?\s*(Matches|Confirmed|First|Check|Doesn)/i.test((await txt("[data-testid=ctx-roommatch]")).replace(/\s+/g, " ")), (await txt("[data-testid=ctx-roommatch]")).replace(/\s+/g, " ").slice(0, 100));
          }
          check(`${name}: shows the room check, says what was not compared, and how the app works`, /Same room\?/.test(await txt("[data-testid=ctx-roommatch]")) && /Coverage not recorded|areas appear in both/.test(await txt("[data-testid=ctx-coverage]")) && /a person decides what counts/.test(await txt("[data-testid=ctx-howitworks]")));
        }
        if (route.startsWith("/rooms/")) {
          const vis = await page.$$eval("[data-testid^=visit-]", (els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")));
          check(`${name}: lists the room's visits in order, each labelled`, vis.length === 2 && /1\. Move-in/.test(vis[0]) && /2024/.test(vis[0]) && /^2\./.test(vis[1]) && /Compare with the previous visit/.test(vis[1]), vis.join(" | ").slice(0, 120));
        }
      }
    }
    console.log("\nScreen".padEnd(44) + "photos shown".padEnd(14) + "missing");
    for (const r of table) console.log(r[0].padEnd(44) + r[1].padEnd(14) + r[2]);
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

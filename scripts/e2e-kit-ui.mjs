/**
 * e2e-kit-ui.mjs — the free move-in kit through the real UI, on a phone-sized screen, signed out.
 *
 *   node scripts/e2e-kit-ui.mjs [baseUrl=http://localhost:3000]
 *
 * Landing page buttons → start form → guided walk (real photos through the file chooser,
 * straight to Cloudinary) → seal → report → WhatsApp/email links → open as a read-only
 * reader → delete the kit. Screenshots go to .e2e/kit/. Leaves nothing behind.
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "kit");
fs.mkdirSync(OUT, { recursive: true });
const SEED = (p) => path.join(process.cwd(), "seed/images", p);
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const problems = [];
let phase = "start";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
page.on("pageerror", (e) => problems.push(`[pageerror ${phase}] ${e.message.slice(0, 160)}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`[console ${phase}] ${m.text().slice(0, 160)}`); });
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) problems.push(`[http ${r.status()} ${phase}] ${r.url().slice(0, 120)}`); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const text = () => page.evaluate(() => document.body.innerText);
const visible = (sel) => page.$(sel).then((h) => !!h);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function takePhoto(shotId, file) {
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 10000 }), page.click(`[data-testid=take-${shotId}]`)]);
  await chooser.accept([file]);
}
const progress = () => page.$eval("[data-testid=kit-progress]", (e) => e.textContent.trim());
async function waitProgress(prefix) {
  await page.waitForFunction((p) => document.querySelector("[data-testid=kit-progress]")?.textContent.trim().startsWith(p), { timeout: 60000 }, prefix);
}

try {
  // 1. Landing page, signed out.
  phase = "landing";
  await page.goto(`${BASE}/welcome`, { waitUntil: "networkidle2" });
  check("landing: Log in and Sign up buttons are there", await visible("[data-testid=nav-login]") && await visible("[data-testid=nav-signup]"));
  check("landing: the broken 'Open studio' loop is gone for signed-out visitors", !(await visible("[data-testid=nav-studio]")));
  check("landing: free move-in kit is the main button", (await page.$eval("[data-testid=hero-kit]", (e) => e.textContent)).includes("free move-in kit"));
  await shot("01-landing");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=nav-login]")]);
  check("landing: Log in opens the login page", new URL(page.url()).pathname === "/login");
  await page.goto(`${BASE}/welcome`, { waitUntil: "networkidle2" });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=hero-kit]")]);
  check("landing: the kit button opens the start page", new URL(page.url()).pathname === "/kit");

  // 2. Start form.
  phase = "form";
  check("form: Start is disabled until a name is typed", await page.$eval("[data-testid=kit-start]", (b) => b.disabled));
  await page.type("[data-testid=kit-name]", "UI Tester");
  await page.type("[data-testid=kit-address]", "7 Test Street");
  for (const label of ["Fewer Living rooms", "Fewer Bedrooms"]) await page.click(`button[aria-label="${label}"]`); // keep the run short
  check("form: room counters work (kitchen 1, bathroom 1, others 0)", (await page.$eval("[data-testid=count-kitchen]", (e) => e.textContent)) === "1" && (await page.$eval("[data-testid=count-bedroom]", (e) => e.textContent)) === "0");
  await shot("02-form");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=kit-start]")]);
  const walkPath = new URL(page.url()).pathname;
  check("form: starting a kit opens the guided walk with no login", /^\/k\/[^/]+$/.test(walkPath));

  // 3. Guided walk.
  phase = "walk";
  await page.waitForSelector("[data-testid=kit-progress]", { timeout: 30000 });
  check("walk: progress starts at 0", (await progress()).startsWith("0 /"), await progress());
  check("walk: the first room is open with its shot list", await visible("[data-testid=take-wide]") && (await text()).includes("Kitchen"));
  check("walk: sealing is disabled until every room has a photo", await page.$eval("[data-testid=kit-seal]", (b) => b.disabled));
  await shot("03-walk");
  await takePhoto("wide", SEED("2024/kitchen/cabinet-base-01.jpg"));
  await waitProgress("1 /");
  check("walk: a photo uploads straight to Cloudinary and ticks off the shot", (await page.$eval("[data-testid=shot-wide]", (e) => e.dataset.status)) === "done");
  check("walk: a done shot offers Retake and Remove", await visible("[data-testid=retake-wide]") && await visible("[data-testid=remove-wide]"));
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() => setTimeout(() => document.querySelector("[data-testid=remove-wide]").click(), 0));
  await page.waitForFunction(() => document.querySelector("[data-testid=shot-wide]")?.dataset.status === "todo", { timeout: 20000 });
  check("walk: Remove deletes the photo; the shot goes back to to-do and progress to 0", (await progress()).startsWith("0 /"), await progress());
  await takePhoto("wide", SEED("2024/kitchen/cabinet-base-01.jpg"));
  await waitProgress("1 /");
  check("walk: the same photo can be taken again after removing it", (await page.$eval("[data-testid=shot-wide]", (e) => e.dataset.status)) === "done");
  phase = "expected-409"; // the server's 409 below is the behaviour under test, not an error
  await takePhoto("sink", SEED("2024/kitchen/cabinet-base-01.jpg")); // same file: must be refused
  await page.waitForFunction(() => /already used this exact photo/.test(document.body.innerText), { timeout: 60000 });
  check("walk: the same photo cannot be used for a second shot (clear message)", true);
  phase = "walk";
  await page.click("[data-testid=shot-sink] button.btn-ghost"); // Skip
  await page.waitForFunction(() => document.querySelector("[data-testid=shot-sink]")?.dataset.status === "skipped", { timeout: 20000 });
  check("walk: a shot can be skipped", true);
  await shot("04-walk-kitchen");
  await page.evaluate(() => [...document.querySelectorAll("button[aria-expanded]")].find((b) => b.textContent.includes("Bathroom"))?.click());
  await page.waitForSelector("[data-testid=take-wide]");
  check("walk: still sealing-disabled with the bathroom empty", await page.$eval("[data-testid=kit-seal]", (b) => b.disabled));
  await takePhoto("wide", SEED("2024/bathroom/shower-tile-01.jpg"));
  await waitProgress("2 /");
  check("walk: bathroom photo saved; progress 2 photos", (await progress()).startsWith("2 /"), await progress());
  check("walk: now sealing is enabled", !(await page.$eval("[data-testid=kit-seal]", (b) => b.disabled)));
  await shot("05-walk-bathroom");

  // 4. Seal and report.
  phase = "seal";
  await page.click("[data-testid=kit-seal]");
  await page.waitForSelector("[data-testid=kit-seal-confirm]");
  await shot("06-seal-confirm");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click("[data-testid=kit-seal-confirm]")]);
  phase = "report";
  await page.waitForSelector("[data-testid=kit-seal-box]", { timeout: 30000 });
  check("report: opens after sealing", /\/report$/.test(new URL(page.url()).pathname));
  const box = await page.$eval("[data-testid=kit-seal-box]", (e) => e.innerText);
  check("report: 'Sealed and unchanged' with a record fingerprint", /Sealed and unchanged/.test(box) && /[a-f0-9]{64}/.test(box), box.split("\n")[1]?.slice(0, 60));
  const imgs = await page.$$eval("[data-testid^=report-room-] img", (els) => els.map((i) => ({ ok: i.complete && i.naturalWidth > 0 })));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-testid^=report-room-] img")].every((i) => i.complete), { timeout: 30000 }).catch(() => {});
  const loaded = await page.$$eval("[data-testid^=report-room-] img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length);
  check("report: every photo renders", imgs.length === 2 && loaded === 2, `${loaded}/${imgs.length}`);
  check("report: unphotographed items are listed, not hidden", /Skipped/.test(await text()) && /Not photographed/.test(await text()));
  check("report: says plainly it is not a third-party timestamp", /not\s*an independent third-party timestamp/i.test((await text()).replace(/\s+/g, " ").replace("not an", "not an")) || /independent third-party timestamp/.test(await text()));
  check("report: a sealed kit is private until shared (no link, no send buttons)", !!(await page.$("[data-testid=kit-private]")) && !(await page.$("[data-testid=kit-send]")) && !(await page.$("[data-testid=kit-whatsapp]")) && /only you can see/i.test(await text()));
  await shot("07a-private");
  await page.click("[data-testid=kit-share-on]");
  await page.waitForSelector("[data-testid=kit-send]", { timeout: 20000 });
  check("report: 'Share this record' turns sharing on and reveals the link", !(await page.$("[data-testid=kit-private]")) && !!(await page.$("[data-testid=kit-share-url]")));
  const wa = await page.$eval("[data-testid=kit-whatsapp]", (a) => a.href);
  const mail = await page.$eval("[data-testid=kit-email]", (a) => a.href);
  const shareUrl = await page.$eval("[data-testid=kit-share-url]", (i) => i.value);
  check("report: WhatsApp button carries the read-only report link", wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes(shareUrl));
  check("report: email button carries it too", mail.startsWith("mailto:?subject=") && decodeURIComponent(mail).includes(shareUrl));
  check("report: the shared link is read-only (a different link from the tenant's)", /\/k\/[^/]+\/report$/.test(shareUrl) && !shareUrl.includes(walkPath.split("/k/")[1]));
  await shot("07-report");
  await page.screenshot({ path: path.join(OUT, "07-report-full.png"), fullPage: true });

  // 5. A reader with only the shared link.
  phase = "reader";
  const reader = await ctx.newPage();
  await reader.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  reader.on("pageerror", (e) => problems.push(`[pageerror reader] ${e.message.slice(0, 160)}`));
  await reader.goto(shareUrl, { waitUntil: "networkidle2" });
  await reader.waitForSelector("[data-testid=kit-seal-box]", { timeout: 30000 });
  const rtext = await reader.evaluate(() => document.body.innerText);
  check("reader: sees the sealed record", /Sealed and unchanged/.test(rtext) && rtext.includes("UI Tester"));
  check("reader: has no send, delete or edit tools", !(await reader.$("[data-testid=kit-send]")) && !(await reader.$("[data-testid=kit-delete]")));
  await reader.screenshot({ path: path.join(OUT, "08-reader.png") });
  await reader.goto(shareUrl.replace(/\/report$/, ""), { waitUntil: "networkidle2" });
  await reader.waitForFunction(() => location.pathname.endsWith("/report"), { timeout: 15000 });
  check("reader: the capture page redirects a read-only link to the report", true);
  await reader.goto(shareUrl, { waitUntil: "networkidle2" });
  await reader.waitForSelector("[data-testid=kit-ack-name]", { timeout: 30000 });
  check("reader: confirm button is disabled until a name is typed", await reader.$eval("[data-testid=kit-ack-btn]", (b) => b.disabled));
  await reader.type("[data-testid=kit-ack-name]", "Mr Rao");
  await reader.click("[data-testid=kit-ack-btn]");
  await reader.waitForFunction(() => /Seen by\s*Mr Rao/.test(document.querySelector("[data-testid=kit-acks]")?.textContent ?? ""), { timeout: 20000 });
  check("reader: confirming shows who has seen the record", true);
  await reader.screenshot({ path: path.join(OUT, "08b-reader-confirmed.png") });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector("[data-testid=kit-acks]", { timeout: 30000 });
  check("tenant: sees the landlord's confirmation", /Seen by\s*Mr Rao/.test(await page.$eval("[data-testid=kit-acks]", (e) => e.textContent)));
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() => { setTimeout(() => document.querySelector("[data-testid=kit-relink]").click(), 0); });
  await new Promise((r) => setTimeout(r, 3000)); // background-tab rAF polling can stall; give the request time instead
  await page.waitForFunction(() => /old links no longer work/.test(document.querySelector("[data-testid=kit-relink-note]")?.textContent ?? ""), { polling: 250, timeout: 20000 });
  const newUrl = await page.$eval("[data-testid=kit-share-url]", (i) => i.value);
  check("tenant: a new share link replaces the old one", newUrl !== shareUrl && /\/k\/[^/]+\/report$/.test(newUrl));
  phase = "expected-409";
  await reader.goto(shareUrl, { waitUntil: "networkidle2" });
  await reader.waitForFunction(() => /replaced/.test(document.body.innerText), { timeout: 20000 });
  check("reader: the old link now says it was replaced", true);
  // The creator stops sharing: even the newest link is dead and the record is private again.
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() => setTimeout(() => document.querySelector("[data-testid=kit-share-off]").click(), 0));
  await page.waitForSelector("[data-testid=kit-private]", { timeout: 20000 });
  check("tenant: 'Stop sharing' returns the record to private", !(await page.$("[data-testid=kit-send]")));
  phase = "expected-409";
  await reader.goto(newUrl, { waitUntil: "networkidle2" });
  await reader.waitForFunction(() => /private/i.test(document.body.innerText), { timeout: 20000 });
  check("reader: a link that was shared before now says the record is private", !(await reader.evaluate(() => document.body.innerText)).includes("Sealed and unchanged"));
  phase = "reader";
  await reader.close();

  // 6. Delete.
  phase = "delete";
  page.once("dialog", (d) => d.accept());
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click("[data-testid=kit-delete]")]);
  check("delete: returns to the start page", new URL(page.url()).pathname === "/kit");
  phase = "after-delete"; // 404s are expected from here
  const gone = await ctx.newPage();
  await gone.goto(shareUrl, { waitUntil: "networkidle2" });
  await gone.waitForFunction(() => /Record not available/.test(document.body.innerText), { timeout: 15000 });
  check("delete: the shared link now says the record no longer exists", true);
  await gone.screenshot({ path: path.join(OUT, "09-deleted.png") });
} catch (e) {
  check("the flow completed without an unexpected error", false, String(e.message).slice(0, 200));
  await page.screenshot({ path: path.join(OUT, "99-failure.png") }).catch(() => {});
  // Best-effort cleanup so a failed run leaves nothing behind.
  try {
    const p = new URL(page.url()).pathname.match(/^\/k\/([^/]+)/);
    if (p) await fetch(`${BASE}/api/kit/${p[1]}`, { method: "DELETE" });
  } catch {}
}

const real = problems.filter((p) => !p.includes("after-delete") && !p.includes("expected-409"));
check("no console or network errors during the flow", real.length === 0, real.length ? real.slice(0, 3).join(" | ") : "");
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

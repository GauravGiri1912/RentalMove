/**
 * e2e-smoke.mjs — drives the real app in Chrome: demo login through the UI, every page,
 * console/network errors collected, screenshots saved to .e2e/.
 *
 *   node scripts/e2e-smoke.mjs [baseUrl=http://localhost:3000] [role=owner|tenant]
 *
 * Uses puppeteer-core with the locally installed Chrome (no browser download).
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:3000";
const ROLE = process.argv[3] || "owner";
const OUT = path.join(process.cwd(), ".e2e");
fs.mkdirSync(OUT, { recursive: true });

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
].find((p) => fs.existsSync(p));

const PAGES = ["/", "/map", "/memory", "/capture", "/review", "/compare?room=room-kitchen", "/timeline", "/search?q=bathroom%20stains", "/report", "/relet", "/lab", "/rooms/room-bathroom", "/repairs"];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1440,1000", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(`[console] ${page.url()} :: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`[pageerror] ${page.url()} :: ${e.message.slice(0, 300)}`));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) problems.push(`[http ${r.status()}] ${r.url().slice(0, 200)}`); });

const t0 = Date.now();
// Public pages first (signed out).
for (const p of ["/welcome", "/verify", "/login"]) {
  await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, `public${p.replace(/\//g, "_")}.png`) });
  console.log(`ok  ${p}`);
}
// Signed-out app root must land on /welcome, protected routes on /login.
await page.goto(BASE + "/", { waitUntil: "networkidle2" });
console.log(`redirect / → ${new URL(page.url()).pathname}`);
await page.goto(BASE + "/review", { waitUntil: "networkidle2" });
console.log(`redirect /review → ${new URL(page.url()).pathname}${new URL(page.url()).search}`);

// Demo login through the real UI button.
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
const label = ROLE === "tenant" ? "Alex Chen" : "Sarah Jenkins";
const buttons = await page.$$("button");
for (const b of buttons) {
  const txt = await b.evaluate((el) => el.textContent || "");
  if (txt.includes(label)) { await b.click(); break; }
}
await page.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
await page.waitForFunction(() => !document.body.innerText.includes("Loading your property memory"), { timeout: 45000 });
console.log(`logged in as ${label} in ${Date.now() - t0} ms`);

for (const p of PAGES) {
  const s = Date.now();
  await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading your property memory"), { timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  const name = p.split("?")[0].replace(/\//g, "_") || "_root";
  await page.screenshot({ path: path.join(OUT, `${ROLE}${name === "_" ? "_overview" : name}.png`), fullPage: false });
  const h1 = await page.$eval("h1", (el) => el.textContent?.trim().slice(0, 60)).catch(() => "(no h1)");
  console.log(`ok  ${p.padEnd(30)} ${String(Date.now() - s).padStart(5)} ms  h1="${h1}"`);
}

// Pixel diff mode on compare (browser engine) and the assistant.
await page.goto(BASE + "/compare?room=room-kitchen", { waitUntil: "networkidle2" });
await page.keyboard.press("4");
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: path.join(OUT, `${ROLE}_compare_diff.png`) });
const stats = await page.evaluate(() => [...document.querySelectorAll(".font-mono")].map((e) => e.textContent).find((t) => t && t.includes("% px")));
console.log(`diff stats: ${stats}`);
await page.goto(BASE + "/?ask=What%20changed%20in%20the%20bathroom%3F", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: path.join(OUT, `${ROLE}_ask.png`) });
console.log("ok  ask panel");

// New insight features, driven through the UI.
const text = () => page.evaluate(() => document.body.innerText);
const expectText = async (what, re) => {
  const ok = await page.waitForFunction((src, flags) => new RegExp(src, flags).test(document.body.innerText), { timeout: 15000 }, re.source, re.flags).then(() => true, () => false);
  console.log(`${ok ? "ok " : "FAIL"} ${what}`); if (!ok) problems.push(`[assert] ${what}`); };

// Review: size/trend/wear panel, scale drawing, repair panel.
const snapRes = await page.evaluate(async () => (await fetch("/api/properties/prop-381/snapshot")).json());
const grownId = Object.entries(snapRes.measures).find(([, m]) => m.extent_prior > 0 && m.extent / m.extent_prior >= 1.25)?.[0];
await page.goto(BASE + `/review?o=${grownId}`, { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=finding-facts]", { timeout: 30000 });
await expectText("review shows growth trend", /Grew ×\d/);
await expectText("review shows everyday-use context + disclaimer", /not a finding of cause or responsibility/);
await expectText(ROLE === "owner" ? "owner sees Request a repair" : "tenant sees no repair requested", ROLE === "owner" ? /Request a repair/ : /No repair requested/);
await page.click("[data-testid=set-scale]");
await page.waitForSelector("[data-testid=scale-canvas]");
const box = await (await page.$("[data-testid=scale-canvas]")).boundingBox();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 8 });
await page.mouse.up();
await page.select("[data-testid=scale-ref]", "tile60");
await page.screenshot({ path: path.join(OUT, `${ROLE}_scale.png`) });
await page.click("[data-testid=scale-save]");
await page.waitForSelector("[data-testid=finding-size]", { timeout: 20000 }).catch(() => {});
await expectText("finding size in cm after drawing a scale", /≈ [\d.]+ (cm|m) long/);
await page.screenshot({ path: path.join(OUT, `${ROLE}_review_insights.png`), fullPage: true });
// Remove the test scale again.
const assetId = snapRes.observations.find((o) => o.id === grownId).asset_id;
await page.evaluate(async (id) => fetch(`/api/assets/${id}/calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }), assetId);

// Capture checklist, room coverage, report additions.
await page.goto(BASE + "/capture?room=room-bathroom", { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=coverage]", { timeout: 30000 }).catch(() => {});
await expectText("capture shows the room checklist", /covered/);
await page.goto(BASE + "/report", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
// Findings only reach the report once accepted; with none accepted it must say so.
await expectText("report shows everyday-use context (or no reviewed changes)", /Everyday-use context|No reviewed changes since move-in/);
await page.goto(BASE + "/rooms/room-bathroom", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await expectText("room dossier shows trend chip", /Grew ×\d/);

// Ask intents.
for (const q of ["What got worse?", "What needs repair?", "What did the photos miss?"]) {
  await page.goto(BASE + `/?ask=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT, `${ROLE}_ask_${q.split(" ")[1]}.png`) });
  await expectText(`ask: ${q}`, q.includes("worse") ? /grew since the previous visit/ : q.includes("repair") ? /repair|work order/i : /gaps|Every checklist item/);
}

// Features 6–9 through the UI.
await page.goto(BASE + `/review?o=${grownId}`, { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=finding-facts]", { timeout: 30000 });
await expectText("review shows the photo-time chip", /No capture time in file|Taken \d{4}/);
await expectText("review has a Not sure tab with a count", /Not sure · \d+/);
const unsureId = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => /^Not sure · \d+/.test(b.textContent || ""));
  btn?.click();
  return !!btn;
});
await new Promise((r) => setTimeout(r, 800));
if (unsureId) {
  const firstQueue = await page.$$("aside button.flex.w-full");
  if (firstQueue[0]) await firstQueue[0].click();
  await expectText("a Not sure finding explains why", /Not sure — check before accepting|No pixel change at this spot/);
}
// Voice note: fake microphone → record → stop → preview (not sent, so no lasting comment).
await page.goto(BASE + `/review?o=${grownId}`, { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=voice-start]", { timeout: 30000 });
await page.click("[data-testid=voice-start]");
const recording = await page.waitForSelector("[data-testid=voice-stop]", { timeout: 10000 }).then(() => true, () => false);
console.log(`${recording ? "ok " : "FAIL"} voice note starts recording (microphone allowed)`);
if (!recording) problems.push("[assert] voice recording did not start");
await new Promise((r) => setTimeout(r, 2200));
if (recording) await page.click("[data-testid=voice-stop]");
const previewed = await page.waitForSelector("[data-testid=voice-preview]", { timeout: 10000 }).then(() => true, () => false);
console.log(`${previewed ? "ok " : "FAIL"} voice note stops and shows a playable preview`);
if (!previewed) problems.push("[assert] voice preview missing");
await page.screenshot({ path: path.join(OUT, `${ROLE}_voice.png`) });

// Hindi report.
await page.goto(BASE + "/report", { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=lang-hi]", { timeout: 30000 });
await page.click("[data-testid=lang-hi]");
await expectText("report switches to Hindi with the machine-translation notice", /स्थिति साक्ष्य रिपोर्ट[\s\S]*मशीन अनुवाद/);
await expectText("room names translated", /बाथरूम|रसोई/);
await page.screenshot({ path: path.join(OUT, `${ROLE}_report_hi.png`), fullPage: false });
await page.click("[data-testid=lang-en]");
await expectText("report switches back to English", /Condition evidence report/i);

for (const q of ["What is the AI not sure about?", "When were the photos taken?"]) {
  await page.goto(BASE + `/?ask=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
  await expectText(`ask: ${q}`, q.includes("sure") ? /the AI is not sure about \d+/ : /capture time/);
}

await browser.close();
console.log(`\n${problems.length} problem(s):`);
for (const p of [...new Set(problems)]) console.log("  " + p);

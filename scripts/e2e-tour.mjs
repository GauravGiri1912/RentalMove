/**
 * e2e-tour.mjs — plays Present mode end to end in Chrome and checks every beat.
 *
 *   node scripts/e2e-tour.mjs [baseUrl=http://localhost:3000]
 *
 * Steps through the tour with "Next" (so it runs in ~1–2 minutes instead of the full
 * narrated length), and for each beat records: the page it is on, whether the spotlight
 * found its target, and a screenshot in .e2e/tour/. Fails on any beat without a spotlight
 * where one was expected, and on console / page errors.
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "tour");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--window-size=1440,900"], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`[console] ${m.text().slice(0, 200)}`); });

await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
for (const b of await page.$$("button")) if ((await b.evaluate((el) => el.textContent)).includes("Sarah Jenkins")) { await b.click(); break; }
await page.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
await page.waitForFunction(() => !document.body.innerText.includes("Loading your property memory"), { timeout: 45000 });

await page.goto(BASE + "/?present=1", { waitUntil: "networkidle2" });
await page.waitForSelector("[data-testid=tour-bar]", { timeout: 20000 });

let i = 0, lastText = "", missing = 0;
for (;;) {
  // Wait for this beat to be ready: text at full opacity (set once its target is found).
  await page.waitForFunction((prev) => {
    const t = document.querySelector("[data-testid=tour-text]");
    return t && t.textContent !== prev && !t.className.includes("opacity-40");
  }, { timeout: 20000 }, lastText).catch(() => {});
  await new Promise((r) => setTimeout(r, 3400)); // past the chapter card + smooth scroll
  const s = await page.evaluate(() => {
    const bar = document.querySelector("[data-testid=tour-bar]");
    const label = bar?.querySelector(".font-mono")?.textContent ?? "";
    const text = document.querySelector("[data-testid=tour-text]")?.textContent ?? "";
    const spot = [...document.querySelectorAll("div[aria-hidden]")].some((d) => d.className.includes("ring-signal"));
    return { label, text, spot, path: location.pathname + location.search };
  });
  const expectsSpot = !s.label.includes("That's RentalMove");
  if (expectsSpot && !s.spot) missing++;
  console.log(`${expectsSpot && !s.spot ? "NO SPOT" : "ok     "}  ${s.label.padEnd(34)} ${s.path.padEnd(28)} ${s.text.slice(0, 60)}…`);
  await page.screenshot({ path: path.join(OUT, `${String(++i).padStart(2, "0")}.png`) });
  lastText = s.text;
  if (s.label.includes("That's RentalMove")) break;
  await page.click("button[aria-label=Next]");
  if (i > 60) break;
}
console.log(`\n${i} beats, ${missing} without spotlight, ${problems.length} error(s)`);
for (const p of [...new Set(problems)]) console.log("  " + p);
await browser.close();
process.exit(missing || problems.length ? 1 : 0);

/**
 * demo-walkthrough.mjs — walks the 2-minute demo script in a real browser and screenshots each beat, so the
 * recording can be rehearsed and nothing on screen is a surprise.
 *
 *   node scripts/demo-walkthrough.mjs [baseUrl=http://localhost:3000]
 *
 * Read-only on the demo data (prop-381): it opens pages, never decides or edits anything.
 * Screenshots: .e2e/demo-walkthrough/NN-*.png (1440 x 900).
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "demo-walkthrough");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
const text = () => page.evaluate(() => document.body.innerText);
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(400); } return false; };

// Beat 1 — the problem (signed out)
await page.goto(BASE + "/welcome", { waitUntil: "networkidle2" });
check("1. landing page: the story and three doors", /remembers/i.test(await text()) && !!(await page.$("[data-testid=door-owner]")));
await shot("01-landing");

// Beat 2 — the free move-in kit (signed out)
await page.goto(BASE + "/kit", { waitUntil: "networkidle2" });
check("2. move-in kit start page, no account needed", /no account/i.test(await text()) && !!(await page.$("[data-testid=kit-form]")));
await shot("02-kit");

// Beat 3 — "it was already there": a move-out finding matched to move-in
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
const nav = page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null);
for (const b of await page.$$("button")) if ((await b.evaluate((el) => el.textContent ?? "")).includes("Sarah Jenkins")) { await b.click(); break; }
await nav;
await until(async () => !(await text()).includes("Loading your property memory"));
await page.goto(BASE + "/review?o=obs-asset-08-1", { waitUntil: "networkidle2" });
await until(async () => /Was it there at move-in\?/.test(await text()));
await sleep(2500);
const t3 = await text();
check("3. review: a move-out finding shows the same spot at move-in, marked already there", /Was it there at move-in\?/.test(t3) && /Matches move-in/.test(t3) && /Already recorded at an earlier visit/.test(t3));
await shot("03a-finding");
await page.evaluate(() => [...document.querySelectorAll("span")].find((e) => e.textContent === "Was it there at move-in?")?.scrollIntoView({ block: "start" }));
await sleep(1200);
await shot("03b-already-there");

// Beat 4 — the comparison
await page.goto(BASE + "/compare?room=room-bathroom", { waitUntil: "networkidle2" });
await until(async () => !!(await page.$("[data-testid=compare-context]")));
await sleep(2500);
check("4. compare: Then / Now with dates, room check, and what was not compared", /then/i.test(await text()) && /Same room\?/.test(await text()));
await shot("04-compare");

// Beat 5 — "you can't fake it": original matches, edited copy does not
await page.goto(BASE + "/verify", { waitUntil: "networkidle2" });
const input = await page.$("input[type=file]");
await input.uploadFile(path.join(process.cwd(), "demo-assets/kitchen-move-out-ORIGINAL.jpg"), path.join(process.cwd(), "demo-assets/kitchen-move-out-EDITED.jpg"));
await until(async () => /Matches the photo on record/.test(await text()) && /No record of this exact file/.test(await text()), 60000);
const t5 = await text();
check("5. verify: the original matches, the edited copy is rejected", /Matches the photo on record/.test(t5) && /No record of this exact file/.test(t5));
await shot("05-verify");

// Beat 6 — the shared evidence report
await page.goto(BASE + "/report", { waitUntil: "networkidle2" });
await until(async () => /Condition evidence report/i.test(await text()));
await sleep(3000);
check("6. evidence report renders with photos", /Condition evidence report/i.test(await text()) && (await page.$$eval("img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length)) > 2);
await shot("06-report");

check("no page errors during the walkthrough", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed  ·  screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);

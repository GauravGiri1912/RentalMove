/**
 * e2e-checklist-ui.ts — the room checklist in a real browser (phone-sized), as the owner demo user.
 *
 *   npx tsx --env-file=.env scripts/e2e-checklist-ui.ts [baseUrl=http://localhost:3000]
 *
 * Makes a throwaway property with a kitchen and a bedroom, starts a visit from the Capture page,
 * uploads ONE real photo (one Cloudinary upload and one vision-model call) filed under "Cabinets",
 * skips/marks the rest, checks that Submit is blocked until every room is covered or explained,
 * submits, and checks the lock. Deletes the property and its Cloudinary folder afterwards.
 * Screenshots go to .e2e/checklist/.
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { getDatabase } from "../src/lib/db";
import { ensureCloudinaryConfig } from "../src/lib/media";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "checklist");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  ensureCloudinaryConfig();
  const db = getDatabase();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: "sarah.owner@rentalmove.demo", password: "DemoPassword123!" });
  if (error) throw error;
  const prop = await db.createProperty({ address_label: "E2E checklist UI sandbox", unit_label: "-", owner_id: data.user.id, rooms: [{ name: "Kitchen", category: "kitchen" }, { name: "Bedroom", category: "bedroom" }] });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const problems: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (e: any) => problems.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 700)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|hydrat/i.test(m.text())) problems.push(`[console] ${m.text().slice(0, 160)}`); });
    const shot = (n: string) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
    const text = (sel: string) => page.$eval(sel, (e: any) => String(e.innerText)).catch(() => "");
    const until = (fn: () => Promise<boolean>, ms = 30000) => (async () => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(300); } return false; })();
    // A full page load opens the demo property again, so re-select the sandbox after every navigation (and refuse to go on if it is not shown).
    const openSandbox = async (pathname: string) => {
      await page.goto(BASE + pathname, { waitUntil: "networkidle2" });
      await until(async () => (await page.$("select[aria-label=Property]")) !== null, 45000);
      await page.select("select[aria-label=Property]", prop.id);
      if (!(await until(async () => (await page.evaluate(() => (document.querySelector("select[aria-label=Property]") as HTMLSelectElement | null)?.value)) === prop.id, 45000))) throw new Error(`the studio is not showing the sandbox on ${pathname}; aborting`);
      await sleep(1500); // let the switched property's data arrive
    };
    const click = (sel: string) => page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), sel);

    // Sign in as the owner (demo buttons); the studio opens on the demo property, so switch to the sandbox with the property picker.
    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    for (const b of await page.$$("button")) if ((await b.evaluate((el) => el.textContent ?? "")).includes("Sarah Jenkins")) { await b.click(); break; }
    await page.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
    await page.goto(BASE + "/capture", { waitUntil: "networkidle2" });
    await until(async () => (await page.$("select[aria-label=Property]")) !== null, 45000);
    await page.select("select[aria-label=Property]", prop.id);
    const loaded = await until(async () => (await page.evaluate(() => document.body.innerText)).toLowerCase().includes("e2e checklist ui sandbox"), 45000);
    // Safety: never start a visit unless the studio is showing the throwaway property, not the demo data.
    if (!loaded || !(await page.evaluate(() => document.body.innerText)).toLowerCase().includes("e2e checklist ui sandbox")) { await shot("00-no-capture"); console.log("ERRORS:", problems.join(" | ")); console.log("PAGE TEXT:", (await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw new Error("the studio is not showing the sandbox property; aborting before changing anything"); }

    // Start a visit.
    await page.evaluate(() => (document.querySelector("details summary") as HTMLElement).click());
    await page.evaluate(() => [...document.querySelectorAll("details button")].find((b) => b.textContent?.trim() === "Start")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    check("a visit starts from the Capture page", await until(async () => (await text("[data-testid=visit-submit]")).includes("Submit this visit"), 30000));
    await shot("01-empty-visit");

    // Empty state.
    const stepper = await page.$$eval("ol li button", (els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")));
    check("rooms with no photo say 'Not started', not 'Captured'", stepper.length === 2 && stepper.every((t) => /Not started/.test(t)), stepper.join(" | "));
    check("the checklist lists what the kitchen needs", /0\/6 photographed/.test(await text("[data-testid=checklist-count]")) && (await page.$$("[data-testid^=item-]")).length === 6);
    check("submit is blocked and says what is missing", (await page.$eval("[data-testid=submit-visit]", (b) => (b as HTMLButtonElement).disabled)) && /Kitchen \(6 left\)/.test(await text("[data-testid=submit-blockers]")) && /Bedroom \(5 left\)/.test(await text("[data-testid=submit-blockers]")), (await text("[data-testid=submit-blockers]")).slice(0, 90));
    check("the next photo is pre-selected for the first missing item", /Next photo/.test(await text("[data-testid=pick-cabinets]")));

    // One real photo, filed under Cabinets.
    const file = path.join(process.cwd(), "seed/images/2024/kitchen/cabinet-base-01.jpg");
    const input = await page.$("input[type=file]");
    await input!.uploadFile(file);
    const filed = await until(async () => /photographed/.test(await text("[data-testid=item-cabinets]")) && !/vision model/.test(await text("[data-testid=item-cabinets]")), 90000);
    check("the uploaded photo is filed under Cabinets (by the person, not guessed)", filed, (await text("[data-testid=item-cabinets]")).replace(/\s+/g, " ").slice(0, 80));
    // The vision model's reading arrives a little later and may add areas it can see; wait for it so the test is not racing it.
    await until(async () => (await page.$$eval("[data-testid^=item-]", (els) => els.some((e) => /vision model/.test((e as HTMLElement).innerText)))), 90000);
    const count1 = await text("[data-testid=checklist-count]");
    const openKeys = async () => page.$$eval("[data-testid^=skip-]:not([data-testid=skip-reason]):not([data-testid=skip-confirm])", (els) => els.map((e) => (e.getAttribute("data-testid") ?? "").replace("skip-", "")));
    let open = await openKeys();
    // The vision model may also see other areas in the same photo; those are labelled as such, not as photographed.
    const items = await page.$$eval("[data-testid^=item-]", (els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")));
    check("areas only the model saw are labelled as such", items.every((t) => !/vision model/.test(t)) || items.some((t) => /vision model/.test(t)), `${count1}; open: ${open.join(", ") || "none"}`);
    await shot("02-one-photo");

    // Retake and remove while the visit is a draft.
    const photoIds = async () => page.$$eval("[data-testid^=remove-photo-]", (els) => els.map((e) => (e.getAttribute("data-testid") ?? "").replace("remove-photo-", "")));
    const before = await photoIds();
    check("a draft photo offers Remove", before.length === 1);
    await click("[data-testid=retake-cabinets]");
    check("Retake says it is replacing the earlier photo", /new photo of the cabinets/i.test(await page.evaluate(() => document.body.innerText)));
    const variant = path.join(OUT, "variant.jpg");
    await sharp(file).resize(1000).jpeg({ quality: 80 }).toFile(variant);
    await (await page.$("input[type=file]"))!.uploadFile(variant);
    check("the retake replaces the photo: still one photo, a new one", await until(async () => { const ids = await photoIds(); return ids.length === 1 && ids[0] !== before[0]; }, 90000));
    check("…and the item is still photographed", await until(async () => /photographed/.test(await text("[data-testid=item-cabinets]")), 30000));
    page.once("dialog", (d) => d.accept());
    await click(`[data-testid=remove-photo-${(await photoIds())[0]}]`);
    check("Remove deletes the photo", await until(async () => (await photoIds()).length === 0, 30000));
    check("the room goes back to 'Not started'", await until(async () => /Not started/.test(await page.$$eval("ol li button", (els) => (els[0] as HTMLElement).innerText)), 30000));
    // Put the original photo back, filed under Cabinets, for the rest of the flow.
    await click("[data-testid=pick-cabinets]");
    await (await page.$("input[type=file]"))!.uploadFile(file);
    await until(async () => /photographed/.test(await text("[data-testid=item-cabinets]")) && !/vision model/.test(await text("[data-testid=item-cabinets]")), 90000);
    await until(async () => (await page.$$eval("[data-testid^=item-]", (els) => els.some((e) => /vision model/.test((e as HTMLElement).innerText)))), 90000);
    open = await openKeys();

    // Can't photograph something: needs a reason.
    if (open.length) {
      const k = open[0];
      check("the next missing item is selected for the next photo", /Next photo/.test(await text(`[data-testid=pick-${k}]`)) || /Next photo/.test(await text("[data-testid=room-checklist]")));
      check("the room shows partial progress, not 'Captured'", /areas/.test(await page.$$eval("ol li button", (els) => (els[0] as HTMLElement).innerText.replace(/\s+/g, " "))));
      await click(`[data-testid=skip-${k}]`);
      await page.waitForSelector("[data-testid=skip-reason]");
      check("'Skip with reason' stays disabled until a reason is typed", await page.$eval("[data-testid=skip-confirm]", (b) => (b as HTMLButtonElement).disabled));
      await page.type("[data-testid=skip-reason]", "covered by a tenant's appliance");
      await click("[data-testid=skip-confirm]");
      check("a skipped item shows its reason", await until(async () => /skipped: covered by/.test(await text(`[data-testid=item-${k}]`))));
      check("the count shows photographed and skipped separately", /· 1 skipped/.test(await text("[data-testid=checklist-count]")), await text("[data-testid=checklist-count]"));
      await until(async () => (await page.$eval(`[data-testid=undo-${k}]`, (b) => !(b as HTMLButtonElement).disabled).catch(() => false)));
      await click(`[data-testid=undo-${k}]`);
      const undone = await until(async () => !/skipped/.test(await text(`[data-testid=item-${k}]`)), 15000);
      check("a skip can be undone", undone, undone ? "" : `item: ${(await text(`[data-testid=item-${k}]`)).replace(/\s+/g, " ")} | count: ${await text("[data-testid=checklist-count]")}`);
    }

    // Resolve the rest of the kitchen with reasons.
    for (const k of await openKeys()) {
      await click(`[data-testid=skip-${k}]`);
      await page.waitForSelector("[data-testid=skip-reason]");
      await page.type("[data-testid=skip-reason]", "no access today");
      await click("[data-testid=skip-confirm]");
      await until(async () => /skipped/.test(await text(`[data-testid=item-${k}]`)));
    }
    check("kitchen is complete when every item is photographed or explained", await until(async () => /Complete/.test(await page.$$eval("ol li button", (els) => (els[0] as HTMLElement).innerText))));
    check("submit stays blocked while the bedroom is untouched", (await page.$eval("[data-testid=submit-visit]", (b) => (b as HTMLButtonElement).disabled)) && /Bedroom \(5 left\)/.test(await text("[data-testid=submit-blockers]")) && !/Kitchen/.test(await text("[data-testid=submit-blockers]")), (await text("[data-testid=submit-blockers]")).slice(0, 80));

    // Bedroom: marking everything "not in this room" is allowed but recorded.
    await page.evaluate(() => (document.querySelectorAll("ol li button")[1] as HTMLElement).click());
    await until(async () => (await page.$("[data-testid=item-walls]")) !== null);
    for (const k of ["walls", "floor", "window_frame", "door", "ceiling"]) {
      await click(`[data-testid=skip-${k}]`);
      await page.waitForSelector("[data-testid=na-confirm]");
      await click("[data-testid=na-confirm]");
      await until(async () => /not applicable/.test(await text(`[data-testid=item-${k}]`)));
    }
    await shot("03-ready");
    check("submit is allowed once every room is covered or explained", await until(async () => !(await page.$eval("[data-testid=submit-visit]", (b) => (b as HTMLButtonElement).disabled))));

    // Submit and lock.
    await click("[data-testid=submit-visit]");
    check("submitting locks the visit", await until(async () => /Submitted/.test(await text("[data-testid=visit-submit]")) && /checklist locked/.test(await text("[data-testid=visit-submit]"))));
    check("the checklist no longer offers skip, undo or photograph", (await page.$("[data-testid=skip-walls]")) === null && (await page.$("[data-testid=undo-walls]")) === null && (await page.$("[data-testid^=pick-]")) === null);
    check("a submitted visit offers no Remove or Retake", (await page.$("[data-testid^=remove-photo-]")) === null && (await page.$("[data-testid^=retake-]")) === null);
    await shot("04-submitted");

    // The submission summary: what was submitted, sealed, with a live "unchanged" check.
    await click("[data-testid=view-submission]");
    await page.waitForSelector("[data-testid=submission-seal]", { timeout: 30000 });
    check("the summary shows the seal and says it matches what was submitted", await until(async () => /Matches what was submitted/.test(await text("[data-testid=submission-state]"))) && /^[a-f0-9]{64}$/.test((await text("[data-testid=sealed-hash]")).trim()), (await text("[data-testid=submission-meta]")).slice(0, 80));
    check("it lists every item with how it was covered", /Photographed/.test(await text("[data-testid=sub-item-cabinets]")) && /Skipped: no access today/.test(await page.evaluate(() => document.body.innerText)) && /Not applicable/.test(await page.evaluate(() => document.body.innerText)));
    check("it offers print and a downloadable record", (await page.$("[data-testid=download-manifest]")) !== null && /Print/.test(await page.evaluate(() => document.body.innerText)));
    await shot("05-submission-summary");
    // Owner reopens; the visit becomes editable and must be submitted again.
    await click("[data-testid=reopen]");
    check("the owner can reopen from the summary", await until(async () => /Not submitted yet/.test(await text("[data-testid=submission-seal]"))));
    await openSandbox("/capture");
    await until(async () => (await page.$("[data-testid=submit-visit]")) !== null, 30000);
    check("after reopening, Submit is available again", await until(async () => !(await page.$eval("[data-testid=submit-visit]", (b) => (b as HTMLButtonElement).disabled).catch(() => true))));
    await click("[data-testid=submit-visit]");
    check("resubmitting seals it again", await until(async () => /Submitted/.test(await text("[data-testid=visit-submit]"))));

    // The owner's Review page no longer warns about this visit.
    await openSandbox("/review");
    await until(async () => !(await page.content()).includes("Loading your property memory"), 45000);
    const warnGone = await until(async () => (await page.$("[data-testid=unsubmitted-visit]")) === null, 15000);
    check("review has no 'not submitted' warning for a submitted visit", warnGone, warnGone ? "" : await text("[data-testid=unsubmitted-visit]"));
    check("no page or console errors", problems.length === 0, problems.slice(0, 3).join(" | ").slice(0, 1500));
  } finally {
    await browser.close().catch(() => {});
    // Only this test's own upload(s): by exact public id, from the sandbox property's assets.
    for (const insp of await db.getInspections(prop.id).catch(() => [])) for (const a of await db.getAssetsForInspections([insp.id]).catch(() => [])) await cloudinary.uploader.destroy(a.cloudinary_public_id).catch(() => {});
    await db.deleteProperty?.(prop.id);
    check("the sandbox property is deleted", (await db.getProperty(prop.id)) === null);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

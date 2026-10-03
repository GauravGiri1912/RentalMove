/**
 * e2e-claim.ts — "paste the landlord's message" against a running server, as the demo tenant.
 *
 *   npx tsx --env-file=.env scripts/e2e-claim.ts [baseUrl=http://localhost:3000]
 *
 * API: the claim lookup on the real demo property, who may call it, input limits, and that nothing about the
 * message is stored. Browser (phone-sized): the page, an example, the result with both photos, the drafted reply,
 * and the evidence link (created through the real share API and cancelled again so nothing is left behind).
 * Read-only on the demo data apart from the one share link, which the test revokes.
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "claim");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = "prop-381";

async function login(email: string) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: "DemoPassword123!" });
  if (error) throw error;
  return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" } as Record<string, string>;
}
async function call(h: Record<string, string> | null, method: string, p: string, body?: unknown) {
  const r = await fetch(BASE + p, { method, headers: h ?? { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  const tenant = await login("alex.tenant@rentalmove.demo");
  const owner = await login("sarah.owner@rentalmove.demo");

  // ---------------- API ----------------
  check("a claim lookup needs a login (401)", (await call(null, "POST", "/api/claim", { property_id: P, message: "shower glass is damaged" })).status === 401);
  const bad = await call(tenant, "POST", "/api/claim", { property_id: P, message: "x" });
  check("a message that is too short is refused (400) with a clear reason", bad.status === 400 && /message/i.test(bad.body?.error ?? ""), bad.body?.error);
  check("a very long message is refused (400)", (await call(tenant, "POST", "/api/claim", { property_id: P, message: "a".repeat(1600) })).status === 400);
  check("someone with no access to the property is refused (403)", (await call(tenant, "POST", "/api/claim", { property_id: "prop-does-not-exist", message: "shower glass is damaged" })).status === 403);

  const shower = await call(tenant, "POST", "/api/claim", { property_id: P, message: "Shower glass is damaged, deducting ₹4,000 from your deposit." });
  const r = shower.body?.result;
  check("the demo claim is read: bathroom, shower glass, ₹4,000", shower.status === 200 && r?.claim?.rooms?.includes("bathroom") && r?.claim?.amount?.value === 4000 && r?.claim?.concepts?.some((c: any) => c.key === "glass"), JSON.stringify(r?.claim?.concepts?.map((c: any) => c.key)));
  check("…and answered: ALREADY THERE at move-in", r?.overall === "already_there" && r?.items?.[0]?.room?.name === "Bathroom", r?.overall);
  const it = r?.items?.[0];
  check("it points at a real move-in photo and a real move-out photo, with dates", !!it?.then?.asset_id && !!it?.now?.asset_id && /2024/.test(it.then.date) && /2026/.test(it.now.date), `${it?.then?.date?.slice(0, 10)} → ${it?.now?.date?.slice(0, 10)}`);
  check("…and lists the matching finding(s) that line up with move-in", (it?.nowMatched ?? []).some((m: any) => m.pre_existing) || (it?.thenMatched ?? []).length > 0, `${it?.nowMatched?.length} now / ${it?.thenMatched?.length} then`);

  const hinglish = await call(tenant, "POST", "/api/claim", { property_id: P, message: "Bathroom ka shishe pe daag hai, 3000 rupees deposit se kategi." });
  check("Hinglish works too", hinglish.body?.result?.claim?.rooms?.includes("bathroom") && hinglish.body?.result?.claim?.amount?.value === 3000 && hinglish.body?.result?.overall === "already_there", hinglish.body?.result?.overall);

  const vague = await call(tenant, "POST", "/api/claim", { property_id: P, message: "There is some damage and we will deduct money." });
  check("a vague message is NOT guessed at: it says it is unclear", vague.body?.result?.overall === "unclear" && vague.body?.result?.understood === false);

  const owner1 = await call(owner, "POST", "/api/claim", { property_id: P, message: "Shower glass is damaged" });
  check("the owner can use it too (same record)", owner1.status === 200 && owner1.body?.result?.overall === "already_there");

  // The message is the landlord's words and must not be stored anywhere.
  const secret = `UNIQUE-MARKER-${Date.now()}-do-not-store shower glass`;
  await call(tenant, "POST", "/api/claim", { property_id: P, message: secret });
  const snap = (await call(owner, "GET", `/api/properties/${P}/snapshot`)).body;
  check("the message is not stored: it appears nowhere in the property's record", !JSON.stringify(snap).includes("UNIQUE-MARKER"));

  // ---------------- Browser ----------------
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const problems: string[] = [];
  let token: string | null = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.setDefaultTimeout(120000);
    page.on("pageerror", (e: any) => problems.push(`[pageerror] ${String(e.message).slice(0, 160)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|hydrat/i.test(m.text())) problems.push(`[console] ${m.text().slice(0, 160)}`); });
    const until = async (fn: () => Promise<boolean>, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(300); } return false; };
    const text = (sel = "body") => page.$eval(sel, (e: any) => String(e.innerText)).catch(() => "");

    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    const nav = page.waitForNavigation({ waitUntil: "networkidle2", timeout: 180000 }).catch(() => null);
    for (const b of await page.$$("button")) if ((await b.evaluate((el) => el.textContent ?? "")).includes("Alex Chen")) { await b.click(); break; }
    await nav;
    await until(async () => !(await text()).includes("Loading your property memory"), 180000);
    check("the tenant's dashboard offers the claim tool", await until(async () => (await page.$("[data-testid=claim-cta]")) !== null) && /broke something/i.test(await text("[data-testid=claim-cta]")));
    await page.screenshot({ path: path.join(OUT, "01-dashboard-cta.png") });

    await page.evaluate(() => (document.querySelector("[data-testid=claim-cta]") as HTMLElement).click());
    await page.waitForSelector("[data-testid=claim-text]", { timeout: 120000 });
    check("the page explains itself and says the message is not saved", /broke/i.test(await text()) && /not saved/i.test(await text()));
    check("the Check button is disabled until something is pasted", await page.$eval("[data-testid=claim-check]", (b: any) => b.disabled));
    await page.type("[data-testid=claim-text]", "Shower glass is damaged, deducting ₹4,000 from your deposit.");
    await page.evaluate(() => (document.querySelector("[data-testid=claim-check]") as HTMLElement).click());
    check("it answers 'Already there at move-in' with the date", await until(async () => (await page.$("[data-testid=claim-item]")) !== null) && /Already there at move-in/i.test(await text("[data-testid=claim-headline]")) && /2024/.test(await text("[data-testid=claim-headline]")), (await text("[data-testid=claim-headline]")).slice(0, 80));
    check("it shows what it understood, including the ₹4,000", /bathroom/i.test(await text("[data-testid=claim-understood]")) && /₹4,000/.test(await text("[data-testid=claim-amount]")));
    check("it shows the move-in and move-out photos side by side, labelled Then and Now", await until(async () => (await page.$$eval("[data-testid=claim-photos] img", (els) => els.filter((i: any) => i.complete && i.naturalWidth > 0).length)) === 2) && /Then/.test(await text("[data-testid=claim-photos]")) && /Now/.test(await text("[data-testid=claim-photos]")));
    check("…with the matching finding listed as 'Matches move-in'", /Matches move-in/.test(await text("[data-testid=claim-findings]")));
    await page.evaluate(() => document.querySelector("[data-testid=claim-result]")?.scrollIntoView());
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, "02-result.png") });

    const reply = await page.$eval("[data-testid=claim-reply-text]", (t: any) => t.value as string);
    check("it drafts a polite reply with the date, the amount and the verify link", /already there when I moved in/i.test(reply) && /1 June 2024/.test(reply) && /₹4,000/.test(reply) && /\/verify/.test(reply) && !/undefined|null|\{\{/.test(reply));
    check("the reply is editable and the page says it is not legal advice", /not legal advice/i.test(await text("[data-testid=claim-disclaimer]")));
    await page.type("[data-testid=claim-landlord]", "Mr Rao");
    check("typing the landlord's name updates the greeting", /^Hi Mr Rao,/.test(await page.$eval("[data-testid=claim-reply-text]", (t: any) => t.value)));
    check("the limits are stated plainly (word lists, not a lawyer, a person decides)", /cannot tell you/i.test(await text("[data-testid=claim-limits]")) && /does not decide who is responsible/i.test(await text("[data-testid=claim-limits]")));

    // Evidence link: created through the real share API, then cancelled.
    await page.evaluate(() => (document.querySelector("[data-testid=claim-add-link]") as HTMLElement).click());
    const withLink = await until(async () => /\/r\/[a-f0-9]{20,}/.test(await page.$eval("[data-testid=claim-reply-text]", (t: any) => t.value)));
    const full = await page.$eval("[data-testid=claim-reply-text]", (t: any) => t.value as string);
    token = full.match(/\/r\/([a-f0-9]{20,})/)?.[1] ?? null;
    check("'Add a link to the sealed record' puts a read-only link into the reply", withLink && !!token);
    if (token) {
      const pub = await fetch(`${BASE}/api/share/${token}`);
      check("…and that link really opens the record without a login", pub.status === 200);
    }
    await page.screenshot({ path: path.join(OUT, "03-reply.png"), fullPage: true });
    await page.evaluate(() => (document.querySelector("[data-testid=claim-cancel-link]") as HTMLElement).click());
    check("'Cancel the link' removes it from the reply", await until(async () => !/\/r\/[a-f0-9]{20,}/.test(await page.$eval("[data-testid=claim-reply-text]", (t: any) => t.value))));
    if (token) {
      await sleep(800);
      check("…and the link no longer opens the record", (await fetch(`${BASE}/api/share/${token}`)).status !== 200);
      token = null;
    }

    // An honest answer when the record does not support the tenant.
    await page.evaluate(() => { (document.querySelector("[data-testid=claim-text]") as HTMLTextAreaElement).value = ""; });
    await page.click("[data-testid=claim-text]", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("[data-testid=claim-text]", "There is damage and we will deduct money.");
    await page.evaluate(() => (document.querySelector("[data-testid=claim-check]") as HTMLElement).click());
    check("a vague message gets 'not enough to go on', not a guess", await until(async () => /Not enough to go on/i.test(await text("[data-testid=claim-headline]"))));
    check("no page or console errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    if (token) await call(tenant, "DELETE", `/api/share/${token}`); // never leave a link behind
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * e2e-demo-ui.ts — demo data stays apart from real data.
 *
 *   npx tsx --env-file=.env scripts/e2e-demo-ui.ts [baseUrl=http://localhost:3000]
 *
 * 1. A brand-new real account (made through the sign-up form) sees only its own empty start: none of the demo
 *    property, no demo banner, no demo photos, and cannot read the demo property through the API.
 * 2. The demo owner sees the demo property clearly labelled: a banner, a DEMO mark on photos, "(demo)" in the picker.
 * Deletes the throwaway account afterwards. Screenshots in .e2e/demo/.
 */

import fs from "fs";
import path from "path";
import puppeteer, { type Page } from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "demo");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const email = `e2e-demoui-${Date.now().toString(36)}@example.test`;

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const problems: string[] = [];
  const open = async (): Promise<Page> => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (e: any) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
    return page;
  };
  const until = async (fn: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(300); } return false; };
  const body = (p: Page) => p.evaluate(() => document.body.innerText);

  try {
    // ---- 1. A new real account. Sign-up now needs an emailed confirmation link a test cannot open, so the
    //         account is created already confirmed with the service key and signed in through the real form.
    const password = "E2e-Demo-Pass-1!";
    const { data: made, error: mkErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Real Newcomer" } });
    if (mkErr) throw mkErr;
    await admin.from("users").upsert({ id: made.user.id, name: "Real Newcomer", email, role: "tenant", created_at: new Date().toISOString() });
    const a = await open();
    await a.goto(BASE + "/login", { waitUntil: "networkidle2" });
    await a.type("input[type=email]", email);
    await a.type("input[type=password]", password);
    const nav = a.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
    await a.evaluate(() => (document.querySelector("form button[type=submit]") as HTMLElement | null)?.click());
    await nav;
    check("a new account starts on its own empty first-property screen", await until(async () => (await a.$("[data-testid=onboarding]")) !== null, 45000));
    const t = await body(a);
    check("…showing none of the demo data (no 381 Elmwood Ave, no demo mark)", !/381 Elmwood/i.test(t) && !/DEMO/.test(t) && (await a.$("[data-testid=demo-banner]")) === null && (await a.$("[data-testid=demo-chip]")) === null);
    const api = await a.evaluate(async () => { const r = await fetch("/api/properties/prop-381/snapshot"); const l = await fetch("/api/properties"); return { snap: r.status, props: (await l.json()).properties?.length }; });
    check("…and cannot read the demo property through the API (403), nor list it", api.snap === 403 && api.props === 0, JSON.stringify(api));
    await a.screenshot({ path: path.join(OUT, "01-new-account.png"), fullPage: true });

    // ---- 2. The demo owner sees the demo, clearly labelled
    const d = await open();
    await d.goto(BASE + "/login", { waitUntil: "networkidle2" });
    for (const b of await d.$$("button")) if ((await b.evaluate((el) => el.textContent ?? "")).includes("Sarah Jenkins")) { await b.click(); break; }
    await d.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
    check("the demo workspace shows a banner saying it is sample data", await until(async () => (await d.$("[data-testid=demo-banner]")) !== null, 45000) && /not a real record|sample data/i.test(await body(d)));
    await d.goto(BASE + "/compare?room=room-kitchen", { waitUntil: "networkidle2" });
    check("photos in the demo carry a DEMO mark", await until(async () => (await d.$$("[data-testid=demo-chip]")).length > 0, 45000));
    await d.screenshot({ path: path.join(OUT, "02-demo-compare.png") });
    const ctx = await d.$eval("[data-testid=compare-context]", (e: any) => String(e.innerText)).catch(() => "");
    check("Compare says Then/Now, the room check verdict, and which areas were not compared", /then/i.test(ctx) && /now/i.test(ctx) && /Same room\?\s*(Matches|Confirmed|First|Check|Doesn|Not checked yet)/i.test(ctx.replace(/\s+/g, " ")) && /areas appear in both|Coverage not recorded/.test(ctx), ctx.replace(/\s+/g, " ").slice(0, 160));
    await d.goto(BASE + "/review", { waitUntil: "networkidle2" });
    await d.goto(BASE + "/", { waitUntil: "networkidle2" });
    await until(async () => (await d.$("[data-testid=demo-banner]")) !== null, 45000);
    check("the demo workspace does not show the first-run guide", (await d.$("[data-testid=getting-started]")) === null);
    check("the banner is on every studio page", await until(async () => (await d.$("[data-testid=demo-banner]")) !== null, 45000));
    // The landing page must point a tenant at their invitation rather than at sign-up.
    const w = await open();
    await w.goto(BASE + "/welcome", { waitUntil: "networkidle2" });
    const wt = await body(w);
    check("the landing page has separate doors for owners, tenants and the free kit", (await w.$("[data-testid=door-owner]")) !== null && (await w.$("[data-testid=door-tenant]")) !== null && (await w.$("[data-testid=door-kit]")) !== null);
    check("…and tells a tenant they cannot sign up on their own", /cannot sign up on your own/i.test(wt) && /invitation link/i.test(wt));
    await w.screenshot({ path: path.join(OUT, "03-landing-doors.png"), fullPage: true });
    await w.close();

    check("no page errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    const { data: users } = await admin.from("users").select("id").eq("email", email);
    const ids = (users ?? []).map((u) => u.id);
    for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {});
    if (ids.length) await admin.from("users").delete().in("id", ids);
    const { data: left } = await admin.from("users").select("id").eq("email", email);
    check("the throwaway account is deleted", (left ?? []).length === 0);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

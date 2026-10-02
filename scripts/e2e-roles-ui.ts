/**
 * e2e-roles-ui.ts — the owner/tenant journey in a real browser (phone-sized).
 *
 *   npx tsx --env-file=.env scripts/e2e-roles-ui.ts [baseUrl=http://localhost:3000]
 *
 * Signs up with the real form (there is no role to pick), lands on the first-property screen, creates a property,
 * creates an invitation, then a second person (separate browser context) opens the link signed out, signs up from it,
 * and joins as a tenant. Checks what each side sees. Deletes both accounts (and the property) afterwards.
 * Screenshots go to .e2e/roles/.
 */

import fs from "fs";
import path from "path";
import puppeteer, { type Page } from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".e2e", "roles");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const PASSWORD = "E2e-Roles-Pass-1!";

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const emails = [`e2e-rolesui-${stamp}-owner@example.test`, `e2e-rolesui-${stamp}-tenant@example.test`];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const problems: string[] = [];
  const open = async (): Promise<Page> => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (e: any) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|hydrat/i.test(m.text())) problems.push(`[console] ${m.text().slice(0, 200)}`); });
    return page;
  };
  const until = async (fn: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(300); } return false; };
  const text = (p: Page, sel = "body") => p.$eval(sel, (e: any) => String(e.innerText)).catch(() => "");
  const click = (p: Page, sel: string) => p.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), sel);
  const shot = (p: Page, n: string) => p.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });

  try {
    // ---- Owner: sign up (no role choice) -> first-property screen -> property -> invitation
    const o = await open();
    await o.goto(BASE + "/signup", { waitUntil: "networkidle2" });
    const signupText = await text(o);
    check("sign-up has no 'I am a' role choice", !/I am a/i.test(signupText) && !(await o.$("[role=tablist]")) && /not asked whether you are an owner or a tenant/i.test(signupText));
    await shot(o, "01-signup");
    await o.type("[data-testid=signup-name]", "Olive Owner");
    await o.type("[data-testid=signup-email]", emails[0]);
    await o.type("[data-testid=signup-password]", PASSWORD);
    await click(o, "[data-testid=signup-submit]");
    check("a new account lands on the first-property screen, not on someone else's data", await until(async () => (await o.$("[data-testid=onboarding]")) !== null, 45000));
    const onb = await text(o, "[data-testid=onboarding]");
    check("it explains that a tenant joins by invitation", /invitation link your landlord sent/i.test(onb));
    check("it says plainly that ownership of the building is not verified", /does not check who owns the building/i.test(onb));
    check("the create button is disabled until an address is typed", await o.$eval("[data-testid=onb-create]", (b) => (b as HTMLButtonElement).disabled));
    await shot(o, "02-onboarding");
    await o.type("[data-testid=onb-address]", "12 Roles Test Street");
    await o.type("[data-testid=onb-unit]", "Flat 2B");
    await click(o, "[data-testid=onb-create]");
    check("creating a property opens the dashboard with the invite card", await until(async () => (await o.$("[data-testid=tenant-invites]")) !== null, 60000));
    check("the owner sees their property's address", /12 Roles Test Street/i.test(await text(o)));
    await until(async () => (await o.$("[data-testid=getting-started]")) !== null, 20000);
    const gs = await text(o, "[data-testid=getting-started]");
    check("the owner gets a first-run guide with four steps and the next one highlighted", (await o.$$("[data-testid^=gs-][data-done]")).length === 4 && await o.$eval("[data-testid=gs-property]", (e: any) => e.dataset.done === "1") && await o.$eval("[data-testid=gs-tenant]", (e: any) => e.dataset.done === "0") && /Create an invitation/.test(gs));
    check("each step says why it matters, and the guide says what happens after move-in", /only you can send/i.test(gs) && /agree or dispute/i.test(gs));
    check("plain wording: 'visits', not 'inspections'", /no visits yet/i.test(await text(o)) && !/no inspections/i.test(await text(o)));
    check("the invite card repeats the ownership statement", /not who owns the property/i.test(await text(o, "[data-testid=tenant-invites]")));
    await click(o, "[data-testid=invite-create]");
    check("an invitation link is created", await until(async () => (await o.$("[data-testid=invite-link]")) !== null));
    const link = await o.$eval("[data-testid=invite-link]", (i: any) => i.value as string);
    check("the link is a /join/ link for this site", /\/join\/[^/]+\.[^/]+$/.test(link), link.slice(0, 50) + "…");
    await shot(o, "03-invite-created");

    // ---- Tenant: opens the link signed out, signs up from it, joins
    const t = await open();
    await t.goto(link, { waitUntil: "networkidle2" });
    check("the invitation page shows what it is for, signed out", await until(async () => (await t.$("[data-testid=join-valid]")) !== null) && /12 Roles Test Street/.test(await text(t)) && /Invited by Olive Owner/.test(await text(t)));
    check("it tells the tenant what role they are getting and that they cannot choose it", /joining as a tenant because the account that manages this property invited you/i.test(await text(t)));
    await shot(t, "04-join-signed-out");
    await click(t, "[data-testid=join-signup]");
    await t.waitForSelector("[data-testid=signup-name]", { timeout: 20000 });
    check("signing up from the invitation says why", /accept the invitation/i.test(await text(t)));
    await t.type("[data-testid=signup-name]", "Tess Tenant");
    await t.type("[data-testid=signup-email]", emails[1]);
    await t.type("[data-testid=signup-password]", PASSWORD);
    await click(t, "[data-testid=signup-submit]");
    check("after signing up they come back to the invitation", await until(async () => /\/join\//.test(t.url()) && (await t.$("[data-testid=join-accept]")) !== null, 45000));
    await click(t, "[data-testid=join-accept]");
    check("accepting joins them and opens the property", await until(async () => (await t.$("[data-testid=join-done]")) !== null, 20000) && await until(async () => new URL(t.url()).pathname === "/" && /12 Roles Test Street/i.test(await text(t)), 60000));
    check("the tenant does NOT get the owner's invite card", (await t.$("[data-testid=tenant-invites]")) === null);
    check("the tenant gets their own two-step guide", await until(async () => (await t.$$("[data-testid^=gs-][data-done]")).length === 2, 20000) && /Start capturing/.test(await text(t, "[data-testid=getting-started]")) && !/Invite your tenant/.test(await text(t, "[data-testid=getting-started]")));
    await shot(t, "05-tenant-dashboard");

    // ---- Owner sees who joined; the link is now dead for everyone else
    await o.reload({ waitUntil: "networkidle2" });
    check("the owner sees who joined", await until(async () => /Tess Tenant/.test(await text(o, "[data-testid=tenant-invites]")), 30000));
    check("the guide ticks off 'Invite your tenant' and moves on to photographing", await o.$eval("[data-testid=gs-tenant]", (e: any) => e.dataset.done === "1") && /Start the move-in visit/.test(await text(o, "[data-testid=getting-started]")));
    const x = await open();
    await x.goto(link, { waitUntil: "networkidle2" });
    check("a used invitation says so to the next person", await until(async () => (await x.$("[data-testid=join-invalid]")) !== null) && /already used/i.test(await text(x)));
    await shot(o, "06-owner-sees-tenant");
    check("no page or console errors", problems.length === 0, problems.slice(0, 3).join(" | ").slice(0, 900));
  } finally {
    await browser.close().catch(() => {});
    const { data: users } = await admin.from("users").select("id").in("email", emails);
    const ids = (users ?? []).map((u) => u.id);
    for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {});
    if (ids.length) await admin.from("users").delete().in("id", ids); // properties, tenancies and events cascade from here
    const { data: left } = await admin.from("users").select("id").in("email", emails);
    const { data: props } = ids.length ? await admin.from("properties").select("id").in("owner_id", ids) : { data: [] as any[] };
    check("the throwaway accounts and their property are deleted", (left ?? []).length === 0 && (props ?? []).length === 0);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

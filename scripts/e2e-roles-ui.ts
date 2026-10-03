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
  const emails = [`e2e-rolesui-${stamp}-owner@example.test`, `e2e-rolesui-${stamp}-tenant@example.test`, `e2e-rolesui-${stamp}-probe@example.org`];
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
  /**
   * Real sign-up now sends a confirmation email the test cannot open, so the accounts used for the journey are
   * created confirmed with the service key. The sign-up page's own behaviour is checked separately below.
   */
  const makeConfirmed = async (email: string, name: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    await admin.from("users").upsert({ id: data.user.id, name, email, role: "tenant", created_at: new Date().toISOString() });
  };
  const loginAs = async (page: Page, email: string) => {
    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    await page.type('input[type=email]', email);
    await page.type('input[type=password]', PASSWORD);
    const nav = page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
    await page.evaluate(() => (document.querySelector('form button[type=submit]') as HTMLElement | null)?.click());
    await nav;
  };
  const text = (p: Page, sel = "body") => p.$eval(sel, (e: any) => String(e.innerText)).catch(() => "");
  const click = (p: Page, sel: string) => p.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), sel);
  const shot = (p: Page, n: string) => p.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });

  try {
    // ---- The sign-up page itself: owner-only wording, and it does not sign you in until the email is confirmed.
    const s0 = await open();
    // The sign-up and resend requests are answered here: tests must never send real email through the SMTP provider.
    await s0.setRequestInterception(true);
    s0.on("request", (rq) => {
      if (rq.method() === "POST" && /\/api\/auth\/(signup|resend)$/.test(rq.url())) {
        return void rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, ok: true, needsConfirmation: true, email: emails[2] }) });
      }
      void rq.continue();
    });
    await s0.goto(BASE + "/signup", { waitUntil: "networkidle2" });
    const signupText = await text(s0);
    check("sign-up has no 'I am a' role choice", !/I am a/i.test(signupText) && !(await s0.$("[role=tablist]")) && /not asked whether you are an owner or a tenant/i.test(signupText));
    check("sign-up says it is for owners and tells tenants to use their invitation", /creates an owner account/i.test(signupText) && /Are you a tenant\?/i.test(signupText) && /landlord sends you an invitation link/i.test(signupText));
    await shot(s0, "01-signup");
    await s0.type("[data-testid=signup-name]", "Probe Person");
    await s0.type("[data-testid=signup-email]", emails[2]);
    await s0.type("[data-testid=signup-password]", PASSWORD);
    await click(s0, "[data-testid=signup-submit]");
    const sent = await until(async () => (await s0.$("[data-testid=signup-sent]")) !== null, 45000);
    {
      check("signing up does NOT sign you in: it asks you to confirm your email", sent && /Confirm your email/i.test(await text(s0)) && /sent a link to/i.test(await text(s0)));
      check("…and offers to send the link again", (await s0.$("[data-testid=signup-resend]")) !== null);
      await shot(s0, "01b-signup-confirm");
    }
    await s0.close();

    // ---- Owner: confirmed account -> first-property screen -> property -> invitation
    await makeConfirmed(emails[0], "Olive Owner");
    const o = await open();
    await loginAs(o, emails[0]);
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
    check("the invite button stays disabled until the tenant's email is typed", await o.$eval("[data-testid=invite-create]", (b) => (b as HTMLButtonElement).disabled));
    await o.type("[data-testid=invite-email]", emails[1]);
    await click(o, "[data-testid=invite-create]");
    check("an invitation link is created", await until(async () => (await o.$("[data-testid=invite-link]")) !== null));
    const link = await o.$eval("[data-testid=invite-link]", (i: any) => i.value as string);
    check("the link is a /join/ link for this site", /\/join\/[^/]+\.[^/]+$/.test(link), link.slice(0, 50) + "…");
    await shot(o, "03-invite-created");

    // ---- Tenant: opens the link signed out, then joins with the invited address
    await makeConfirmed(emails[1], "Tess Tenant");
    const t = await open();
    await t.goto(link, { waitUntil: "networkidle2" });
    check("the invitation page shows what it is for, signed out", await until(async () => (await t.$("[data-testid=join-valid]")) !== null) && /12 Roles Test Street/.test(await text(t)) && /Invited by Olive Owner/.test(await text(t)));
    check("it tells the tenant what role they are getting and that they cannot choose it", /joining as a tenant because the account that manages this property invited you/i.test(await text(t)));
    await shot(t, "04-join-signed-out");
    await click(t, "[data-testid=join-signup]");
    await t.waitForSelector("[data-testid=signup-name]", { timeout: 20000 });
    check("signing up from the invitation says why, and does not show the owner-only note", /Accept your invitation/i.test(await text(t)) && (await t.$("[data-testid=signup-tenant-note]")) === null);
    await loginAs(t, emails[1]);
    await t.goto(link, { waitUntil: "networkidle2" });
    await t.waitForSelector("[data-testid=join-accept]", { timeout: 45000 });
    check("joining is blocked until the tenant confirms this is their landlord", await t.$eval("[data-testid=join-accept]", (b) => (b as HTMLButtonElement).disabled) && /I rent this home from/i.test(await text(t, "[data-testid=join-confirm-label]")));
    await click(t, "[data-testid=join-confirm]");
    check("…and allowed once they confirm", await until(async () => !(await t.$eval("[data-testid=join-accept]", (b) => (b as HTMLButtonElement).disabled))));
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

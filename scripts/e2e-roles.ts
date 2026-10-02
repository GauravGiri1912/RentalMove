/**
 * e2e-roles.ts — roles come from properties and invitations, not from what someone claims at signup.
 *
 *   npx tsx --env-file=.env scripts/e2e-roles.ts [baseUrl=http://localhost:3000]
 *
 * Creates three throwaway accounts through the real signup endpoint (each CLAIMING to be an owner), and drives the
 * real API: nobody gets owner powers by claiming them; creating a property makes you its owner; a tenant can only
 * join through a signed single-use invitation; revoked / used / wrongly-addressed invitations are refused.
 * Deletes the accounts (their property and records cascade) at the end.
 */

import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };

const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now().toString(36);
const created: string[] = [];

async function call(h: Record<string, string> | null, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { ...(h ?? {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

/** Real signup endpoint, claiming to be an owner, then a real login. */
async function newAccount(label: string) {
  const email = `e2e-roles-${stamp}-${label}@example.test`, password = "E2e-Roles-Pass-1!";
  const r = await call(null, "POST", "/api/auth/signup", { name: `Roles ${label.toUpperCase()}`, email, password, role: "owner" });
  if (r.status !== 200) throw new Error(`signup ${label}: ${r.status} ${JSON.stringify(r.body)}`);
  created.push(r.body.userId);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: r.body.userId as string, email, h: { Authorization: `Bearer ${data.session.access_token}` } as Record<string, string> };
}
const me = async (h: Record<string, string>) => (await call(h, "GET", "/api/auth/session")).body?.user;

async function main() {
  const A = await newAccount("a"), B = await newAccount("b"), C = await newAccount("c");
  try {
    // 1. Claiming a role does nothing.
    check("signup accepts a legacy 'role' field but ignores it: the account is not an owner", (await me(A.h))?.role === "tenant" && (await me(B.h))?.role === "tenant");
    check("a self-declared owner cannot read someone else's property (403)", (await call(A.h, "GET", "/api/properties/prop-381/snapshot")).status === 403);
    check("…cannot invite tenants to it (403)", (await call(A.h, "POST", "/api/properties/prop-381/invites", {})).status === 403);
    check("…and sees none of its properties", ((await call(A.h, "GET", "/api/properties")).body?.properties ?? []).length === 0);

    // 2. Creating a property makes you its owner.
    const made = await call(A.h, "POST", "/api/properties", { address_label: "E2E Roles Test Flat", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] });
    check("anyone signed in can start a property", made.status === 201, made.body?.error);
    const pid = made.body?.property?.id as string;
    check("…and that makes them its owner", (await me(A.h))?.role === "owner" && (await call(A.h, "GET", `/api/properties/${pid}/snapshot`)).status === 200);
    check("another account still cannot read it (403)", (await call(B.h, "GET", `/api/properties/${pid}/snapshot`)).status === 403);
    check("the owner can also read their own invitations list", (await call(A.h, "GET", `/api/properties/${pid}/invites`)).status === 200);
    check("another account cannot (403)", (await call(B.h, "GET", `/api/properties/${pid}/invites`)).status === 403 && (await call(B.h, "POST", `/api/properties/${pid}/invites`, {})).status === 403);

    // 3. Invitations.
    check("an invitation needs a login to create (401)", (await call(null, "POST", `/api/properties/${pid}/invites`, {})).status === 401);
    check("an invalid email is refused (400)", (await call(A.h, "POST", `/api/properties/${pid}/invites`, { email: "not-an-email" })).status === 400);
    const inv = await call(A.h, "POST", `/api/properties/${pid}/invites`, {});
    check("the owner creates an invitation link", inv.status === 201 && /^\/join\/.+\..+$/.test(inv.body?.path ?? ""), inv.body?.expires_at?.slice(0, 10));
    const token = (inv.body.path as string).replace("/join/", "");
    const listed = (await call(A.h, "GET", `/api/properties/${pid}/invites`)).body.invites;
    check("the owner can see it again, with the same link", listed.length === 1 && listed[0].status === "pending" && listed[0].path === inv.body.path);

    const prev = await call(null, "GET", `/api/invites/${token}`);
    check("anyone with the link can see what it is for, without logging in", prev.status === 200 && prev.body.valid === true && prev.body.property === "E2E Roles Test Flat" && !!prev.body.invited_by, `${prev.body?.property} · from ${prev.body?.invited_by}`);
    check("a tampered link is refused (404)", (await call(null, "GET", `/api/invites/${token.slice(0, -4)}AAAA`)).status === 404);
    check("accepting needs a login (401)", (await call(null, "POST", `/api/invites/${token}/accept`)).status === 401);
    check("the owner cannot join their own property as a tenant (409)", (await call(A.h, "POST", `/api/invites/${token}/accept`)).status === 409);
    check("an account that manages its own property cannot become a tenant (409)", await (async () => {
      const own = await call(C.h, "POST", "/api/properties", { address_label: "C's own flat", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] });
      return own.status === 201 && (await call(C.h, "POST", `/api/invites/${token}/accept`)).status === 409;
    })());

    // 4. B joins as a tenant.
    const acc = await call(B.h, "POST", `/api/invites/${token}/accept`);
    check("B accepts and joins as a tenant", acc.status === 200 && acc.body.property_id === pid, acc.body?.error);
    const bUser = await me(B.h);
    check("B's role is tenant, assigned to that property only", bUser?.role === "tenant" && bUser?.assigned_property_id === pid);
    check("B can now read the property (200)", (await call(B.h, "GET", `/api/properties/${pid}/snapshot`)).status === 200);
    check("B still cannot invite anyone (403)", (await call(B.h, "POST", `/api/properties/${pid}/invites`, {})).status === 403);
    check("B cannot start a property while a tenant (403)", (await call(B.h, "POST", "/api/properties", { address_label: "x", unit_label: "1" })).status === 403);
    check("B cannot read the demo property either (403)", (await call(B.h, "GET", "/api/properties/prop-381/snapshot")).status === 403);
    check("accepting the same invitation again is harmless", (await call(B.h, "POST", `/api/invites/${token}/accept`)).body?.already === true);
    const after = (await call(A.h, "GET", `/api/properties/${pid}/invites`)).body.invites;
    check("the owner sees who accepted", after[0].status === "accepted" && after[0].accepted_by === "Roles B" && after[0].path === null);
    check("the link is single-use: now reported as used", (await call(null, "GET", `/api/invites/${token}`)).body?.valid === false);

    // 5. Used, revoked and wrongly-addressed invitations.
    // (A third, fresh account is needed for each refusal: C already manages a property.)
    const D = await newAccount("d");
    check("a used invitation is refused for anyone else (409)", (await call(D.h, "POST", `/api/invites/${token}/accept`)).status === 409);
    const forD = await call(A.h, "POST", `/api/properties/${pid}/invites`, { email: "someone.else@example.test" });
    const t2 = (forD.body.path as string).replace("/join/", "");
    check("an invitation addressed to another email refuses a different account (403)", (await call(D.h, "POST", `/api/invites/${t2}/accept`)).status === 403);
    const rev = await call(A.h, "DELETE", `/api/properties/${pid}/invites/${forD.body.id}`);
    check("the owner can revoke a pending invitation", rev.status === 200);
    check("a revoked invitation is refused (409) and reported as cancelled", (await call(D.h, "POST", `/api/invites/${t2}/accept`)).status === 409 && /cancelled/.test((await call(null, "GET", `/api/invites/${t2}`)).body?.reason ?? ""));
    check("revoking again is refused (409); another account cannot revoke (403)", (await call(A.h, "DELETE", `/api/properties/${pid}/invites/${forD.body.id}`)).status === 409 && (await call(B.h, "DELETE", `/api/properties/${pid}/invites/${inv.body.id}`)).status === 403);

    // 6. Limits.
    let pending = 0, last = 0;
    for (let i = 0; i < 6; i++) { const r = await call(A.h, "POST", `/api/properties/${pid}/invites`, {}); last = r.status; if (r.status === 201) pending++; }
    check("at most 5 open invitations at a time (409 after that)", pending === 5 && last === 409, `${pending} created`);
    const D2 = await call(D.h, "POST", "/api/properties", { address_label: "D1", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] });
    await call(D.h, "POST", "/api/properties", { address_label: "D2", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] });
    await call(D.h, "POST", "/api/properties", { address_label: "D3", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] });
    check("an account can manage at most 3 properties (403 for a 4th)", D2.status === 201 && (await call(D.h, "POST", "/api/properties", { address_label: "D4", unit_label: "1", rooms: [{ name: "Kitchen", category: "kitchen" }] })).status === 403);
  } finally {
    const ids = [...created];
    for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {});
    // The users table may not cascade from auth, so remove exactly these accounts' rows too (their properties,
    // tenancies and events cascade from there).
    await admin.from("users").delete().in("id", ids);
    const { data } = await admin.from("users").select("id").in("id", ids);
    const { data: props } = await admin.from("properties").select("id").in("owner_id", ids);
    check("the throwaway accounts and their properties are deleted", (data ?? []).length === 0 && (props ?? []).length === 0);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

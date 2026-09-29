/**
 * migrate-supabase-region.mjs
 *
 * Copies the whole RentalMove database (login accounts + app tables) from the
 * current Supabase project to a new one, e.g. a project in a closer region.
 * Passwords are preserved because auth.users is copied at the Postgres level.
 *
 * Requires pg_dump + psql (PostgreSQL client tools) on PATH.
 *
 * Add to .env (Dashboard → Connect → "Session pooler" connection string, with your DB password):
 *   OLD_DB_URL=postgresql://postgres.<old-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *   NEW_DB_URL=postgresql://postgres.<new-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *
 * Run:  node scripts/migrate-supabase-region.mjs
 * The new project must be EMPTY (freshly created). The old project is only read.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env")) {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const OLD = env.OLD_DB_URL;
const NEW = env.NEW_DB_URL;
if (!OLD || !NEW) {
  console.error("Set OLD_DB_URL and NEW_DB_URL in .env (see header of this script).");
  process.exit(1);
}
if (OLD === NEW) {
  console.error("OLD_DB_URL and NEW_DB_URL are the same — refusing to run.");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rm-migrate-"));
const authFile = path.join(tmp, "auth.sql");
const publicFile = path.join(tmp, "public.sql");

const APP_TABLES = [
  "users", "properties", "property_tenants", "rooms", "inspections", "assets",
  "observations", "comparisons", "share_links", "property_invitations", "audit_log",
];

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 30 }).toString();
}

function psqlFile(db, file) {
  run("psql", [db, "-v", "ON_ERROR_STOP=1", "-q", "-f", file]);
}

function psqlQuery(db, sql) {
  return run("psql", [db, "-At", "-c", sql]).trim();
}

// pg_dump 17+ emits settings older servers don't know; strip them so restore works on any version.
function sanitize(file) {
  const out = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !/^SET transaction_timeout/.test(l))
    .join("\n");
  fs.writeFileSync(file, out);
}

function counts(db) {
  const result = {};
  for (const t of ["auth.users", ...APP_TABLES.map((t) => `public.${t}`)]) {
    try {
      result[t] = Number(psqlQuery(db, `select count(*) from ${t}`));
    } catch {
      result[t] = "missing";
    }
  }
  return result;
}

console.log("1/6 Checking connections…");
psqlQuery(OLD, "select 1");
psqlQuery(NEW, "select 1");
const newUsers = Number(psqlQuery(NEW, "select count(*) from auth.users"));
const newPublic = Number(
  psqlQuery(NEW, "select count(*) from information_schema.tables where table_schema='public'")
);
if (newUsers > 0 || newPublic > 0) {
  console.error(
    `New project is not empty (auth.users=${newUsers}, public tables=${newPublic}). Use a fresh project.`
  );
  process.exit(1);
}

console.log("2/6 Dumping login accounts (auth.users, auth.identities)…");
run("pg_dump", [
  OLD, "--data-only", "--no-owner", "--no-privileges",
  "--table=auth.users", "--table=auth.identities", "-f", authFile,
]);
sanitize(authFile);

console.log("3/6 Dumping app schema + data (public schema)…");
run("pg_dump", [OLD, "--schema=public", "--no-owner", "--no-privileges", "-f", publicFile]);
sanitize(publicFile);

console.log("4/6 Restoring login accounts into new project…");
psqlFile(NEW, authFile);

console.log("5/6 Restoring app schema + data into new project…");
// Supabase projects already have a public schema; don't fail on "already exists".
const pub = fs
  .readFileSync(publicFile, "utf8")
  .replace(/^CREATE SCHEMA public;$/m, "")
  .replace(/^COMMENT ON SCHEMA public IS .*;$/m, "");
fs.writeFileSync(publicFile, pub);
psqlFile(NEW, publicFile);

// The signup trigger lives on auth.users, so a public-schema dump doesn't include it.
psqlQuery(
  NEW,
  "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; " +
    "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users " +
    "FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();"
);
// Make the API layer (PostgREST) see the new tables immediately.
psqlQuery(NEW, "NOTIFY pgrst, 'reload schema';");

console.log("6/6 Verifying row counts…");
const before = counts(OLD);
const after = counts(NEW);
let ok = true;
for (const t of Object.keys(before)) {
  const match = before[t] === after[t];
  if (!match) ok = false;
  console.log(`  ${match ? "✓" : "✗"} ${t.padEnd(30)} old=${before[t]}  new=${after[t]}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (!ok) {
  console.error("\nRow counts differ — do NOT switch .env yet. Check the errors above.");
  process.exit(1);
}
console.log(
  "\nDone. Now update .env with the NEW project's URL, publishable (anon) key and secret (service role) key,\n" +
    "then remove OLD_DB_URL / NEW_DB_URL from .env."
);

/**
 * Test environment.
 *
 * - Cloudinary and Groq are REAL (credentials come from .env.local / .env). Tests that need
 *   them fail loudly when the keys are missing; set OFFLINE_TESTS=1 to run only the offline ones.
 * - The application database is ISOLATED: a throw-away JSON store in the OS temp dir. Tests
 *   never read or write the real Supabase project or data/rentalmove-store.json.
 */
import fs from "fs";
import os from "os";
import path from "path";

for (const name of [".env.local", ".env"]) {
  const file = path.resolve(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  // Repeated key in one file: the last line wins (same as dotenv / Next.js).
  const parsed: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    if (key) parsed[key] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  for (const [key, val] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

process.env.DEVELOPMENT_MOCK_MODE = "true"; // forces the local store, never Supabase
process.env.RENTALMOVE_STORE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "rentalmove-test-")),
  "store.json"
);
process.env.RENTALMOVE_EVENTS_PATH = path.join(path.dirname(process.env.RENTALMOVE_STORE_PATH), "events.json");
if (process.env.OFFLINE_TESTS === "1") process.env.VISION_PROVIDER = "mock"; // no Groq calls offline
// Uploads made by tests must not fire the production webhook.
delete process.env.CLOUDINARY_NOTIFICATION_URL;

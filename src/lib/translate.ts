/**
 * translate.ts — cached machine translation of report text (server only).
 *
 * Each English string is translated once per property and language; results are stored as
 * `translation` events keyed by sha1 of the source, so an edited finding gets a fresh
 * translation and nothing is re-translated on every page view.
 */

import crypto from "crypto";
import { appendEvent, deriveTranslations, listEvents } from "./events";
import { GroqVisionProvider, getVisionProvider } from "./vision";

export const LANGUAGE_NAMES: Record<string, string> = { hi: "Hindi (Devanagari script)" };
export const sourceKey = (text: string) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 20);

const CHUNK = 30;

/**
 * A usable Hindi string: Devanagari required; otherwise only Latin letters (product names,
 * units), digits, punctuation and a few symbols. Rejects mixed-script output such as Arabic
 * words the model sometimes slips in.
 */
export function validTranslation(lang: string, text: string): boolean {
  if (lang !== "hi") return !!text;
  return /[ऀ-ॿ]/.test(text) && /^[ऀ-ॿ᳐-᳿꣠-ꣿA-Za-z0-9\s.,;:!?'"()\[\]\/&%+\-–—×≈²³‱·…’‘“”#]*$/.test(text);
}

/** Cached translations only (no model call) for the given texts. */
export async function cachedTranslations(propertyId: string, lang: string, texts: string[]): Promise<Record<string, string>> {
  const cache = deriveTranslations(await listEvents(propertyId, ["translation"]))[lang] ?? {};
  const out: Record<string, string> = {};
  for (const t of texts) { const v = cache[sourceKey(t)]; if (v && validTranslation(lang, v)) out[t] = v; }
  return out;
}

/** Translations for `texts`, calling the model only for ones not cached yet. */
export async function translateTexts(propertyId: string, lang: string, texts: string[]): Promise<{ translations: Record<string, string>; translated_now: number; failed: number }> {
  const language = LANGUAGE_NAMES[lang];
  if (!language) throw new Error(`Unsupported language: ${lang}`);
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const translations = await cachedTranslations(propertyId, lang, unique);
  const missing = unique.filter((t) => !translations[t]);
  let failed = 0, translatedNow = 0;
  if (missing.length) {
    const vision = getVisionProvider();
    if (!(vision instanceof GroqVisionProvider)) throw new Error("Translation needs the Groq provider (GROQ_API_KEY).");
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      const result = await vision.translate(chunk, language);
      // Strings that came back missing or in the wrong script are retried once, together.
      const retry = chunk.filter((_, j) => !result[j] || !validTranslation(lang, result[j]!));
      const again = retry.length ? await vision.translate(retry, language) : [];
      const entries: Record<string, string> = {};
      chunk.forEach((t, j) => {
        const first = result[j];
        const v = first && validTranslation(lang, first) ? first : again[retry.indexOf(t)] ?? null;
        if (v && validTranslation(lang, v)) { entries[sourceKey(t)] = v; translations[t] = v; translatedNow++; } else failed++;
      });
      if (Object.keys(entries).length) {
        await appendEvent({ property_id: propertyId, type: "translation", resource_id: null, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { lang, entries } });
      }
    }
  }
  return { translations, translated_now: translatedNow, failed };
}

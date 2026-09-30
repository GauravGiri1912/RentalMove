/**
 * phototime.ts — does the time stored inside a photo fit the visit it was filed under?
 *
 * Cloudinary returns the file's EXIF (image_metadata). The capture time (DateTimeOriginal)
 * is compared with the inspection date and the upload time, and the editing software tag is
 * surfaced. EXIF has no reliable time zone and is easy to strip, so this flags things for a
 * person to look at — it never rejects a photo, and "no time in the file" is neutral
 * (in-app camera captures, screenshots and most messaging apps carry none).
 * GPS and other EXIF fields are deliberately not stored.
 */

export interface PhotoExif {
  /** DateTimeOriginal as written in the file, "YYYY-MM-DDTHH:mm:ss" (+offset if the file has one). */
  taken_at: string | null;
  software: string | null;
  camera: string | null;
}

export type TimeLevel = "ok" | "warn" | "none";
export interface TimeCheck { level: TimeLevel; label: string; detail: string; days_before_visit: number | null }

/** Days a capture may precede the visit date before it is flagged (time zones, late uploads). */
export const EARLY_TOLERANCE_DAYS = 2;
const EDITORS = /photoshop|lightroom|gimp|snapseed|picsart|facetune|affinity|pixelmator|canva|photoroom|remini|luminar|paint\.net/i;

/** Extracts the fields we keep from Cloudinary's image_metadata (drops everything else, incl. GPS). */
export function exifFromMetadata(m: Record<string, any> | null | undefined): PhotoExif {
  const raw = m?.DateTimeOriginal ?? m?.CreateDate ?? m?.DateTimeDigitized ?? null;
  const offset = m?.OffsetTimeOriginal ?? m?.OffsetTime ?? null;
  const camera = [m?.Make, m?.Model].filter(Boolean).join(" ").trim() || null;
  return { taken_at: parseExifDate(raw, offset), software: m?.Software ? String(m.Software).slice(0, 80) : null, camera: camera ? camera.slice(0, 80) : null };
}

/** "2024:06:01 10:00:00" (+ "+05:30") → ISO-like string; null when absent or invalid. */
export function parseExifDate(raw: unknown, offset?: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === "0000") return null;
  const off = typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "";
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`;
  return Number.isNaN(new Date(off ? iso : `${iso}Z`).getTime()) ? null : iso;
}

const DAY = 864e5;
/** EXIF without an offset is local time of an unknown zone: compare as if UTC, at day granularity. */
const asTime = (iso: string) => new Date(/[+-]\d{2}:\d{2}$|Z$/.test(iso) ? iso : `${iso}Z`).getTime();

export function photoTimeCheck(exif: PhotoExif | null | undefined, visitIso: string | null | undefined, uploadedIso: string | null | undefined): TimeCheck {
  const editor = exif?.software && EDITORS.test(exif.software) ? exif.software : null;
  if (!exif?.taken_at) {
    return editor
      ? { level: "warn", label: `Edited with ${editor}`, detail: "The file names editing software and carries no capture time.", days_before_visit: null }
      : { level: "none", label: "No capture time in file", detail: "Normal for in-app camera captures, screenshots and photos sent through messaging apps.", days_before_visit: null };
  }
  const taken = asTime(exif.taken_at);
  const day = exif.taken_at.slice(0, 10);
  const issues: string[] = [];
  let before: number | null = null;
  if (visitIso) {
    before = Math.round((new Date(visitIso.slice(0, 10) + "T00:00:00Z").getTime() - new Date(day + "T00:00:00Z").getTime()) / DAY);
    if (before > EARLY_TOLERANCE_DAYS) issues.push(`taken ${fmtDays(before)} before this visit`);
  }
  if (uploadedIso && taken - new Date(uploadedIso).getTime() > DAY) issues.push("capture time is after the upload (camera clock?)");
  if (editor) issues.push(`edited with ${editor}`);
  if (issues.length) return { level: "warn", label: cap(issues[0]), detail: `File says taken ${day}${exif.camera ? ` on ${exif.camera}` : ""}. ${issues.map(cap).join(". ")}.`, days_before_visit: before };
  return { level: "ok", label: `Taken ${day}`, detail: `Capture time in the file matches the visit${exif.camera ? ` (${exif.camera})` : ""}.`, days_before_visit: before };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function fmtDays(d: number) {
  if (d >= 60) return `${Math.round(d / 30.44)} months`;
  return `${d} day${d === 1 ? "" : "s"}`;
}

import { sha256HexAny } from "./sha256";
import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export const ROOM_LABEL: Record<string, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Primary bedroom",
  living_room: "Living room",
  exterior: "Exterior",
  unknown: "Unknown",
};

export const INSPECTION_LABEL: Record<string, string> = {
  move_in: "Move-in",
  inspection: "Periodic",
  move_out: "Move-out",
};

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("en-GB", opts);
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function relTime(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const shortHash = (h: string, n = 10) => `${h.slice(0, n)}…${h.slice(-4)}`;

/** SHA-256 hex; works on insecure origins too (phone on http://192.168.x.x), see lib/sha256.ts. */
export const sha256Hex = (buf: ArrayBuffer) => sha256HexAny(buf);

export const CATEGORY_META_LABEL: Record<string, string> = {
  scratch: "Scratch",
  stain: "Stain",
  crack: "Crack",
  dent: "Dent / chip",
  mark: "Mark / scuff",
  other: "Other",
};

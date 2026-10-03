/**
 * dev-confirm.ts — whether a confirmation link may be shown on screen instead of only emailed.
 *
 * Handing the link back to the browser means anyone could "confirm" an address they do not own, so it is only
 * allowed for local development (or when explicitly switched on). A production build never shows it.
 */
export function mayShowConfirmLink(): boolean {
  if (process.env.ALLOW_DEV_CONFIRM_LINK === "1") return true;
  return process.env.NODE_ENV !== "production";
}

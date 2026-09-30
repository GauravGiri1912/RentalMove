// Cloudinary delivery-URL builder. Every derived image in the product is a URL,
// not a stored file — this is the pipeline's "presets" in one place.

import { getCloudName, named, NAMED_TRANSFORMATIONS, type NamedRendition } from "./cloudinary-urls";

export const CLOUD_NAME = getCloudName();

export type Preset = "thumb" | "review" | "vlm" | "evidence" | "privacy" | "matched";

const PRESET_NAME: Record<Preset, NamedRendition> = { thumb: "rm_thumb", review: "rm_review", vlm: "rm_vlm", matched: "rm_matched", privacy: "rm_privacy", evidence: "rm_evidence" };

/** The app's fixed renditions — each is a named transformation in Cloudinary (t_rm_*). */
export const PRESETS: Record<Preset, { label: string; purpose: string; t: string[]; name: NamedRendition }> = {
  thumb: { label: "Thumbnail", purpose: "Grids and lists — full frame, so finding boxes stay valid", t: NAMED_TRANSFORMATIONS.rm_thumb.split("/"), name: "rm_thumb" },
  review: { label: "Review", purpose: "Full-screen triage", t: NAMED_TRANSFORMATIONS.rm_review.split("/"), name: "rm_review" },
  vlm: { label: "Model input", purpose: "What the vision model sees — capped to control tokens", t: NAMED_TRANSFORMATIONS.rm_vlm.split("/"), name: "rm_vlm" },
  matched: { label: "Matched frame", purpose: "Same crop + exposure for fair before/after", t: NAMED_TRANSFORMATIONS.rm_matched.split("/"), name: "rm_matched" },
  privacy: { label: "Privacy", purpose: "Faces pixelated before sharing", t: NAMED_TRANSFORMATIONS.rm_privacy.split("/"), name: "rm_privacy" },
  evidence: { label: "Evidence", purpose: "Report image with sharpening for detail", t: NAMED_TRANSFORMATIONS.rm_evidence.split("/"), name: "rm_evidence" },
};

export function cldUrl(publicId: string, transforms: string[] = [], opts: { version?: number; ext?: string } = {}) {
  const t = transforms.filter(Boolean).join("/");
  const v = opts.version ? `v${opts.version}/` : "";
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${t ? t + "/" : ""}${v}${publicId}${opts.ext ? "." + opts.ext : ""}`;
}

export function presetUrl(publicId: string, preset: Preset) {
  return named(publicId, PRESET_NAME[preset]);
}

/** Splits a URL into coloured segments for the "under the hood" views. */
export function explainUrl(url: string) {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/)([^/]+)(\/image\/upload\/)(.*)$/);
  if (!m) return [{ kind: "base" as const, text: url }];
  const rest = m[4].split("/");
  const out: { kind: "base" | "cloud" | "transform" | "version" | "id"; text: string }[] = [
    { kind: "base", text: m[1] },
    { kind: "cloud", text: m[2] },
    { kind: "base", text: m[3] },
  ];
  let idStart = rest.findIndex((s) => !/^[a-z]{1,3}_/.test(s) && !/^v\d+$/.test(s));
  if (idStart < 0) idStart = rest.length;
  rest.slice(0, idStart).forEach((s) => out.push({ kind: /^v\d+$/.test(s) ? "version" : "transform", text: s + "/" }));
  out.push({ kind: "id", text: rest.slice(idStart).join("/") });
  return out;
}

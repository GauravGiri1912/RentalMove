/**
 * cloudinary-urls.ts — pure Cloudinary delivery-URL builders (no SDK, no Node APIs).
 *
 * Everything the app shows or sends to the model is a *transformation of the original*:
 * the uploaded file is never modified. These helpers are used by both the real and the
 * offline media provider so URLs are identical everywhere (server and browser).
 */

/** Public ID of the 1x1 white pixel used to draw boxes (uploaded by scripts/provision-cloudinary.ts). */
export const PIXEL_PUBLIC_ID = "rentalmove_ui/px";
const PIXEL_LAYER = PIXEL_PUBLIC_ID.replace(/\//g, ":");

export function getCloudName(): string {
  const name =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME;

  if (!name) {
    if (process.env.NODE_ENV === "test" || process.env.DEVELOPMENT_MOCK_MODE === "true") {
      return "demo";
    }
    console.error(
      "[Cloudinary] Configuration Error: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not configured."
    );
    throw new Error(
      "Cloudinary configuration missing: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME must be set in environment variables."
    );
  }
  return name;
}

/** Extracts the Cloudinary public_id from a delivery URL (or returns the input if it already is one). */
export function toPublicId(publicIdOrUrl: string): string {
  if (!/^https?:\/\//i.test(publicIdOrUrl)) return publicIdOrUrl.replace(/\.[a-z0-9]{2,4}$/i, "");
  const m = publicIdOrUrl.match(/\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(properties\/.+?|rentalmove_ui\/.+?)(?:\.[a-z0-9]{2,4})?(?:\?.*)?$/i);
  return m ? m[1] : publicIdOrUrl;
}

export function buildUrl(publicIdOrUrl: string, transformation = ""): string {
  const id = toPublicId(publicIdOrUrl);
  if (/^https?:\/\//i.test(id)) return id; // not a Cloudinary URL we understand — leave untouched
  const t = transformation ? `${transformation}/` : "";
  return `https://res.cloudinary.com/${getCloudName()}/image/upload/${t}${id}`;
}

// ---------------------------------------------------------------------------
// Standard renditions
// ---------------------------------------------------------------------------

export const TRANSFORMS = {
  thumb: "c_fill,w_400,h_300,f_auto,q_auto",
  review: "c_limit,w_1600,h_1200,f_auto,q_auto",
  /** Cost-controlled copy sent to the vision model. */
  vlm: "c_limit,w_1024,q_auto,f_jpg",
  /** Faces blurred — used for everything shown through a share link or report. */
  shared: "c_limit,w_1600,h_1200,e_pixelate_faces:20,f_auto,q_auto",
} as const;

export const thumbUrl = (id: string) => named(id, "rm_thumb");
export const reviewUrl = (id: string) => named(id, "rm_review");
export const vlmUrl = (id: string) => named(id, "rm_vlm");
export const sharedUrl = (id: string) => named(id, "rm_shared");
export const originalUrl = (id: string) => buildUrl(id, "f_auto,q_auto");

// ---------------------------------------------------------------------------
// Matched (comparable) renditions
// ---------------------------------------------------------------------------

/**
 * Both photos of a comparison go through the *same* pipeline so differences in framing and
 * exposure are reduced before the model sees them: smart-gravity crop to a fixed frame, then
 * automatic brightness and contrast.
 */
export const MATCHED_BASE = "c_fill,g_auto,w_1600,h_1200,e_auto_brightness,e_auto_contrast";

export interface TileSpec {
  /** Zero-based column / row in a `grid x grid` split. */
  col: number;
  row: number;
  grid: number;
}

export function tileLabel({ col, row, grid }: TileSpec): string {
  if (grid === 2) {
    return `${row === 0 ? "top" : "bottom"}-${col === 0 ? "left" : "right"}`;
  }
  return `row ${row + 1}, column ${col + 1}`;
}

/** Matched rendition of the whole frame, sized for the vision model. */
export function matchedUrl(id: string): string {
  return named(id, "rm_matched");
}

// ---------------------------------------------------------------------------
// Named transformations (Strict Transformations–ready)
// ---------------------------------------------------------------------------

/**
 * Every FIXED rendition the app uses, registered in Cloudinary as a named transformation
 * (scripts/provision-named-transformations.ts) and allowed under Strict Transformations.
 * Dynamic recipes (listing edits, lab, watermarks, evidence boxes) are signed server-side.
 */
export const NAMED_TRANSFORMATIONS = {
  rm_review: "c_limit,w_1600,h_1200/f_auto,q_auto",
  rm_thumb: "c_limit,w_720/f_auto,q_auto",
  rm_tile: "c_fill,g_auto,w_96,h_96/f_auto,q_auto",
  rm_ghost: "c_limit,w_640/f_jpg,q_auto",
  rm_jpeg: "f_jpg,q_100",
  rm_pixel: "c_limit,w_1200/f_jpg,q_auto:best",
  rm_vlm: "c_limit,w_1024/f_jpg,q_auto",
  rm_matched: `${MATCHED_BASE}/c_limit,w_1024,f_jpg,q_auto`,
  rm_shared: "c_limit,w_1600,h_1200,e_pixelate_faces:20/f_auto,q_auto",
  rm_evidence: "c_limit,w_1400/e_sharpen:60/f_auto,q_auto",
  rm_privacy: "e_pixelate_faces:18/c_limit,w_1600/f_auto,q_auto",
  rm_portrait: "c_fill,g_auto,w_1200,h_1400,e_pixelate_faces:18/f_auto,q_auto",
} as const;
export type NamedRendition = keyof typeof NAMED_TRANSFORMATIONS;

/** t_rm_* once provisioned (NEXT_PUBLIC_CLOUDINARY_NAMED=1); the equivalent raw recipe before. */
export function named(id: string, name: NamedRendition): string {
  return buildUrl(id, process.env.NEXT_PUBLIC_CLOUDINARY_NAMED === "1" ? `t_${name}` : NAMED_TRANSFORMATIONS[name]);
}

/** Matched rendition of one tile of a `grid x grid` split of the frame. */
export function matchedTileUrl(id: string, tile: TileSpec): string {
  const size = (1 / tile.grid).toFixed(4);
  const x = (tile.col / tile.grid).toFixed(4);
  const y = (tile.row / tile.grid).toFixed(4);
  return buildUrl(
    id,
    `${MATCHED_BASE}/c_crop,g_north_west,w_${size},h_${size},x_${x},y_${y}/c_limit,w_768,f_jpg,q_auto`
  );
}

// ---------------------------------------------------------------------------
// Evidence image (boxes + labels drawn by Cloudinary itself)
// ---------------------------------------------------------------------------

export interface EvidenceBox {
  bbox: [number, number, number, number];
  label?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const f = (n: number) => Number(n.toFixed(4)).toString();

/** Text for an l_text layer: strip anything that would break the URL grammar. */
function layerText(text: string): string {
  const safe = text.replace(/[^A-Za-z0-9 .:+-]/g, "").trim().slice(0, 40);
  return encodeURIComponent(safe).replace(/%20/g, "%20");
}

/**
 * Transformation chain that draws hollow red boxes (four thin bars per box) and a label chip,
 * using fl_relative so coordinates are the model's normalised [x1,y1,x2,y2] values directly.
 */
export function evidenceTransformation(boxes: EvidenceBox[], opts: { pixelateFaces?: boolean } = {}): string {
  const parts: string[] = [];
  parts.push(`c_limit,w_1600,h_1200${opts.pixelateFaces ? ",e_pixelate_faces:20" : ""}`);

  const tv = 0.012; // bar thickness as fraction of image height
  const th = 0.009; // bar thickness as fraction of image width
  const red = "co_rgb:ef4444,e_colorize:100";

  for (const { bbox, label } of boxes) {
    let [x1, y1, x2, y2] = bbox.map(clamp01);
    if (x2 <= x1 || y2 <= y1) continue;
    const w = x2 - x1;
    const h = y2 - y1;
    const bar = (bw: number, bh: number, x: number, y: number) =>
      `l_${PIXEL_LAYER},w_${f(bw)},h_${f(bh)},fl_relative,${red}/fl_layer_apply,g_north_west,x_${f(x)},y_${f(y)}`;
    parts.push(bar(w, tv, x1, y1)); // top
    parts.push(bar(w, tv, x1, Math.max(0, y2 - tv))); // bottom
    parts.push(bar(th, h, x1, y1)); // left
    parts.push(bar(th, h, Math.max(0, x2 - th), y1)); // right
    if (label) {
      const ty = y1 > 0.07 ? y1 - 0.06 : Math.min(0.94, y2 + 0.005);
      parts.push(
        `l_text:Arial_28_bold:${layerText(label)},co_white,b_rgb:ef4444/fl_layer_apply,g_north_west,x_${f(x1)},y_${f(ty)}`
      );
    }
  }

  parts.push("f_auto,q_auto");
  return parts.join("/");
}

export function evidenceUrl(id: string, boxes: EvidenceBox[], opts: { pixelateFaces?: boolean } = {}): string {
  return buildUrl(id, evidenceTransformation(boxes, opts));
}

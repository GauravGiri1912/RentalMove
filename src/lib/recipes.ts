/**
 * recipes.ts — the ONLY dynamic Cloudinary recipes the app will sign. Clients send a
 * structured recipe; the server turns it into a transformation string from this whitelist,
 * so a caller can never smuggle arbitrary (or expensive) transformations into a signed URL.
 */

import { z } from "zod";
import { evidenceTransformation } from "./cloudinary-urls";

const WATERMARK = "l_text:Arial_22_bold_letter_spacing_2:AI-ALTERED%20%C2%B7%20NOT%20EVIDENCE,co_white,b_rgb:111214,o_85/fl_layer_apply,g_south_east,x_24,y_24";
const LISTING_W = { "3:2": 1200, "1:1": 900, "4:5": 880 } as const;

export const RecipeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listing"), remove: z.boolean(), enhance: z.boolean(), ratio: z.enum(["3:2", "1:1", "4:5"]), watermark: z.boolean().default(true) }),
  z.object({ kind: z.literal("listing-before"), ratio: z.enum(["3:2", "1:1", "4:5"]) }),
  z.object({ kind: z.literal("tile"), size: z.number().int().min(48).max(320).default(160) }),
  /** Evidence image: finding boxes and labels drawn BY CLOUDINARY into the pixels. */
  z.object({
    kind: z.literal("evidence"),
    pixelate: z.boolean().default(true),
    boxes: z.array(z.object({
      bbox: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
      label: z.string().max(40).optional(),
    })).max(10),
  }),
  z.object({
    kind: z.literal("lab"),
    crop: z.enum(["none", "1:1", "4:3", "16:9"]),
    width: z.number().int().min(200).max(1600),
    effects: z.array(z.enum(["pixelate", "improve", "brightness", "contrast", "sharpen", "grayscale"])).max(6),
    format: z.enum(["auto", "jpg", "webp", "avif"]),
    quality: z.enum(["auto", "auto:eco", "90", "60"]),
  }),
]);
export type Recipe = z.infer<typeof RecipeSchema>;

/** Generative recipes spend extra credits; only owners may request them. */
export const isGenerative = (r: Recipe) => r.kind === "listing" && (r.remove || r.enhance);

export function transformationFor(r: Recipe): string {
  switch (r.kind) {
    case "listing":
      return [
        r.remove ? "e_gen_remove:prompt_person" : "",
        r.enhance ? "e_enhance" : "",
        `c_fill,g_auto,ar_${r.ratio},w_${LISTING_W[r.ratio]}`,
        r.watermark ? WATERMARK : "",
        "f_auto,q_auto",
      ].filter(Boolean).join("/");
    case "listing-before":
      return `c_fill,g_auto,ar_${r.ratio},w_${LISTING_W[r.ratio]}/f_auto,q_auto`;
    case "tile":
      return `c_fill,g_auto,w_${r.size},h_${r.size}/f_auto,q_auto`;
    case "evidence":
      return evidenceTransformation(r.boxes, { pixelateFaces: r.pixelate });
    case "lab": {
      const e = new Set(r.effects);
      return [
        e.has("pixelate") ? "e_pixelate_faces:18" : "",
        e.has("improve") ? "e_improve" : "",
        e.has("brightness") ? "e_auto_brightness" : "",
        e.has("contrast") ? "e_auto_contrast" : "",
        e.has("grayscale") ? "e_grayscale" : "",
        r.crop === "none" ? `c_limit,w_${r.width}` : `c_fill,g_auto,ar_${r.crop},w_${r.width}`,
        e.has("sharpen") ? "e_sharpen:60" : "",
        `f_${r.format},q_${r.quality}`,
      ].filter(Boolean).join("/");
    }
  }
}

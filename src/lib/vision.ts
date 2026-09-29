import {
  ImageAnalysis,
  ImageAnalysisSchema,
  ComparisonResult,
  ComparisonResultSchema,
  SearchFilter,
  SearchFilterSchema,
} from "./schemas";
import { sanitizeObservationText } from "./copy";
import { filterObservations, filterComparisonChanges } from "./observation-filter";
import { getMediaProvider } from "./media";
import { TileSpec, tileLabel } from "./cloudinary-urls";

export interface VisionProvider {
  analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis>;
  compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
    /** If true, runs a 2x2 tile comparison on matched Cloudinary crops. */
    tiled?: boolean;
  }): Promise<ComparisonResult>;
  parseSearchQuery(q: string): Promise<SearchFilter>;
}

// =========================================================================
// MOCK VISION PROVIDER (Deterministic data for offline / unit tests)
// =========================================================================

export class MockVisionProvider implements VisionProvider {
  async analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis> {
    const { imageUrl, roomHint } = input;
    const lower = (imageUrl || "").toLowerCase();

    if (lower.includes("blurry")) {
      return ImageAnalysisSchema.parse({
        room_guess: "unknown",
        image_quality: "blurry",
        observations: [],
      });
    }

    let observations: any[] = [];
    let room = roomHint || "living_room";

    if (lower.includes("kitchen") || roomHint === "kitchen") {
      room = "kitchen";
      observations = [
        {
          category: "scratch",
          sub_area: "lower_cabinet",
          description: sanitizeObservationText("Possible scratch visible on lower cabinet door finish."),
          confidence: 0.88,
          bbox: [0.15, 0.45, 0.38, 0.72],
        },
      ];
    } else if (lower.includes("bathroom") || roomHint === "bathroom") {
      room = "bathroom";
      observations = [
        {
          category: "stain",
          sub_area: "grout_line",
          description: sanitizeObservationText("Visible discoloration along shower wall tile grout line."),
          confidence: 0.84,
          bbox: [0.28, 0.35, 0.52, 0.62],
        },
      ];
    } else if (lower.includes("bedroom") || roomHint === "bedroom") {
      room = "bedroom";
      observations = [
        {
          category: "mark",
          sub_area: "accent_wall",
          description: sanitizeObservationText("Visible superficial scuff mark on drywall surface."),
          confidence: 0.79,
          bbox: [0.6, 0.3, 0.75, 0.48],
        },
      ];
    } else {
      observations = [
        {
          category: "mark",
          sub_area: "baseboard_corner",
          description: sanitizeObservationText("Possible surface rub mark near entryway moulding."),
          confidence: 0.68,
          bbox: [0.1, 0.75, 0.25, 0.9],
        },
      ];
    }

    const { kept } = filterObservations(observations, "ok");
    return ImageAnalysisSchema.parse({
      room_guess: room,
      image_quality: "ok",
      observations: kept,
    });
  }

  async compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
    tiled?: boolean;
  }): Promise<ComparisonResult> {
    const changes = [
      {
        description: sanitizeObservationText(
          "Visible superficial marking observed near lower baseboard that was not prominent in baseline capture."
        ),
        confidence: 0.82,
        region: "bottom-left",
      },
    ];

    return ComparisonResultSchema.parse({
      summary: `Visual comparison completed for ${input.room}. Assistive visual variations noted between capture dates.`,
      changes: filterComparisonChanges(changes),
      caveats: [
        "Diff analysis is influenced by ambient lighting and angle variations.",
        "Assistive observation only; does not establish liability or condition classification.",
      ],
    });
  }

  async parseSearchQuery(q: string): Promise<SearchFilter> {
    const lower = q.toLowerCase();
    const filter: SearchFilter = {};

    if (lower.includes("kitchen")) filter.room = "kitchen";
    else if (lower.includes("bathroom")) filter.room = "bathroom";
    else if (lower.includes("bedroom")) filter.room = "bedroom";
    else if (lower.includes("living")) filter.room = "living_room";
    else if (lower.includes("exterior")) filter.room = "exterior";

    if (lower.includes("move-in") || lower.includes("move in") || lower.includes("baseline")) {
      filter.inspection_type = "move_in";
    } else if (lower.includes("move-out") || lower.includes("move out")) {
      filter.inspection_type = "move_out";
    } else if (lower.includes("periodic") || lower.includes("inspection")) {
      filter.inspection_type = "inspection";
    }

    if (lower.includes("scratch")) filter.issue_category = "scratch";
    else if (lower.includes("stain")) filter.issue_category = "stain";
    else if (lower.includes("crack")) filter.issue_category = "crack";
    else if (lower.includes("dent")) filter.issue_category = "dent";
    else if (lower.includes("mark")) filter.issue_category = "mark";

    if (lower.includes("pending")) filter.review_status = "pending";
    else if (lower.includes("accepted")) filter.review_status = "accepted";
    else if (lower.includes("rejected")) filter.review_status = "rejected";
    else if (lower.includes("edited")) filter.review_status = "edited";

    const yearMatch = lower.match(/\b(202[0-9])\b/);
    if (yearMatch) {
      filter.date_from = `${yearMatch[1]}-01-01`;
      filter.date_to = `${yearMatch[1]}-12-31`;
    }

    return SearchFilterSchema.parse(filter);
  }
}

// =========================================================================
// GROQ VISION / LLM PROVIDER (Real Multimodal Vision with Qwen)
// =========================================================================

export class GroqVisionProvider implements VisionProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName = "qwen/qwen3.8-27b") {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  /**
   * Safe fetch with automatic retry on 429 and 5xx. Throws on permanent failure.
   */
  private async postChat(payload: Record<string, any>, maxRetries = 3): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          const errText = await response.text().catch(() => "");
          if (errText.includes("tokens per day") || errText.includes("TPD")) {
            throw new Error(`Groq daily token limit (TPD) reached: ${errText}`);
          }
          let waitMs = 5000 * Math.pow(1.5, attempt);
          const match = errText.match(/try again in ([0-9.]+)s/i);
          if (match) {
            waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
          }
          console.warn(`[GroqVision] Rate limit 429 (attempt ${attempt + 1}/${maxRetries + 1}). Waiting ${waitMs}ms...`);
          if (attempt === maxRetries) throw new Error(`Groq rate limit exceeded after ${maxRetries} retries: ${errText}`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (response.status >= 500 && attempt < maxRetries) {
          const waitMs = 2000 * (attempt + 1);
          console.warn(`[GroqVision] Server error ${response.status}. Retrying in ${waitMs}ms...`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new Error(`Groq API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        const cleanJson = content.replace(/```json/gi, "").replace(/```/g, "").trim();
        return JSON.parse(cleanJson);
      } catch (err: any) {
        lastError = err;
        if (attempt === maxRetries) break;
      }
    }

    throw lastError || new Error("Failed to communicate with Groq Vision API");
  }

  async analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis> {
    const prompt = `You are an objective AI property inspection assistant for rental condition documentation.
Inspect this photo and output ONLY valid JSON matching this schema:
{
  "room_guess": "living_room" | "kitchen" | "bathroom" | "bedroom" | "exterior" | "unknown",
  "image_quality": "ok" | "blurry" | "too_dark" | "not_a_room",
  "observations": [
    {
      "category": "scratch" | "stain" | "crack" | "dent" | "mark" | "other",
      "sub_area": "string (e.g. lower_cabinet, floor, baseboard, shower_wall, counter)",
      "description": "neutral description of visible surface feature",
      "confidence": number between 0 and 1,
      "bbox": [x1, y1, x2, y2]
    }
  ]
}
STRICT RULES:
1. Provide neutral, objective condition observations only.
2. NEVER use blame, fault, damage claims, tenant liability, deposit deduction language, or repair costs.
3. Always prefix descriptions with "Possible", "Visible", "Observed", or "Noted".
4. Bounding box bbox is [x1, y1, x2, y2] normalized between 0 and 1. Do NOT draw a box covering the entire photo (area must be < 70%).
5. Do NOT report "no damage", "clean room", or "no issues" as an observation. If no specific surface marks/defects are visible, return an empty observations array: [].
6. If the image is blurry, too dark, or not an interior/exterior room, set image_quality accordingly and return empty observations: [].
7. Return ONLY valid JSON, no markdown formatting.
Room hint: ${input.roomHint || "unknown"}`;

    const payload = {
      model: this.modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: input.imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1,
    };

    // On Groq failure, postChat throws! The pipeline catches it and marks asset 'failed' with error.
    // It will NEVER save fake observations with whole-photo boxes.
    const parsed = await this.postChat(payload);

    let rawObservations: any[] = [];
    if (Array.isArray(parsed.observations)) {
      rawObservations = parsed.observations.map((obs: any) => {
        let bbox: [number, number, number, number] = [0.1, 0.1, 0.4, 0.4];
        if (Array.isArray(obs.bbox) && obs.bbox.length === 4) {
          let [x1, y1, x2, y2] = obs.bbox.map(Number);
          // Normalize coordinates if model returned percentages (0..100) or pixel coordinates (>1)
          if (x1 > 1 || y1 > 1 || x2 > 1 || y2 > 1) {
            const maxVal = Math.max(x1, y1, x2, y2);
            const scale = maxVal > 100 ? 1000 : 100;
            x1 = Math.min(1, Math.max(0, x1 / scale));
            y1 = Math.min(1, Math.max(0, y1 / scale));
            x2 = Math.min(1, Math.max(0, x2 / scale));
            y2 = Math.min(1, Math.max(0, y2 / scale));
          } else {
            x1 = Math.min(1, Math.max(0, x1 || 0));
            y1 = Math.min(1, Math.max(0, y1 || 0));
            x2 = Math.min(1, Math.max(0, x2 || 0.4));
            y2 = Math.min(1, Math.max(0, y2 || 0.4));
          }
          bbox = [
            Number(x1.toFixed(3)),
            Number(y1.toFixed(3)),
            Number(x2.toFixed(3)),
            Number(y2.toFixed(3)),
          ];
        }
        return {
          category: obs.category || "other",
          sub_area: obs.sub_area || "general",
          description: sanitizeObservationText(obs.description || ""),
          confidence: typeof obs.confidence === "number" ? Math.min(1, Math.max(0, obs.confidence)) : 0.7,
          bbox,
        };
      });
    }

    const imageQuality = parsed.image_quality || "ok";
    // Apply hallucination filter (drops whole-photo boxes, empty claims, duplicates)
    const { kept } = filterObservations(rawObservations, imageQuality);

    return ImageAnalysisSchema.parse({
      room_guess: parsed.room_guess || (input.roomHint as any) || "unknown",
      image_quality: imageQuality,
      observations: kept,
    });
  }

  async compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
    tiled?: boolean;
  }): Promise<ComparisonResult> {
    const media = getMediaProvider();

    // Use matched transformation URLs so framing and exposure differences are equalized
    const priorMatched = media.matched(input.priorUrl);
    const currentMatched = media.matched(input.currentUrl);

    // If tiled mode is requested, run comparisons on 4 quadrants (2x2 grid)
    if (input.tiled) {
      return this.compareImagesTiled(input);
    }

    const prompt = `Compare these two matched condition photos of room "${input.room}".
Both photos have gone through identical Cloudinary smart-crop and auto-contrast normalisation:
Image 1: Baseline inspection (prior).
Image 2: Recent / move-out inspection (current).

SYSTEM RULES:
1. Provide an objective, assistive visual comparison only in neutral language.
2. NEVER make legal claims, fault assessments, tenant liability allegations, or cost estimates.
3. List visible variations observed in the current image that were NOT visible in the baseline.
4. Do NOT report "no change", "looks identical", or "consistent condition" as a change item. If no new variations are evident, return an empty changes array: [].
5. For each change, specify description and confidence (0.0 to 1.0).
6. Output JSON only:
{
  "summary": string,
  "changes": [
    {
      "description": string,
      "confidence": number,
      "region": "top-left" | "top-right" | "bottom-left" | "bottom-right" | "general"
    }
  ],
  "caveats": [string]
}`;

    const payload = {
      model: this.modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: priorMatched } },
            { type: "image_url", image_url: { url: currentMatched } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1,
    };

    const parsed = await this.postChat(payload);
    let rawChanges: any[] = [];
    if (Array.isArray(parsed.changes)) {
      rawChanges = parsed.changes.map((c: any) => ({
        description: sanitizeObservationText(c.description || ""),
        confidence: typeof c.confidence === "number" ? Math.min(1, Math.max(0, c.confidence)) : 0.75,
        region: c.region || "general",
      }));
    }

    const filteredChanges = filterComparisonChanges(rawChanges);

    return ComparisonResultSchema.parse({
      summary: parsed.summary || `Visual comparison completed for ${input.room}.`,
      changes: filteredChanges,
      caveats: Array.isArray(parsed.caveats) && parsed.caveats.length > 0
        ? parsed.caveats
        : [
            "Comparison highlights visible visual variations between captures.",
            "Assistive reference only; does not establish liability or condition classification.",
          ],
    });
  }

  /**
   * Tiled comparison: splits both photos into 2x2 matched tiles (top-left, top-right, bottom-left, bottom-right).
   */
  private async compareImagesTiled(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
  }): Promise<ComparisonResult> {
    const media = getMediaProvider();
    const tiles: TileSpec[] = [
      { col: 0, row: 0, grid: 2 },
      { col: 1, row: 0, grid: 2 },
      { col: 0, row: 1, grid: 2 },
      { col: 1, row: 1, grid: 2 },
    ];

    const allChanges: any[] = [];
    const caveats: string[] = [
      "Tile-by-tile Cloudinary matched crop analysis applied (4 quadrants).",
      "Assistive reference only; does not establish legal liability or repair cost.",
    ];

    for (const tile of tiles) {
      const region = tileLabel(tile);
      const priorTile = media.matchedTile(input.priorUrl, tile);
      const currentTile = media.matchedTile(input.currentUrl, tile);

      const prompt = `Compare these two matched quadrant tiles (${region}) of room "${input.room}".
Tile 1: Prior baseline.
Tile 2: Current inspection.
Highlight any visible variations appearing in Tile 2 not present in Tile 1.
If no differences exist, return empty changes: [].
Output JSON only:
{
  "changes": [{ "description": string, "confidence": number }]
}`;

      try {
        const parsed = await this.postChat({
          model: this.modelName,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: priorTile } },
                { type: "image_url", image_url: { url: currentTile } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 350,
          temperature: 0.1,
        });

        if (Array.isArray(parsed.changes)) {
          for (const c of parsed.changes) {
            allChanges.push({
              description: sanitizeObservationText(c.description || ""),
              confidence: typeof c.confidence === "number" ? Math.min(1, Math.max(0, c.confidence)) : 0.75,
              region,
            });
          }
        }
      } catch (err) {
        console.warn(`[GroqVision] Tiled comparison failed for quadrant ${region}:`, err);
      }
    }

    const filtered = filterComparisonChanges(allChanges);
    const summary = filtered.length > 0
      ? `Tiled comparison completed for ${input.room}: ${filtered.length} visual variation(s) observed across quadrants.`
      : `Tiled comparison completed for ${input.room}: No significant visual variations detected across quadrants.`;

    return ComparisonResultSchema.parse({
      summary,
      changes: filtered,
      caveats,
    });
  }

  async parseSearchQuery(q: string): Promise<SearchFilter> {
    const prompt = `Convert the user natural-language rental media query into a structured filter JSON.
Query: "${q}"
Return ONLY a valid JSON object with keys from this whitelist:
- room: "living_room"|"kitchen"|"bathroom"|"bedroom"|"exterior"
- inspection_type: "move_in"|"inspection"|"move_out"
- issue_category: "none"|"scratch"|"stain"|"crack"|"dent"|"mark"|"other"
- review_status: "pending"|"accepted"|"rejected"|"edited"
- date_from: "YYYY-MM-DD"
- date_to: "YYYY-MM-DD"
- free_text: string (max 50 chars)
Omit any keys not mentioned. JSON only, no markdown:`;

    try {
      const parsed = await this.postChat({
        model: this.modelName,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      });
      return SearchFilterSchema.parse(parsed);
    } catch {
      return new MockVisionProvider().parseSearchQuery(q);
    }
  }
}

// =========================================================================
// FACTORY
// =========================================================================

export function getVisionProvider(): VisionProvider {
  const isMockExplicit = process.env.VISION_PROVIDER === "mock";
  const groqKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;

  if (!isMockExplicit && groqKey) {
    const model = process.env.VISION_MODEL || "qwen/qwen3.8-27b";
    return new GroqVisionProvider(groqKey, model);
  }

  return new MockVisionProvider();
}

import {
  ImageAnalysis,
  ImageAnalysisSchema,
  ComparisonResult,
  ComparisonResultSchema,
  SearchFilter,
  SearchFilterSchema,
} from "./schemas";
import { sanitizeObservationText } from "./copy";

export interface VisionProvider {
  analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis>;
  compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
  }): Promise<ComparisonResult>;
  parseSearchQuery(q: string): Promise<SearchFilter>;
}

// =========================================================================
// MOCK VISION PROVIDER (Deterministic canned data for offline demo & tests)
// =========================================================================

export class MockVisionProvider implements VisionProvider {
  async analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis> {
    const { imageUrl, roomHint } = input;
    const lower = (imageUrl || "").toLowerCase();

    // Deterministic response based on room hint or URL signature
    if (lower.includes("kitchen") || roomHint === "kitchen") {
      return ImageAnalysisSchema.parse({
        room_guess: "kitchen",
        image_quality: "ok",
        observations: [
          {
            category: "scratch",
            sub_area: "lower_cabinet",
            description: sanitizeObservationText(
              "Possible scratch visible on lower cabinet door finish."
            ),
            confidence: 0.88,
            bbox: [0.15, 0.45, 0.38, 0.72],
          },
          {
            category: "dent",
            sub_area: "baseboard",
            description: sanitizeObservationText(
              "Minor indentation observed along floor baseboard edge."
            ),
            confidence: 0.72,
            bbox: [0.42, 0.82, 0.58, 0.94],
          },
        ],
      });
    }

    if (lower.includes("bathroom") || roomHint === "bathroom") {
      return ImageAnalysisSchema.parse({
        room_guess: "bathroom",
        image_quality: "ok",
        observations: [
          {
            category: "stain",
            sub_area: "grout_line",
            description: sanitizeObservationText(
              "Visible discoloration along shower wall tile grout line."
            ),
            confidence: 0.84,
            bbox: [0.28, 0.35, 0.52, 0.62],
          },
        ],
      });
    }

    if (lower.includes("bedroom") || roomHint === "bedroom") {
      return ImageAnalysisSchema.parse({
        room_guess: "bedroom",
        image_quality: "ok",
        observations: [
          {
            category: "mark",
            sub_area: "accent_wall",
            description: sanitizeObservationText(
              "Visible superficial scuff mark on drywall surface."
            ),
            confidence: 0.79,
            bbox: [0.60, 0.30, 0.75, 0.48],
          },
        ],
      });
    }

    if (lower.includes("blurry")) {
      return ImageAnalysisSchema.parse({
        room_guess: "unknown",
        image_quality: "blurry",
        observations: [],
      });
    }

    // Default living room / clean room fallback
    return ImageAnalysisSchema.parse({
      room_guess: (roomHint as any) || "living_room",
      image_quality: "ok",
      observations: [
        {
          category: "mark",
          sub_area: "baseboard_corner",
          description: sanitizeObservationText("Possible surface rub mark near entryway moulding."),
          confidence: 0.68,
          bbox: [0.10, 0.75, 0.25, 0.90],
        },
      ],
    });
  }

  async compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
  }): Promise<ComparisonResult> {
    return ComparisonResultSchema.parse({
      summary: `Visual comparison completed for ${input.room}. Two visual variations noted between capture dates.`,
      changes: [
        {
          description: sanitizeObservationText(
            "Visible superficial marking observed near lower baseboard that was not prominent in baseline capture."
          ),
          confidence: 0.82,
        },
        {
          description: sanitizeObservationText(
            "Lighting and camera angle variation detected between baseline and current inspection."
          ),
          confidence: 0.94,
        },
      ],
      caveats: [
        "Diff analysis is influenced by ambient lighting and angle variations.",
        "Assistive observation only; does not establish liability or condition classification.",
      ],
    });
  }

  async parseSearchQuery(q: string): Promise<SearchFilter> {
    const lower = q.toLowerCase();
    const filter: SearchFilter = {};

    // Extract room
    if (lower.includes("kitchen")) filter.room = "kitchen";
    else if (lower.includes("bathroom")) filter.room = "bathroom";
    else if (lower.includes("bedroom")) filter.room = "bedroom";
    else if (lower.includes("living")) filter.room = "living_room";
    else if (lower.includes("exterior")) filter.room = "exterior";

    // Extract inspection type
    if (lower.includes("move-in") || lower.includes("move in") || lower.includes("baseline")) {
      filter.inspection_type = "move_in";
    } else if (lower.includes("move-out") || lower.includes("move out")) {
      filter.inspection_type = "move_out";
    } else if (lower.includes("periodic") || lower.includes("inspection")) {
      filter.inspection_type = "inspection";
    }

    // Extract issue category
    if (lower.includes("scratch")) filter.issue_category = "scratch";
    else if (lower.includes("stain")) filter.issue_category = "stain";
    else if (lower.includes("crack")) filter.issue_category = "crack";
    else if (lower.includes("dent")) filter.issue_category = "dent";
    else if (lower.includes("mark")) filter.issue_category = "mark";

    // Extract review status
    if (lower.includes("pending")) filter.review_status = "pending";
    else if (lower.includes("accepted")) filter.review_status = "accepted";
    else if (lower.includes("rejected")) filter.review_status = "rejected";
    else if (lower.includes("edited")) filter.review_status = "edited";

    // Extract years if mentioned
    const yearMatch = lower.match(/\b(202[0-9])\b/);
    if (yearMatch) {
      filter.date_from = `${yearMatch[1]}-01-01`;
      filter.date_to = `${yearMatch[1]}-12-31`;
    }

    return SearchFilterSchema.parse(filter);
  }
}

// =========================================================================
// GEMINI VISION PROVIDER
// =========================================================================

export class GeminiVisionProvider implements VisionProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName = "gemini-1.5-flash") {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis> {
    const prompt = `
You are an assistive visual inspection assistant for rental property condition documentation.
SYSTEM RULES:
1. Use strictly neutral, descriptive language.
2. NEVER use blame, legal, intent, or monetary terms (e.g. do not say fault, damage, deposit, fee, tenant, landlord, vandalism, negligence).
3. Always prefix descriptions with "Possible", "Visible", "Observed", or "Noted".
4. If image is blurry, too dark, or not a room, set image_quality accordingly and return empty observations: [].
5. Normalized bbox format is [x1, y1, x2, y2] where 0 <= coord <= 1.
6. Return JSON only conforming to:
{
  "room_guess": "living_room"|"kitchen"|"bathroom"|"bedroom"|"exterior"|"unknown",
  "image_quality": "ok"|"blurry"|"too_dark"|"not_a_room",
  "observations": [
    {
      "category": "scratch"|"stain"|"crack"|"dent"|"mark"|"other",
      "sub_area": string,
      "description": string,
      "confidence": number,
      "bbox": [x1, y1, x2, y2]
    }
  ]
}
Room hint: ${input.roomHint || "unknown"}
Image URL: ${input.imageUrl}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini");

    const parsed = JSON.parse(rawText);
    // Sanitize any observation texts
    if (Array.isArray(parsed.observations)) {
      parsed.observations = parsed.observations.map((obs: any) => ({
        ...obs,
        description: sanitizeObservationText(obs.description || ""),
      }));
    }

    return ImageAnalysisSchema.parse(parsed);
  }

  async compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
  }): Promise<ComparisonResult> {
    const prompt = `
Compare the two condition images of room: ${input.room}.
SYSTEM RULES:
1. Assistive visual comparison only. Use neutral tone.
2. NO legal conclusions, blame, or cost estimates.
3. List visible variations between the prior image (${input.priorUrl}) and current image (${input.currentUrl}).
Format JSON:
{
  "summary": string,
  "changes": [{ "description": string, "confidence": number }],
  "caveats": [string]
}
`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    if (Array.isArray(parsed.changes)) {
      parsed.changes = parsed.changes.map((c: any) => ({
        ...c,
        description: sanitizeObservationText(c.description),
      }));
    }
    return ComparisonResultSchema.parse(parsed);
  }

  async parseSearchQuery(q: string): Promise<SearchFilter> {
    // Whitelisted LLM parsing
    const prompt = `
Convert the user natural-language rental media query into a structured filter JSON.
Query: "${q}"
Return ONLY keys from this whitelist:
- room: "living_room"|"kitchen"|"bathroom"|"bedroom"|"exterior"
- inspection_type: "move_in"|"inspection"|"move_out"
- issue_category: "none"|"scratch"|"stain"|"crack"|"dent"|"mark"|"other"
- review_status: "pending"|"accepted"|"rejected"|"edited"
- date_from: "YYYY-MM-DD"
- date_to: "YYYY-MM-DD"
- free_text: string (max 50 chars)
Omit any keys not explicitly mentioned. Return JSON only.
`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      // Fallback to mock parser if remote fails
      return new MockVisionProvider().parseSearchQuery(q);
    }
    const data = await response.json();
    const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    return SearchFilterSchema.parse(parsed);
  }
}

// =========================================================================
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

  async analyzeImage(input: { imageUrl: string; roomHint?: string }): Promise<ImageAnalysis> {
    const prompt = `You are an objective AI property inspection assistant. Inspect this rental property photo and output ONLY valid JSON matching this schema:
{
  "room_guess": "living_room" | "kitchen" | "bathroom" | "bedroom" | "exterior" | "unknown",
  "image_quality": "ok" | "blurry" | "too_dark" | "not_a_room",
  "observations": [
    {
      "category": "scratch" | "stain" | "crack" | "dent" | "mark" | "other",
      "sub_area": "string",
      "description": "neutral description of visible surface feature",
      "confidence": number between 0 and 1,
      "bbox": [x1, y1, x2, y2]
    }
  ]
}
RULES:
1. Provide a neutral, objective condition observation for the room.
2. NEVER use blame, fault, damage claims, tenant liability, or financial deduction language. Always prefix with "Possible", "Visible", "Observed", or "Noted".
3. Return ONLY valid JSON, no markdown formatting.`;

    try {
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
        max_tokens: 700,
        temperature: 0.1,
      };

      let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const errText = await response.text().catch(() => "");
        let waitMs = 6000;
        const match = errText.match(/try again in ([0-9.]+)s/i);
        if (match) {
          waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
        console.warn(`[VisionProvider] Groq rate limit (429) hit in analyzeImage. Waiting ${waitMs}ms before retry...`);
        await new Promise((r) => setTimeout(r, waitMs));
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[VisionProvider] Groq API error (${response.status}):`, errText);
        return ImageAnalysisSchema.parse({
          room_guess: (input.roomHint as any) || "unknown",
          image_quality: "ok",
          observations: [
            {
              category: "other",
              sub_area: "general",
              description: "AI analysis unavailable. Manual review required.",
              confidence: 0.5,
              bbox: [0, 0, 1, 1],
            },
          ],
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed.observations)) {
        parsed.observations = parsed.observations.map((obs: any) => {
          let bbox: [number, number, number, number] = [0.1, 0.1, 0.4, 0.4];
          if (Array.isArray(obs.bbox) && obs.bbox.length === 4) {
            let [x1, y1, x2, y2] = obs.bbox.map(Number);
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
            ...obs,
            bbox,
            description: sanitizeObservationText(obs.description || ""),
          };
        });
      }
      return ImageAnalysisSchema.parse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.stack || err.message : String(err);
      console.error("[VisionProvider] Vision analysis exception: " + msg);
      return ImageAnalysisSchema.parse({
        room_guess: (input.roomHint as any) || "unknown",
        image_quality: "ok",
        observations: [
          {
            category: "other",
            sub_area: "general",
            description: "AI analysis unavailable. Manual review required.",
            confidence: 0.5,
            bbox: [0, 0, 1, 1],
          },
        ],
      });
    }
  }

  async compareImages(input: {
    priorUrl: string;
    currentUrl: string;
    room: string;
  }): Promise<ComparisonResult> {
    const prompt = `Compare these two condition inspection photos of room: "${input.room}" (Prior Baseline vs Current Move-Out).
RULES:
1. Provide an objective, assistive visual comparison only. Use strictly neutral, descriptive language.
2. NEVER make legal accusations, fault, liability, monetary claims, or blame landlord/tenant.
3. Highlight visible differences observed or confirm consistency with baseline.
4. Output valid JSON only, conforming to:
{
  "summary": string,
  "changes": [{ "description": string, "confidence": number }],
  "caveats": [string]
}
Return ONLY valid JSON.`;

    try {
      const payload = {
        model: this.modelName,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: input.priorUrl } },
              { type: "image_url", image_url: { url: input.currentUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 700,
        temperature: 0.1,
      };

      let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const errText = await response.text().catch(() => "");
        let waitMs = 7000;
        const match = errText.match(/try again in ([0-9.]+)s/i);
        if (match) {
          waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
        console.warn(`[VisionProvider] Groq rate limit (429) hit in compareImages. Waiting ${waitMs}ms before retry...`);
        await new Promise((r) => setTimeout(r, waitMs));
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[VisionProvider] Groq compare error (${response.status}):`, errText);
        return ComparisonResultSchema.parse({
          summary: "Automated visual comparison unavailable. Manual inspection required.",
          changes: [],
          caveats: ["AI comparative analysis could not be completed at this time."],
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed.changes)) {
        parsed.changes = parsed.changes.map((c: any) => ({
          ...c,
          description: sanitizeObservationText(c.description),
        }));
      }
      return ComparisonResultSchema.parse(parsed);
    } catch (err) {
      console.error("[VisionProvider] Compare exception:", err);
      return ComparisonResultSchema.parse({
        summary: "Automated visual comparison unavailable. Manual inspection required.",
        changes: [],
        caveats: ["AI comparative analysis could not be completed at this time."],
      });
    }
  }

  async parseSearchQuery(q: string): Promise<SearchFilter> {
    const prompt = `
Convert the user natural-language rental media query into a structured filter JSON.
Query: "${q}"
Return ONLY a valid JSON object with keys from this whitelist:
- room: "living_room"|"kitchen"|"bathroom"|"bedroom"|"exterior"
- inspection_type: "move_in"|"inspection"|"move_out"
- issue_category: "none"|"scratch"|"stain"|"crack"|"dent"|"mark"|"other"
- review_status: "pending"|"accepted"|"rejected"|"edited"
- date_from: "YYYY-MM-DD"
- date_to: "YYYY-MM-DD"
- free_text: string (max 50 chars)
Omit any keys not mentioned. JSON only, no markdown:
`;
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
      });

      if (!response.ok) {
        return new MockVisionProvider().parseSearchQuery(q);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
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
  const provider = process.env.VISION_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "mock");
  const model = process.env.VISION_MODEL || "qwen/qwen3.8-27b";

  const groqKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  if ((provider === "groq" || groqKey) && groqKey) {
    return new GroqVisionProvider(groqKey, model.includes("qwen") ? model : "qwen/qwen3.8-27b");
  }

  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return new GeminiVisionProvider(process.env.GEMINI_API_KEY, model);
  }

  return new MockVisionProvider();
}

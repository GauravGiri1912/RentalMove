import { describe, it, expect } from "vitest";
import { certaintyOf } from "../src/lib/certainty";
import { HI, makeT, needsMachine } from "../src/lib/report-i18n";
import { validTranslation, sourceKey } from "../src/lib/translate";
import { deriveAssessments, deriveThreads, deriveTranslations, type PropertyEvent } from "../src/lib/events";
import { checkVoiceClip, voiceFolder } from "../src/lib/voice";

let n = 0;
const ev = (p: Partial<PropertyEvent>): PropertyEvent => ({
  id: `e${++n}`, property_id: "prop-1", type: "comment", resource_id: "ob-1", actor_id: "u", actor_name: "Alex", actor_role: "tenant", payload: {},
  created_at: new Date(2026, 0, 1, 0, n).toISOString(), ...p,
});
const PIXEL = "Visible change in this area since the previous inspection, found by pixel comparison. Not described by the vision model — check manually.";

describe("not-sure bucket", () => {
  it("flags findings with no pixel change, model doubt or very low confidence", () => {
    expect(certaintyOf({ confidence: 0.95 }, { extent: 0 }, false).reasons).toEqual(["No pixel change at this spot compared with move-in"]);
    expect(certaintyOf({ confidence: 0.95 }, { extent: 0.002 }, false).unsure).toBe(false);
    expect(certaintyOf({ confidence: 0.95 }, undefined, true).unsure).toBe(true);
    expect(certaintyOf({ confidence: 0.5 }, { extent: 0.002 }, false).unsure).toBe(true);
  });
  it("does not doubt pre-existing items for lacking new change, nor pixel-only changes", () => {
    expect(certaintyOf({ confidence: 0.9, pre_existing: true }, { extent: 0 }, false).unsure).toBe(false);
    const p = certaintyOf({ confidence: 0.55, description: PIXEL }, { extent: 0.0009 }, false);
    expect(p).toEqual({ unsure: false, pixel_only: true, reasons: [] });
  });
  it("replays photo assessments", () => {
    const a = deriveAssessments([ev({ type: "assessment", resource_id: "a1", payload: { can_assess: false, note: "Too dark", unsure: ["ob-2"] } })]);
    expect(a.a1).toMatchObject({ can_assess: false, note: "Too dark", unsure: ["ob-2"] });
  });
});

describe("Hindi report", () => {
  it("uses hand-written wording first, then cached machine text, else English", () => {
    const t = makeT("hi", { "Visible scratch on the door.": "दरवाज़े पर खरोंच दिखाई दे रही है।" });
    expect(t("Integrity appendix")).toBe(HI["Integrity appendix"]);
    expect(t("Visible scratch on the door.")).toMatch(/खरोंच/);
    expect(t("Untranslated text")).toBe("Untranslated text");
    expect(makeT("en")("Integrity appendix")).toBe("Integrity appendix");
    expect(needsMachine("hi", ["Integrity appendix", "New text", "New text", "", "12 cm"], {})).toEqual(["New text", "12 cm"]);
    expect(needsMachine("en", ["x"], {})).toEqual([]);
  });
  it("rejects mixed-script translations (the model once returned Arabic words)", () => {
    expect(validTranslation("hi", "दीवार की सतह पर गोल धूसर निशान")).toBe(true);
    expect(validTranslation("hi", "लंबाई ≈ 17 cm · Cloudinary")).toBe(true);
    expect(validTranslation("hi", "दीवार की सतह पर गोल رمادي निशान")).toBe(false);
    expect(validTranslation("hi", "सقف")).toBe(false);
    expect(validTranslation("hi", "Ceiling")).toBe(false);
  });
  it("caches by source text so an edited finding is re-translated", () => {
    const e = [ev({ type: "translation", resource_id: null, payload: { lang: "hi", entries: { [sourceKey("A")]: "क" } } }), ev({ type: "translation", resource_id: null, payload: { lang: "hi", entries: { [sourceKey("A")]: "ख" } } })];
    expect(deriveTranslations(e).hi[sourceKey("A")]).toBe("ख");
    expect(sourceKey("A")).not.toBe(sourceKey("A."));
  });
});

describe("voice notes", () => {
  it("keeps the clip on the thread comment", () => {
    const t = deriveThreads([ev({ payload: { text: "मैंने यह नहीं किया", voice: { url: "https://res.cloudinary.com/x/video/upload/v1/a.webm", duration: 6.2, lang: "hi-IN", transcribed: true } } })]);
    expect(t["ob-1"][0].voice).toEqual({ url: "https://res.cloudinary.com/x/video/upload/v1/a.webm", duration: 6.2, lang: "hi-IN", transcribed: true });
  });
  it("refuses a clip uploaded for another finding without calling Cloudinary", async () => {
    expect(voiceFolder("p1", "ob-1")).toBe("properties/p1/voice/ob-1");
    expect(await checkVoiceClip("p1", "ob-1", "properties/p1/voice/ob-2/x")).toEqual({ error: "Voice note was not uploaded for this finding." });
    expect(await checkVoiceClip("p1", "ob-1", "properties/p1/voice/ob-1-evil/x")).toHaveProperty("error");
  });
});

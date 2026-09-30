/**
 * report-i18n.ts — the evidence report in English or Hindi.
 *
 * Fixed report wording is translated by hand below, keyed by the English text so the page
 * reads naturally in code. Text that comes from the records (finding descriptions, notes,
 * room names, everyday-use context) is machine-translated once via /api/translate and cached
 * per property. The English report stays authoritative: signatures cover its English
 * content hash, and every translated report says so.
 */

export type ReportLang = "en" | "hi";
export const REPORT_LANGS: { id: ReportLang; label: string; html: string }[] = [
  { id: "en", label: "English", html: "en" },
  { id: "hi", label: "हिन्दी", html: "hi" },
];

export const HI: Record<string, string> = {
  "Condition evidence report": "स्थिति साक्ष्य रिपोर्ट",
  "generated": "तैयार की गई",
  "Baseline": "आधार निरीक्षण",
  "Compared with": "तुलना",
  "Human review": "मानवीय समीक्षा",
  "included": "शामिल",
  "rejected": "अस्वीकृत",
  "pending": "लंबित",
  "disputed": "विवादित",
  "Move-in": "मूव-इन (प्रवेश)",
  "Periodic": "आवधिक निरीक्षण",
  "Move-out": "मूव-आउट (निकास)",
  "changes recorded": "बदलाव दर्ज",
  "change recorded": "बदलाव दर्ज",
  "Not captured at move-in": "मूव-इन के समय फ़ोटो नहीं ली गई",
  "Not captured at this visit": "इस निरीक्षण में फ़ोटो नहीं ली गई",
  "Analysis pending — excluded": "विश्लेषण लंबित — शामिल नहीं",
  "Faces pixelated": "चेहरे धुंधले किए गए",
  "boxes drawn by Cloudinary": "निशान Cloudinary द्वारा बनाए गए",
  "Observation": "अवलोकन",
  "Location": "स्थान",
  "Tenant / owner": "किरायेदार / मालिक",
  "Review": "समीक्षा",
  "No reviewed changes since move-in.": "मूव-इन के बाद कोई समीक्षित बदलाव नहीं।",
  "Reviewer": "समीक्षक",
  "accepted": "स्वीकृत",
  "edited": "संपादित",
  "Not shown in this visit's photos": "इस निरीक्षण की फ़ोटो में नहीं दिखे",
  "Condition there is not recorded by this report.": "वहाँ की स्थिति इस रिपोर्ट में दर्ज नहीं है।",
  "Already there at move-in": "मूव-इन के समय पहले से मौजूद",
  "Everyday-use context": "सामान्य उपयोग का संदर्भ",
  "long": "लंबा",
  "affected": "प्रभावित क्षेत्र",
  "Repaired": "मरम्मत हो गई",
  "In progress": "मरम्मत जारी",
  "Requested": "मरम्मत का अनुरोध",
  "Repair requested": "मरम्मत का अनुरोध",
  "(photo-checked)": "(फ़ोटो से जाँचा गया)",
  "Repairs": "मरम्मत",
  "Work orders raised from findings. A repair photo is checked against the finding photo: same view, and whether the change is still detected at that spot.":
    "अवलोकनों से बनाए गए मरम्मत कार्य। मरम्मत की फ़ोटो को मूल फ़ोटो से मिलाया जाता है: क्या दृश्य वही है, और क्या उस जगह बदलाव अब भी दिखता है।",
  "Finding": "अवलोकन",
  "Status": "स्थिति",
  "Repair photo": "मरम्मत की फ़ोटो",
  "None yet": "अभी नहीं",
  "Change no longer detected at the spot": "उस जगह बदलाव अब नहीं दिखता",
  "Change still detected at the spot": "उस जगह बदलाव अब भी दिखता है",
  "Not verifiable from the photo": "फ़ोटो से पुष्टि नहीं हो सकी",
  "Integrity appendix": "प्रामाणिकता परिशिष्ट",
  "SHA-256 of each original file, and the capture time stored inside it (EXIF, read by Cloudinary) compared with the visit.":
    "हर मूल फ़ाइल का SHA-256, और फ़ाइल में दर्ज फ़ोटो लेने का समय (EXIF, Cloudinary द्वारा पढ़ा गया) निरीक्षण की तारीख़ से तुलना सहित।",
  "Drop any photo on": "किसी भी फ़ोटो को",
  "to confirm it is the one on record.": "पेज पर डालकर पुष्टि करें कि वह दर्ज फ़ोटो ही है।",
  "Verify": "सत्यापन",
  "file": "फ़ाइल",
  "inspection": "निरीक्षण",
  "time in file": "फ़ाइल में समय",
  "Sign-off": "हस्ताक्षर",
  "Each party signs the SHA-256 of this report's contents, computed on the server. If anything changes afterwards — a finding, a position, a photo — the signature no longer matches.":
    "दोनों पक्ष इस रिपोर्ट की सामग्री के SHA-256 पर हस्ताक्षर करते हैं, जो सर्वर पर गणना किया जाता है। बाद में कुछ भी बदले — कोई अवलोकन, कोई राय, कोई फ़ोटो — तो हस्ताक्षर मेल नहीं खाएगा।",
  "Tenant": "किरायेदार",
  "Owner": "मालिक",
  "Matches current report": "वर्तमान रिपोर्ट से मेल खाता है",
  "Report changed after signing — re-sign needed": "हस्ताक्षर के बाद रिपोर्ट बदली — दोबारा हस्ताक्षर ज़रूरी",
  "Not signed yet": "अभी हस्ताक्षर नहीं हुए",
  "Re-sign": "दोबारा हस्ताक्षर करें",
  "Sign as you": "अपने नाम से हस्ताक्षर करें",
  "Withdraw": "वापस लें",
  "Observations are produced by an assistive vision model, located with pixel comparison, and confirmed by a person. This report describes visible condition only; it makes no finding about cause, responsibility or cost.":
    "अवलोकन एक सहायक विज़न मॉडल द्वारा बनाए जाते हैं, पिक्सेल तुलना से उनकी जगह तय होती है, और एक व्यक्ति उनकी पुष्टि करता है। यह रिपोर्ट केवल दिखाई देने वाली स्थिति बताती है; यह कारण, ज़िम्मेदारी या लागत के बारे में कोई निष्कर्ष नहीं देती।",
  "Requested by": "अनुरोधकर्ता",
  "Guidance about everyday use only — not a finding of cause or responsibility.": "केवल सामान्य उपयोग के बारे में जानकारी — कारण या ज़िम्मेदारी का निष्कर्ष नहीं।",
  "Scratch": "खरोंच",
  "Stain": "दाग",
  "Crack": "दरार",
  "Dent / chip": "गड्ढा / टूट-फूट",
  "Mark / scuff": "निशान / घिसाव",
  "Other": "अन्य",
  "Finish review": "समीक्षा पूरी करें",
  "still pending and not included.": "अभी लंबित हैं और शामिल नहीं किए गए।",
  "to include them.": "ताकि वे शामिल हो सकें।",
  "findings": "अवलोकन",
  "No capture time in file": "फ़ाइल में फ़ोटो का समय नहीं",
  // Checklist and room vocabulary (fixed, so never sent to the model)
  "Ceiling": "छत",
  "Walls": "दीवारें",
  "Floor": "फ़र्श",
  "Window & frame": "खिड़की और चौखट",
  "Door": "दरवाज़ा",
  "Cabinets": "कैबिनेट",
  "Worktop": "किचन स्लैब",
  "Hob & oven": "चूल्हा और ओवन",
  "Sink": "सिंक",
  "Shower or bath": "शॉवर या बाथटब",
  "Tiles & grout": "टाइलें और ग्राउट",
  "Toilet": "शौचालय",
  "Kitchen": "रसोई",
  "Bathroom": "बाथरूम",
  "Bedroom": "शयनकक्ष",
  "Living Room": "बैठक",
  "Living room": "बैठक",
  "Machine translation. The English report is authoritative, and signatures cover its English content.":
    "यह मशीन अनुवाद है। अंग्रेज़ी रिपोर्ट ही प्रामाणिक है, और हस्ताक्षर उसकी अंग्रेज़ी सामग्री पर होते हैं।",
  "Translating…": "अनुवाद हो रहा है…",
};

/** A translator: hand-written wording first, then cached machine translations, else English. */
export function makeT(lang: ReportLang, machine: Record<string, string> = {}) {
  return (s: string): string => (lang === "en" || !s ? s : HI[s] ?? machine[s] ?? s);
}

/** Record-derived strings that still need machine translation (not in the hand-written set). */
export function needsMachine(lang: ReportLang, texts: (string | null | undefined)[], have: Record<string, string>): string[] {
  if (lang === "en") return [];
  return [...new Set(texts.filter((t): t is string => !!t && /[a-z]/i.test(t) && !HI[t] && !have[t]))];
}

export function fmtDateL(iso: string, lang: ReportLang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", opts);
}

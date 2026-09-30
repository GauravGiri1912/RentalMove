/**
 * RentalMove Centralized Copy & Legal/AI Disclaimers
 * 
 * Hard Rule: AI outputs are assistive observations using neutral language.
 * Never assign blame, intent, legal responsibility, or monetary amounts.
 * Original media is never modified by the app; views are on-demand transformations.
 */

export const APP_COPY = {
  name: "RentalMove",
  tagline: "Capture once. Find instantly. Compare over time.",
  subTagline: "Visual timeline, AI-assisted observations, and verifiable condition reports for rental properties.",
  
  // Neutral AI Disclaimers & Notices
  ai: {
    badge: "AI Observation",
    reviewRequired: "Review required",
    disclaimerBanner: 
      "AI observations are automated, assistive visual notes. They do not constitute structural inspections, damage determinations, legal liability, or financial assessments.",
    lowConfidenceNotice: 
      "Low confidence observation detected. Manual human verification is advised.",
    noObservationsFound: 
      "No visible changes or surface irregularities detected in this capture.",
    originalPreservedBadge: 
      "Original Kept (SHA-256 recorded)",
    originalPreservedTooltip: 
      "A SHA-256 fingerprint of the original file is recorded at upload so later changes to it can be detected. The app never modifies the original; every view is a Cloudinary transformation rendered on demand.",
    comparisonDisclaimer: 
      "Comparison highlights visible visual variations between captures. It is not an assessment of fault, wear-and-tear legality, or repair costs.",
    statusLabels: {
      pending: "Pending Review",
      accepted: "Confirmed Observation",
      rejected: "Dismissed Observation",
      edited: "Human Modified Observation",
    },
    qualityWarnings: {
      blurry: "Image appears blurry. Consider re-capturing for better clarity.",
      too_dark: "Low lighting detected. Some surface details may be obscured.",
      not_a_room: "Capture does not appear to show an interior room area.",
      ok: "Image clarity is suitable for visual timeline archive.",
    },
  },

  // Role Switcher Copy
  roles: {
    tenant: {
      label: "Tenant Mode",
      description: "Document move-in baseline, periodic inspections, and keep timestamped condition records.",
    },
    manager: {
      label: "Property Manager Mode",
      description: "Review condition observations, audit room changes over time, and generate tokenized inspection reports.",
    },
  },

  // Consent & Terms
  consent: {
    uploadNotice: 
      "By uploading photographs, you consent to store these visual records for rental condition documentation. Images are timestamped, hashed, and preserved securely.",
  },

  // Footer & Attribution
  footer: {
    poweredBy: "Media powered by Cloudinary",
  },
};

/**
 * Words that imply blame, intent, liability, or monetary assessment.
 * These are strictly prohibited in assistive AI observations.
 */
export const BLAME_WORDS = [
  "fault",
  "negligent",
  "negligence",
  "deposit",
  "charge",
  "cost",
  "fee",
  "liable",
  "liability",
  "fraud",
  "blame",
  "responsible",
  "responsibility",
  "vandalism",
  "tenant's fault",
  "landlord's fault",
  "damage penalty",
  "deduct",
  "deduction",
];

/**
 * Post-filter function to sanitize AI observation text.
 * Replaces or cleanses any phrase containing blame, legal conclusions, or cost words.
 */
export function sanitizeObservationText(text: string): string {
  if (!text) return "";
  let sanitized = text;

  for (const word of BLAME_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, "[visual irregularity]");
    }
  }

  // Ensure prefix tone matches neutral standard if not already neutral
  const lower = sanitized.toLowerCase();
  if (
    !lower.startsWith("possible") &&
    !lower.startsWith("visible") &&
    !lower.startsWith("noted") &&
    !lower.startsWith("observed")
  ) {
    sanitized = `Visible: ${sanitized}`;
  }

  return sanitized;
}

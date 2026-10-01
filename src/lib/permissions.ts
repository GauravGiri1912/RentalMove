/**
 * permissions.ts — Central Capability-Driven Permission Engine for RentalMove.
 *
 * Defines all granular capabilities across Owner, Tenant, and Public actors,
 * eliminating fragmented `user.role === "owner"` checks across the UI and API.
 */

export type Capability =
  | "property:view"
  | "property:create"
  | "room:view"
  | "room:create"
  | "inspection:view"
  | "inspection:create"
  | "capture:use"
  | "finding:view"
  | "finding:triage"
  | "finding:edit"
  | "finding:stance"
  | "finding:comment"
  | "finding:voice"
  | "repair:view"
  | "repair:create"
  | "repair:status"
  | "repair:proof"
  | "report:view"
  | "report:sign"
  | "report:share"
  | "report:revoke-own"
  | "report:revoke-any"
  | "relet:access"
  | "media:transform"
  | "media:generative";

export type Role = "owner" | "tenant";

export interface UserLike {
  id?: string;
  role?: string | null;
  [key: string]: any;
}

/**
 * Authoritative capability map per role.
 * Derived directly from the ROLE_PERMISSION_AUDIT specification.
 */
const ROLE_CAPABILITIES: Record<Role, Record<Capability, boolean>> = {
  owner: {
    "property:view": true,
    "property:create": true,
    "room:view": true,
    "room:create": true,
    "inspection:view": true,
    "inspection:create": true,
    "capture:use": true,
    "finding:view": true,
    "finding:triage": true,
    "finding:edit": true,
    "finding:stance": true,
    "finding:comment": true,
    "finding:voice": true,
    "repair:view": true,
    "repair:create": true,
    "repair:status": true,
    "repair:proof": true,
    "report:view": true,
    "report:sign": true,
    "report:share": true,
    "report:revoke-own": true,
    "report:revoke-any": true,
    "relet:access": true,
    "media:transform": true,
    "media:generative": true,
  },
  tenant: {
    "property:view": true,
    "property:create": false,
    "room:view": true,
    "room:create": false,
    "inspection:view": true,
    "inspection:create": true,
    "capture:use": true,
    "finding:view": true,
    "finding:triage": false, // Strict Owner Triage (Accept/Reject)
    "finding:edit": false,   // Strict Owner Triage (Edit official finding)
    "finding:stance": true,  // Bilateral Agree/Dispute position
    "finding:comment": true, // Discussion participation
    "finding:voice": true,   // Audio evidence clip
    "repair:view": true,     // Tenant views repair schedule
    "repair:create": false,  // Strict Owner work order creation
    "repair:status": false,  // Strict Owner work order status progression
    "repair:proof": true,    // Tenant can upload photo proof of completed repair
    "report:view": true,     // Tenant views condition evidence report
    "report:sign": true,     // Tenant executes bilateral cryptographic sign-off
    "report:share": true,    // Tenant can generate watermarked dispute share links
    "report:revoke-own": true, // Tenant can revoke links they created
    "report:revoke-any": false, // Only owner can revoke any property link
    "relet:access": false,   // Strict Owner marketing tools
    "media:transform": true, // Non-generative media lab adjustments
    "media:generative": false, // Generative AI listing photos are Owner only
  },
};

const NO_CAPABILITIES: Record<Capability, boolean> = {
  "property:view": false,
  "property:create": false,
  "room:view": false,
  "room:create": false,
  "inspection:view": false,
  "inspection:create": false,
  "capture:use": false,
  "finding:view": false,
  "finding:triage": false,
  "finding:edit": false,
  "finding:stance": false,
  "finding:comment": false,
  "finding:voice": false,
  "repair:view": false,
  "repair:create": false,
  "repair:status": false,
  "repair:proof": false,
  "report:view": false,
  "report:sign": false,
  "report:share": false,
  "report:revoke-own": false,
  "report:revoke-any": false,
  "relet:access": false,
  "media:transform": false,
  "media:generative": false,
};

/**
 * Checks whether a given user possesses a specific capability.
 * Returns false if user is anonymous or null.
 */
export function can(user: UserLike | null | undefined, capability: Capability): boolean {
  if (!user || !user.role) return false;
  const role = user.role.toLowerCase() as Role;
  const roleMap = ROLE_CAPABILITIES[role];
  if (!roleMap) return false;
  return roleMap[capability] ?? false;
}

/**
 * Returns a full dictionary of all capabilities for a user.
 */
export function capabilitiesFor(user: UserLike | null | undefined): Record<Capability, boolean> {
  if (!user || !user.role) return { ...NO_CAPABILITIES };
  const role = user.role.toLowerCase() as Role;
  const roleMap = ROLE_CAPABILITIES[role];
  if (!roleMap) return { ...NO_CAPABILITIES };
  return { ...roleMap };
}

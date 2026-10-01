/**
 * authorization.ts — Server-side capability & resource authorization engine.
 *
 * Enforces two-tier authorization:
 * Tier 1: Does the user possess the requested capability? (can(user, capability))
 * Tier 2: Does the user have legitimate access to the underlying resource/property? (canUserAccessProperty)
 */

import { can, type Capability } from "./permissions";
import { canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "./auth";
import type { User } from "./schemas";
import { NextResponse } from "next/server";

export interface AuthorizationResult {
  authorized: boolean;
  allowed: boolean;
  statusCode?: number;
  reason?: string;
  response?: NextResponse;
}

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

/**
 * Evaluates whether a user can perform an action with a specific capability
 * scoped to an optional propertyId or resource.
 */
export async function authorize({
  user,
  capability,
  propertyId,
  resource,
}: {
  user: User | null | undefined;
  capability: Capability;
  propertyId?: string | null;
  resource?: { type: string; id?: string; propertyId?: string | null };
}): Promise<AuthorizationResult> {
  const effectivePropertyId = propertyId ?? resource?.propertyId;

  // 1. Authentication check
  if (!user || !user.id) {
    logAuthorizationEvent({
      actor_id: undefined,
      actor_role: undefined,
      capability,
      resource_id: resource?.id ?? effectivePropertyId ?? undefined,
      action: "authorize",
      result: "denied",
    });
    return {
      authorized: false,
      allowed: false,
      statusCode: 401,
      reason: "Authentication required.",
      response: unauthorizedResponse("Authentication required. Please log in."),
    };
  }

  // 2. Capability check (Role possession)
  if (!can(user, capability)) {
    const reason = `Role '${user.role}' lacks capability '${capability}'.`;
    logAuthorizationEvent({
      actor_id: user.id,
      actor_role: user.role,
      capability,
      resource_id: resource?.id ?? effectivePropertyId ?? undefined,
      action: "authorize",
      result: "denied",
    });
    return {
      authorized: false,
      allowed: false,
      statusCode: 403,
      reason,
      response: forbiddenResponse(reason),
    };
  }

  // 3. Resource / Property boundary check (Tenant/Owner property tenancy)
  if (effectivePropertyId) {
    const hasAccess = await canUserAccessProperty(user, effectivePropertyId);
    if (!hasAccess) {
      const reason = `User does not have access to property '${effectivePropertyId}'.`;
      logAuthorizationEvent({
        actor_id: user.id,
        actor_role: user.role,
        capability,
        resource_id: resource?.id ?? effectivePropertyId ?? undefined,
        action: "authorize",
        result: "denied",
      });
      return {
        authorized: false,
        allowed: false,
        statusCode: 403,
        reason,
        response: forbiddenResponse("You do not have access to this property."),
      };
    }
  }

  logAuthorizationEvent({
    actor_id: user.id,
    actor_role: user.role,
    capability,
    resource_id: resource?.id ?? effectivePropertyId ?? undefined,
    action: "authorize",
    result: "allowed",
  });
  return { authorized: true, allowed: true };
}

/**
 * Asserts authorization; throws an AuthorizationError if denied.
 */
export async function requireCapability(
  user: User | null | undefined,
  capability: Capability,
  propertyId?: string | null
): Promise<void> {
  const result = await authorize({ user, capability, propertyId });
  if (!result.authorized) {
    throw new AuthorizationError(result.reason || "Forbidden", result.statusCode || 403);
  }
}

/**
 * Logs authorization audit events for observability and debugging.
 */
export function logAuthorizationEvent({
  actor_id,
  actor_role,
  capability,
  resource_id,
  action,
  result,
}: {
  actor_id?: string;
  actor_role?: string;
  capability: Capability;
  resource_id?: string;
  action: string;
  result: "allowed" | "denied";
}) {
  if (process.env.NODE_ENV !== "test") {
    console.log(
      `[Authz] actor=${actor_id || "anon"} role=${actor_role || "none"} cap=${capability} action=${action} res=${resource_id || "global"} result=${result}`
    );
  }
}

"use client";

import { useMemo } from "react";
import { useStudio } from "@/components/providers";
import { can, capabilitiesFor, type Capability } from "@/lib/permissions";

/**
 * usePermissions — Declarative React hook for UI capability checks.
 *
 * Usage:
 * ```tsx
 * const { can } = usePermissions();
 * if (can("finding:triage")) { ... }
 * ```
 */
export function usePermissions() {
  const { user } = useStudio();

  return useMemo(() => {
    return {
      user,
      can: (capability: Capability) => can(user, capability),
      capabilities: capabilitiesFor(user),
      isOwner: user?.role === "owner",
      isTenant: user?.role === "tenant",
    };
  }, [user]);
}

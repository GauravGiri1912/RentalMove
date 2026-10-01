import { describe, it, expect } from "vitest";
import { can, capabilitiesFor, type UserLike } from "@/lib/permissions";
import { authorize, requireCapability, AuthorizationError } from "@/lib/authorization";
import type { User } from "@/lib/schemas";

describe("Layer A: Capability & Permission Engine", () => {
  const ownerUser: UserLike = {
    id: "user-owner-1",
    role: "owner",
    name: "Sarah Jenkins",
  };

  const tenantUser: UserLike = {
    id: "user-tenant-1",
    role: "tenant",
    name: "Alex Chen",
  };

  const anonUser: UserLike = {
    id: "",
    role: null,
  };

  describe("1. Finding Capabilities", () => {
    it("owner has triage authority (accept/reject/edit)", () => {
      expect(can(ownerUser, "finding:view")).toBe(true);
      expect(can(ownerUser, "finding:triage")).toBe(true);
      expect(can(ownerUser, "finding:edit")).toBe(true);
      expect(can(ownerUser, "finding:stance")).toBe(true);
      expect(can(ownerUser, "finding:comment")).toBe(true);
      expect(can(ownerUser, "finding:voice")).toBe(true);
    });

    it("tenant has view, stance, comment, voice, but NOT triage/edit", () => {
      expect(can(tenantUser, "finding:view")).toBe(true);
      expect(can(tenantUser, "finding:triage")).toBe(false);
      expect(can(tenantUser, "finding:edit")).toBe(false);
      expect(can(tenantUser, "finding:stance")).toBe(true);
      expect(can(tenantUser, "finding:comment")).toBe(true);
      expect(can(tenantUser, "finding:voice")).toBe(true);
    });
  });

  describe("2. Repair Work Order Capabilities", () => {
    it("owner can create, assign, and advance repair status", () => {
      expect(can(ownerUser, "repair:view")).toBe(true);
      expect(can(ownerUser, "repair:create")).toBe(true);
      expect(can(ownerUser, "repair:status")).toBe(true);
      expect(can(ownerUser, "repair:proof")).toBe(true);
    });

    it("tenant can view repairs and upload proof, but NOT create or advance status", () => {
      expect(can(tenantUser, "repair:view")).toBe(true);
      expect(can(tenantUser, "repair:create")).toBe(false);
      expect(can(tenantUser, "repair:status")).toBe(false);
      expect(can(tenantUser, "repair:proof")).toBe(true);
    });
  });

  describe("3. Property & Room Capabilities", () => {
    it("owner can create properties and rooms", () => {
      expect(can(ownerUser, "property:create")).toBe(true);
      expect(can(ownerUser, "room:create")).toBe(true);
    });

    it("tenant cannot create properties or rooms", () => {
      expect(can(tenantUser, "property:create")).toBe(false);
      expect(can(tenantUser, "room:create")).toBe(false);
    });
  });

  describe("4. Re-let & Media Capabilities", () => {
    it("owner has access to re-let studio and generative AI", () => {
      expect(can(ownerUser, "relet:access")).toBe(true);
      expect(can(ownerUser, "media:generative")).toBe(true);
      expect(can(ownerUser, "media:transform")).toBe(true);
    });

    it("tenant is denied re-let studio and generative AI, but has media transform", () => {
      expect(can(tenantUser, "relet:access")).toBe(false);
      expect(can(tenantUser, "media:generative")).toBe(false);
      expect(can(tenantUser, "media:transform")).toBe(true);
    });
  });

  describe("5. Report & Share Capabilities", () => {
    it("both owner and tenant can view, sign, and create share links", () => {
      expect(can(ownerUser, "report:view")).toBe(true);
      expect(can(tenantUser, "report:view")).toBe(true);
      expect(can(ownerUser, "report:sign")).toBe(true);
      expect(can(tenantUser, "report:sign")).toBe(true);
      expect(can(ownerUser, "report:share")).toBe(true);
      expect(can(tenantUser, "report:share")).toBe(true);
      expect(can(ownerUser, "report:revoke-own")).toBe(true);
      expect(can(tenantUser, "report:revoke-own")).toBe(true);
    });

    it("only owner can revoke any share link", () => {
      expect(can(ownerUser, "report:revoke-any")).toBe(true);
      expect(can(tenantUser, "report:revoke-any")).toBe(false);
    });
  });

  describe("6. Anonymous / Unauthenticated Safety", () => {
    it("denies all capabilities for null, undefined, or empty user", () => {
      expect(can(null, "finding:view")).toBe(false);
      expect(can(undefined, "property:view")).toBe(false);
      expect(can(anonUser, "finding:triage")).toBe(false);
      const caps = capabilitiesFor(null);
      expect(Object.values(caps).every((v) => v === false)).toBe(true);
    });
  });

  describe("7. Server-Side Resource Scoped Authorization", () => {
    const fullTenant: User = {
      id: "t-1",
      name: "Tenant One",
      email: "t1@example.com",
      role: "tenant",
      assigned_property_id: "prop-381",
      owned_properties: [],
      created_at: new Date().toISOString(),
    };

    const fullOwner: User = {
      id: "o-1",
      name: "Owner One",
      email: "o1@example.com",
      role: "owner",
      assigned_property_id: undefined,
      owned_properties: ["prop-381"],
      created_at: new Date().toISOString(),
    };

    it("authorizes tenant for finding:stance on assigned property", async () => {
      const res = await authorize({
        user: fullTenant,
        capability: "finding:stance",
        propertyId: "prop-381",
      });
      expect(res.authorized).toBe(true);
    });

    it("denies tenant for finding:triage even on assigned property", async () => {
      const res = await authorize({
        user: fullTenant,
        capability: "finding:triage",
        propertyId: "prop-381",
      });
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    it("denies owner for finding:triage on unowned property (IDOR protection)", async () => {
      const res = await authorize({
        user: fullOwner,
        capability: "finding:triage",
        propertyId: "prop-other",
      });
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    it("requireCapability throws AuthorizationError when unauthorized", async () => {
      await expect(
        requireCapability(fullTenant, "finding:triage", "prop-381")
      ).rejects.toThrow(AuthorizationError);
    });

    it("requireCapability resolves cleanly when authorized", async () => {
      await expect(
        requireCapability(fullOwner, "finding:triage", "prop-381")
      ).resolves.toBeUndefined();
    });
  });
});

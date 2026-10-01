import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDatabase } from "../src/lib/db";
import { canUserAccessProperty } from "../src/lib/auth";
import type { User } from "../src/lib/schemas";
import { PATCH } from "../src/app/api/observations/[id]/route";
import * as authModule from "../src/lib/auth";

describe("Phase 1: Critical Authorization & IDOR Protection", () => {
  const db = getDatabase();

  it("1. canUserAccessProperty enforces strict tenant & owner boundaries with no prop-381 fallback", async () => {
    const assignedTenant: User = {
      id: "t-assigned",
      name: "Assigned Tenant",
      email: "assigned@example.com",
      role: "tenant",
      assigned_property_id: "prop-381",
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };

    const unassignedTenant: User = {
      id: "t-unassigned",
      name: "Unassigned Tenant",
      email: "unassigned@example.com",
      role: "tenant",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };

    const ownerA: User = {
      id: "o-a",
      name: "Owner A",
      email: "ownerA@example.com",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: ["prop-381"],
    };

    const ownerB: User = {
      id: "o-b",
      name: "Owner B",
      email: "ownerB@example.com",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: ["prop-other"],
    };

    const emptyOwner: User = {
      id: "o-empty",
      name: "Empty Owner",
      email: "empty@example.com",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };

    // Tenant access
    expect(await canUserAccessProperty(assignedTenant, "prop-381")).toBe(true);
    expect(await canUserAccessProperty(assignedTenant, "prop-other")).toBe(false);
    expect(await canUserAccessProperty(unassignedTenant, "prop-381")).toBe(false);
    expect(await canUserAccessProperty(unassignedTenant, "prop-other")).toBe(false);

    // Owner access
    expect(await canUserAccessProperty(ownerA, "prop-381")).toBe(true);
    expect(await canUserAccessProperty(ownerA, "prop-other")).toBe(false);
    expect(await canUserAccessProperty(ownerB, "prop-381")).toBe(false);
    expect(await canUserAccessProperty(ownerB, "prop-other")).toBe(true);
    expect(await canUserAccessProperty(emptyOwner, "prop-381")).toBe(false);
  });

  it("2. listProperties returns empty array for unassigned tenant or property-less owner", async () => {
    // Register unassigned tenant in DB
    const unassignedUser: User = {
      id: "user-unassigned-tenant-99",
      name: "No Property Tenant",
      email: "no.prop@rentalmove.demo",
      role: "tenant",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };
    (db as any).memoryCache.users.push(unassignedUser);

    const propsForTenant = await db.listProperties(unassignedUser.id, "tenant");
    expect(propsForTenant).toEqual([]);

    const emptyOwnerUser: User = {
      id: "user-empty-owner-99",
      name: "No Property Owner",
      email: "no.props.owner@rentalmove.demo",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };
    (db as any).memoryCache.users.push(emptyOwnerUser);

    const propsForOwner = await db.listProperties(emptyOwnerUser.id, "owner");
    expect(propsForOwner).toEqual([]);
  });

  it("3. PATCH /api/observations/[id] strictly rejects tenant with 403 Forbidden", async () => {
    const tenantUser: User = {
      id: "user-tenant-1",
      name: "Alex Chen",
      email: "alex.tenant@rentalmove.demo",
      role: "tenant",
      assigned_property_id: "prop-381",
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: [],
    };

    const spy = vi.spyOn(authModule, "getAuthenticatedUserOrThrow").mockResolvedValue(tenantUser);

    try {
      const req = new NextRequest("http://localhost:3000/api/observations/obs-01", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: "accepted" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "obs-01" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden");
      expect(json.message).toContain("Only property owners can review or edit findings");
    } finally {
      spy.mockRestore();
    }
  });

  it("4. PATCH /api/observations/[id] rejects owner who does not own the property with 403 Forbidden", async () => {
    const otherOwner: User = {
      id: "other-owner-403",
      name: "Other Owner",
      email: "other@example.com",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: ["prop-unrelated-999"],
    };

    const spy = vi.spyOn(authModule, "getAuthenticatedUserOrThrow").mockResolvedValue(otherOwner);

    try {
      const req = new NextRequest("http://localhost:3000/api/observations/obs-01", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: "accepted" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "obs-01" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden");
      expect(json.message).toContain("You do not have access to this finding");
    } finally {
      spy.mockRestore();
    }
  });

  it("5. PATCH /api/observations/[id] succeeds for the authorized property owner", async () => {
    const authorizedOwner: User = {
      id: "user-owner-1",
      name: "Sarah Jenkins",
      email: "sarah.owner@rentalmove.demo",
      role: "owner",
      assigned_property_id: undefined,
      created_at: "2024-01-01T00:00:00Z",
      owned_properties: ["prop-381"],
    };

    const spy = vi.spyOn(authModule, "getAuthenticatedUserOrThrow").mockResolvedValue(authorizedOwner);

    try {
      const req = new NextRequest("http://localhost:3000/api/observations/obs-01", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: "accepted",
          reviewer_note: "Verified by authorized owner in Phase 1 test",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "obs-01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.review_status).toBe("accepted");
      expect(json.reviewed_by).toBe("user-owner-1");
      expect(json.reviewer_note).toBe("Verified by authorized owner in Phase 1 test");
    } finally {
      spy.mockRestore();
    }
  });
});

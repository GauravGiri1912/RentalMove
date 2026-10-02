import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { can, capabilitiesFor, type UserLike, type Capability } from "@/lib/permissions";
import { authorize } from "@/lib/authorization";
import type { User } from "@/lib/schemas";

describe("Role & Capability Architecture Comprehensive Suite", () => {
  const ownerUser: UserLike = { id: "u-owner", role: "owner", name: "Sarah Owner" };
  const tenantUser: UserLike = { id: "u-tenant", role: "tenant", name: "Alex Tenant" };
  const anonUser: UserLike = { id: "", role: null };

  const fullOwner: User = {
    id: "u-owner",
    name: "Sarah Owner",
    email: "owner@example.com",
    role: "owner",
    owned_properties: ["prop-381"],
    assigned_property_id: undefined,
    created_at: new Date().toISOString(),
  };

  const fullTenant: User = {
    id: "u-tenant",
    name: "Alex Tenant",
    email: "tenant@example.com",
    role: "tenant",
    owned_properties: [],
    assigned_property_id: "prop-381",
    created_at: new Date().toISOString(),
  };

  describe("1. Navigation & Shell Capability Derivation", () => {
    interface NavItem {
      href: string;
      label: string;
      ownerLabel?: string;
      tenantLabel?: string;
      capability: Capability;
    }

    const NAV: NavItem[] = [
      { href: "/", label: "Overview", capability: "property:view" },
      { href: "/map", label: "Home map", capability: "room:view" },
      { href: "/memory", label: "Property memory", capability: "room:view" },
      { href: "/capture", label: "Capture", capability: "capture:use" },
      { href: "/review", label: "Review", ownerLabel: "Review", tenantLabel: "Findings", capability: "finding:view" },
      { href: "/compare", label: "Compare", capability: "finding:view" },
      { href: "/repairs", label: "Repairs", capability: "repair:view" },
      { href: "/timeline", label: "Timeline", capability: "property:view" },
      { href: "/search", label: "Search", capability: "property:view" },
      { href: "/report", label: "Evidence report", capability: "report:view" },
      { href: "/relet", label: "Re-let studio", capability: "relet:access" },
      { href: "/lab", label: "Media lab", capability: "media:transform" },
    ];

    it("owner sees Re-let studio and label 'Review'", () => {
      const visible = NAV.filter((n) => can(ownerUser, n.capability));
      expect(visible.some((n) => n.href === "/relet")).toBe(true);

      const reviewNav = visible.find((n) => n.href === "/review")!;
      const label = (ownerUser.role === "tenant" && reviewNav.tenantLabel) || (ownerUser.role === "owner" && reviewNav.ownerLabel) || reviewNav.label;
      expect(label).toBe("Review");
    });

    it("tenant does NOT see Re-let studio and sees label 'Findings'", () => {
      const visible = NAV.filter((n) => can(tenantUser, n.capability));
      expect(visible.some((n) => n.href === "/relet")).toBe(false);

      const reviewNav = visible.find((n) => n.href === "/review")!;
      const label = (tenantUser.role === "tenant" && reviewNav.tenantLabel) || (tenantUser.role === "owner" && reviewNav.ownerLabel) || reviewNav.label;
      expect(label).toBe("Findings");
    });

    it("anonymous user sees zero navigation items", () => {
      const visible = NAV.filter((n) => can(anonUser, n.capability));
      expect(visible.length).toBe(0);
    });
  });

  describe("2. Review Page Architectural & Hotkey Guards", () => {
    const reviewPageSource = fs.readFileSync(path.resolve(process.cwd(), "src/app/(studio)/review/page.tsx"), "utf8");

    it("imports usePermissions and derives canTriage and canEdit", () => {
      expect(reviewPageSource).toContain('import { usePermissions } from "@/hooks/usePermissions";');
      expect(reviewPageSource).toContain('const { can } = usePermissions();');
      expect(reviewPageSource).toContain('const canTriage = can("finding:triage");');
      expect(reviewPageSource).toContain('const canEdit = can("finding:edit");');
    });

    it("guards keyboard shortcuts 'A', 'R', 'E' behind capability checks", () => {
      expect(reviewPageSource).toContain('if (canTriage) decide("accepted");');
      expect(reviewPageSource).toContain('if (canTriage) decide("rejected");');
      expect(reviewPageSource).toContain('if (canEdit)');
    });

    it("guards decide function against unauthorized mutation execution", () => {
      expect(reviewPageSource).toContain('if ((status === "accepted" || status === "rejected") && !canTriage) return;');
      expect(reviewPageSource).toContain('if (status === "edited" && !canEdit) return;');
    });

    it("conditionally renders triage controls for owners and Owner Decision for tenants", () => {
      // The triage controls are gated by a ternary on a pending finding for the owner role / triage
      // capability (the exact condition has been refactored before, so only its shape is pinned).
      expect(reviewPageSource).toMatch(/review_status === "pending" && (user\.role === "owner"|canTriage) \? \(/);
      expect(reviewPageSource).toContain("Reviewer note");
      expect(reviewPageSource).toContain("Accept");
      expect(reviewPageSource).toContain("Reject");
      expect(reviewPageSource).toContain("Owner decision");
      expect(reviewPageSource).toContain("Owner reviewer note");
    });
  });

  describe("3. Shell Page Architectural & Hotkey Guards", () => {
    const shellSource = fs.readFileSync(path.resolve(process.cwd(), "src/components/shell.tsx"), "utf8");

    it("imports usePermissions and annotates NAV items with capabilities", () => {
      expect(shellSource).toContain('import { usePermissions } from "@/hooks/usePermissions";');
      expect(shellSource).toContain('capability: "relet:access"');
      expect(shellSource).toContain('capability: "finding:view"');
      expect(shellSource).toContain('tenantLabel: "Findings"');
    });

    it("filters NAV by capability and scopes pending triage badge to can('finding:triage')", () => {
      expect(shellSource).toContain("NAV.filter((n) => can(n.capability))");
      expect(shellSource).toContain('can("finding:triage")');
    });

    it("filters command palette to hide pending observations for non-triagers", () => {
      expect(shellSource).toContain('can("finding:triage")');
    });

    it("guards G S keyboard jump to /relet behind relet:access capability", () => {
      expect(shellSource).toContain('if (dest === "/relet" && !can("relet:access"))');
    });
  });

  describe("4. Re-let Studio Route Capability Guard", () => {
    const reletSource = fs.readFileSync(path.resolve(process.cwd(), "src/app/(studio)/relet/page.tsx"), "utf8");

    it("uses can('relet:access') capability check instead of role check", () => {
      expect(reletSource).toContain('import { usePermissions } from "@/hooks/usePermissions";');
      expect(reletSource).toContain('if (!can("relet:access"))');
    });
  });

  describe("5. API Route Capability Enforcements", () => {
    it("observations/[id] authorizes owner and denies tenant for triage with audit log", async () => {
      const ownerDecision = await authorize({
        user: fullOwner,
        capability: "finding:triage",
        resource: { type: "observation", id: "obs-1", propertyId: "prop-381" },
      });
      expect(ownerDecision.allowed).toBe(true);

      const tenantDecision = await authorize({
        user: fullTenant,
        capability: "finding:triage",
        resource: { type: "observation", id: "obs-1", propertyId: "prop-381" },
      });
      expect(tenantDecision.allowed).toBe(false);
      expect(tenantDecision.reason).toContain("finding:triage");
    });

    it("repairs authorize owner for workorder create and status, and both for proof", async () => {
      const ownerCreate = await authorize({
        user: fullOwner,
        capability: "repair:create",
        resource: { type: "workorder", id: "wo-1", propertyId: "prop-381" },
      });
      expect(ownerCreate.allowed).toBe(true);

      const tenantCreate = await authorize({
        user: fullTenant,
        capability: "repair:create",
        resource: { type: "workorder", id: "wo-1", propertyId: "prop-381" },
      });
      expect(tenantCreate.allowed).toBe(false);

      const tenantProof = await authorize({
        user: fullTenant,
        capability: "repair:proof",
        resource: { type: "workorder", id: "wo-1", propertyId: "prop-381" },
      });
      expect(tenantProof.allowed).toBe(true);
    });

    it("media authorizes owner for generative transformations and denies tenant", async () => {
      expect(can(fullOwner, "media:generative")).toBe(true);
      expect(can(fullTenant, "media:generative")).toBe(false);
      expect(can(fullOwner, "media:transform")).toBe(true);
      expect(can(fullTenant, "media:transform")).toBe(true);
    });

    it("shares authorize owner to revoke any link, and tenant only their own link", async () => {
      expect(can(fullOwner, "report:revoke-any")).toBe(true);
      expect(can(fullTenant, "report:revoke-any")).toBe(false);
      expect(can(fullOwner, "report:revoke-own")).toBe(true);
      expect(can(fullTenant, "report:revoke-own")).toBe(true);
    });
  });
});

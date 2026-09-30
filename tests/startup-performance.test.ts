import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getServerSessionUser } from "../src/lib/auth";

describe("Phase 7: Startup Performance & Waterfall Elimination", () => {
  const providersContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/providers.tsx"), "utf8");
  const layoutContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
  const studioPageContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/(studio)/page.tsx"), "utf8");
  const uiContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/ui.tsx"), "utf8");

  it("1. getServerSessionUser is exported from auth.ts for Server Component execution", () => {
    expect(typeof getServerSessionUser).toBe("function");
  });

  it("2. providers.tsx exports InitialStudioData and skips client waterfall when pre-hydrated", () => {
    expect(providersContent).toContain("export interface InitialStudioData");
    expect(providersContent).toContain("initialData?: InitialStudioData");
    // Initial state initialized from initialData
    expect(providersContent).toContain('if (initialData?.snapshot && initialData?.sessionUser && initialData?.propertyId) return "ready";');
    // Effect skips the sequential client waterfall if pre-hydrated
    expect(providersContent).toContain("if (initialData?.snapshot && initialData?.sessionUser && initialData?.propertyId) {");
  });

  it("3. RootLayout is an async Server Component pre-fetching session and snapshot", () => {
    expect(layoutContent).toContain("export default async function RootLayout");
    expect(layoutContent).toContain("getServerSessionUser()");
    expect(layoutContent).toContain("buildSnapshot(pid, user)");
    expect(layoutContent).toContain("<StudioProvider initialData={initialData}>");
  });

  it("4. Hero image features priority loading and visibility-aware pause", () => {
    // ui.tsx Photo component supports priority & loading
    expect(uiContent).toContain("priority?: boolean");
    expect(uiContent).toContain("loading?: \"lazy\" | \"eager\"");
    expect(uiContent).toContain("fetchPriority={priority ? \"high\" : \"auto\"}");

    // studio page uses IntersectionObserver on heroRef
    expect(studioPageContent).toContain("const heroRef = useRef<HTMLDivElement>(null)");
    expect(studioPageContent).toContain("new IntersectionObserver");
    expect(studioPageContent).toContain("if (document.hidden) return;");
    expect(studioPageContent).toContain("prefers-reduced-motion: reduce");
    expect(studioPageContent).toContain("priority={i === hero}");
  });
});

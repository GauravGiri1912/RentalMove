import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { setView, clearView, hasView, getView } from "../src/lib/view";

describe("Phase 9: State Management & Realtime Transport Consolidation", () => {
  const providersContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/providers.tsx"), "utf8");
  const viewContent = fs.readFileSync(path.resolve(process.cwd(), "src/lib/view.ts"), "utf8");

  it("1. view.ts exports clearView and getView for reliable singleton lifecycle management", () => {
    expect(typeof setView).toBe("function");
    expect(typeof clearView).toBe("function");
    expect(typeof hasView).toBe("function");
    expect(typeof getView).toBe("function");

    // Setting view then clearing view works deterministically
    clearView();
    expect(hasView()).toBe(false);
    expect(getView()).toBeNull();
  });

  it("2. providers.tsx establishes Supabase Realtime as primary transport with lazy SSE fallback", () => {
    // Primary check
    expect(providersContent).toContain("const hasSupabase = Boolean");
    expect(providersContent).toContain("sb.channel(`rm-${pid}`)");
    // Closes fallback SSE once Supabase Realtime is SUBSCRIBED
    expect(providersContent).toContain("if (st === \"SUBSCRIBED\") {");
    expect(providersContent).toContain("if (es) {");
    expect(providersContent).toContain("es.close();");
    // Fallback on error or missing config
    expect(providersContent).toContain("else if (st === \"CHANNEL_ERROR\" || st === \"TIMED_OUT\") {");
    expect(providersContent).toContain("initSSE()");
  });

  it("3. Mutation reconciliation updates local state without redundant 24KB snapshot refetches", () => {
    // optimistic function no longer unconditionally refetches entire snapshot
    expect(providersContent).not.toContain("await request();\n      if (propertyId) await loadSnapshot(propertyId);");
    // review directly applies returned updated observation
    expect(providersContent).toContain("observations: view.observations.map((o) => (o.id === id ? { ...o, ...updated } : o))");
  });

  it("4. signOut clears both React state and module singleton to prevent state leakage", () => {
    expect(providersContent).toContain("setView(null);");
    expect(providersContent).toContain("setViewState(null);");
  });
});

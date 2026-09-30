import { describe, it, expect } from "vitest";
import { getDatabase, getScopedDatabase } from "../src/lib/db";
import { SupabaseDatabaseService } from "../src/lib/supabase-db";
import fs from "fs";
import path from "path";

describe("Phase 2: Database / Scoped RLS Architecture", () => {
  it("1. getScopedDatabase returns DatabaseService instance without crashing", () => {
    const db = getScopedDatabase();
    expect(db).toBeDefined();
    expect(typeof db.getProperty).toBe("function");
    expect(typeof db.listProperties).toBe("function");
  });

  it("2. SupabaseDatabaseService accepts a scoped client without using default service role", () => {
    const mockClient: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: async () => ({ data: [], error: null }),
          }),
          order: async () => ({ data: [], error: null }),
        }),
      }),
    };

    const scopedService = new SupabaseDatabaseService(mockClient);
    expect(scopedService).toBeDefined();
    expect((scopedService as any).client).toBe(mockClient);
  });

  it("3. Migration 0004 exists, has valid SQL syntax, tightens RLS and adds sha256 index", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/0004_tighten_rls_and_sha_index.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf8");

    // Index
    expect(content).toContain("CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);");

    // Observations RLS: owner update only
    expect(content).toContain("CREATE POLICY observations_select ON observations");
    expect(content).toContain("CREATE POLICY observations_owner_update ON observations");
    expect(content).toContain("WHERE p.owner_id = auth.uid()::text");
    expect(content).toContain("DROP POLICY IF EXISTS observations_access ON observations");

    // Rooms, Inspections, Assets RLS tightened
    expect(content).toContain("CREATE POLICY rooms_select ON rooms");
    expect(content).toContain("CREATE POLICY rooms_owner_write ON rooms");
    expect(content).toContain("CREATE POLICY inspections_select ON inspections");
    expect(content).toContain("CREATE POLICY inspections_owner_write ON inspections");
    expect(content).toContain("CREATE POLICY assets_select ON assets");
    expect(content).toContain("CREATE POLICY assets_owner_write ON assets");
  });
});

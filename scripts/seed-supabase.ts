import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function seedSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    console.error("Missing Supabase URL or Service Role Key");
    process.exit(1);
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const storePath = path.join(process.cwd(), "data", "rentalmove-store.json");
  if (!fs.existsSync(storePath)) {
    console.error("Store file not found:", storePath);
    process.exit(1);
  }

  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  console.log("Seeding Supabase from rentalmove-store.json...");

  // 1. Users
  console.log(`- Inserting ${store.users.length} users...`);
  for (const user of store.users) {
    const { error } = await client.from("users").upsert({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at || new Date().toISOString(),
    });
    if (error) console.error("Error inserting user:", user.id, error.message);
  }

  // 2. Properties
  console.log(`- Inserting ${store.properties.length} properties...`);
  const validPropertyIds = new Set<string>();
  for (const prop of store.properties) {
    if (!prop.id || !prop.address_label) continue;
    const { error } = await client.from("properties").upsert({
      id: prop.id,
      owner_id: prop.owner_id || "user-owner-1",
      address_label: prop.address_label,
      unit_label: prop.unit_label || "",
      created_at: prop.created_at || new Date().toISOString(),
    });
    if (error) {
      console.error("Error inserting property:", prop.id, error.message);
    } else {
      validPropertyIds.add(prop.id);
    }
  }

  // 3. Property Tenants
  console.log("- Linking property_tenants...");
  const { error: ptErr } = await client.from("property_tenants").upsert({
    id: "assign-381-tenant-1",
    property_id: "prop-381",
    tenant_id: "user-tenant-1",
    created_at: new Date().toISOString(),
  });
  if (ptErr) console.error("Error inserting property_tenants:", ptErr.message);

  // 4. Rooms
  console.log(`- Inserting ${store.rooms.length} rooms...`);
  const validRoomIds = new Set<string>();
  for (const room of store.rooms) {
    if (!validPropertyIds.has(room.property_id)) continue;
    const validCategories = ['living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'unknown'];
    const category = validCategories.includes(room.category) ? room.category : 'unknown';
    const { error } = await client.from("rooms").upsert({
      id: room.id,
      property_id: room.property_id,
      name: room.name,
      category,
      created_at: room.created_at || new Date().toISOString(),
    });
    if (error) {
      console.error("Error inserting room:", room.id, error.message);
    } else {
      validRoomIds.add(room.id);
    }
  }

  // 5. Inspections
  console.log(`- Inserting ${store.inspections.length} inspections...`);
  const validInspectionIds = new Set<string>();
  for (const insp of store.inspections) {
    if (!validPropertyIds.has(insp.property_id)) continue;
    const { error } = await client.from("inspections").upsert({
      id: insp.id,
      property_id: insp.property_id,
      type: insp.type,
      captured_at: insp.captured_at,
      status: insp.status || "completed",
      created_by: "user-tenant-1",
      created_at: insp.created_at || new Date().toISOString(),
    });
    if (error) {
      console.error("Error inserting inspection:", insp.id, error.message);
    } else {
      validInspectionIds.add(insp.id);
    }
  }

  // 6. Assets
  console.log(`- Inserting ${store.assets.length} assets...`);
  const validAssetIds = new Set<string>();
  for (const asset of store.assets) {
    if (!validInspectionIds.has(asset.inspection_id)) continue;
    if (!validRoomIds.has(asset.room_id)) continue;

    const { error } = await client.from("assets").upsert({
      id: asset.id,
      inspection_id: asset.inspection_id,
      room_id: asset.room_id,
      cloudinary_public_id: asset.cloudinary_public_id,
      secure_url: asset.secure_url,
      resource_type: asset.resource_type || "image",
      format: asset.format || "jpg",
      width: asset.width || null,
      height: asset.height || null,
      bytes: asset.bytes || null,
      etag: asset.etag || null,
      sha256: asset.sha256 || null,
      captured_at: asset.captured_at,
      analysis_status: asset.analysis_status || "done",
      analysis_error: asset.analysis_error || null,
      room_guess: asset.room_guess || null,
      image_quality: asset.image_quality || "ok",
      created_at: asset.created_at || new Date().toISOString(),
    });
    if (error) {
      console.error("Error inserting asset:", asset.id, error.message);
    } else {
      validAssetIds.add(asset.id);
    }
  }

  // 7. Observations
  console.log(`- Inserting ${store.observations.length} observations...`);
  for (const obs of store.observations) {
    if (!validAssetIds.has(obs.asset_id)) continue;

    const validCategories = ['scratch', 'stain', 'crack', 'dent', 'mark', 'other'];
    const category = validCategories.includes(obs.category) ? obs.category : 'other';
    const { error } = await client.from("observations").upsert({
      id: obs.id,
      asset_id: obs.asset_id,
      category,
      sub_area: obs.sub_area || "general",
      description: obs.description,
      confidence: obs.confidence || 0.85,
      bbox: obs.bbox || [0, 0, 1, 1],
      review_status: obs.review_status || "accepted",
      reviewer_note: obs.reviewer_note || null,
      source: obs.source || "ai",
      edited_from: obs.edited_from || null,
      created_at: obs.created_at || new Date().toISOString(),
      updated_at: obs.updated_at || new Date().toISOString(),
    });
    if (error) console.error("Error inserting observation:", obs.id, error.message);
  }

  // 8. Comparisons
  if (store.comparisons && store.comparisons.length > 0) {
    console.log(`- Inserting ${store.comparisons.length} comparisons...`);
    for (const comp of store.comparisons) {
      if (!validPropertyIds.has(comp.property_id)) continue;
      if (!validAssetIds.has(comp.prior_asset_id) || !validAssetIds.has(comp.current_asset_id)) continue;
      const { error } = await client.from("comparisons").upsert({
        id: comp.id,
        property_id: comp.property_id,
        room_id: comp.room_id,
        prior_asset_id: comp.prior_asset_id,
        current_asset_id: comp.current_asset_id,
        summary: comp.summary,
        changes: comp.changes || [],
        caveats: comp.caveats || [],
        confidence: comp.confidence || null,
        review_required: comp.review_required ?? true,
        model_version: comp.model_version || "groq/qwen/qwen3.8-27b",
        created_at: comp.created_at || new Date().toISOString(),
      });
      if (error) console.error("Error inserting comparison:", comp.id, error.message);
    }
  }

  // 9. Share links
  if (store.share_links && store.share_links.length > 0) {
    console.log(`- Inserting ${store.share_links.length} share links...`);
    for (const sl of store.share_links) {
      if (typeof sl.token !== "string" || !sl.token) continue;
      const propId = typeof sl.property_id === "string" ? sl.property_id : "prop-381";
      if (!validPropertyIds.has(propId)) continue;

      const inspId = (typeof sl.inspection_id === "string" && validInspectionIds.has(sl.inspection_id)) ? sl.inspection_id : null;
      const tokenHash = crypto.createHash("sha256").update(sl.token).digest("hex");
      const { error } = await client.from("share_links").upsert({
        id: `share-${sl.token}`,
        property_id: propId,
        inspection_id: inspId,
        token: sl.token,
        token_hash: tokenHash,
        expires_at: sl.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revoked_at: sl.revoked_at || null,
        created_at: sl.created_at || new Date().toISOString(),
      });
      if (error) console.error("Error inserting share link:", sl.token, error.message);
    }
  }

  console.log("Seeding to Supabase finished successfully!");
}

seedSupabase().catch((err) => {
  console.error("Seeding execution failed:", err);
  process.exit(1);
});

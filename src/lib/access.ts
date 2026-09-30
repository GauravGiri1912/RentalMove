/**
 * access.ts — resolve which property a resource belongs to, scoped to the user.
 *
 * Only properties the user can already access are searched, so a resource outside
 * them resolves to null (→ 403) instead of leaking whether it exists.
 */

import { getDatabase } from "./db";
import { canUserAccessProperty } from "./auth";
import type { Asset, Observation, User } from "./schemas";

async function accessiblePropertyIds(user: User): Promise<string[]> {
  const db = getDatabase();
  const props = await db.listProperties(user.id, user.role);
  const ids: string[] = [];
  for (const p of props) if (await canUserAccessProperty(user, p.id)) ids.push(p.id);
  return ids;
}

export async function propertyForInspection(user: User, inspectionId: string): Promise<string | null> {
  const db = getDatabase();
  for (const pid of await accessiblePropertyIds(user)) {
    const insps = await db.getInspections(pid);
    if (insps.some((i) => i.id === inspectionId)) return pid;
  }
  return null;
}

export async function assetWithProperty(user: User, assetId: string): Promise<{ asset: Asset; propertyId: string } | null> {
  const asset = await getDatabase().getAssetById(assetId);
  if (!asset) return null;
  const propertyId = await propertyForInspection(user, asset.inspection_id);
  return propertyId ? { asset, propertyId } : null;
}

/** Finds an observation among the user's properties. */
export async function observationWithProperty(
  user: User,
  observationId: string
): Promise<{ observation: Observation; asset: Asset; propertyId: string } | null> {
  const db = getDatabase();
  for (const pid of await accessiblePropertyIds(user)) {
    const insps = await db.getInspections(pid);
    const assets = await db.getAssetsForInspections(insps.map((i) => i.id));
    const obs = (await db.getObservationsForAssets(assets.map((a) => a.id))).find((o) => o.id === observationId);
    if (obs) return { observation: obs, asset: assets.find((a) => a.id === obs.asset_id)!, propertyId: pid };
  }
  return null;
}

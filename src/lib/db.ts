import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  Property,
  Room,
  Inspection,
  Asset,
  Observation,
  Comparison,
  AnalysisStatus,
  ReviewStatus,
} from "./schemas";

export interface DatabaseService {
  getProperty(id: string): Promise<Property | null>;
  listProperties(): Promise<Property[]>;
  getRooms(propertyId: string): Promise<Room[]>;
  getInspections(propertyId: string): Promise<Inspection[]>;
  createInspection(data: Omit<Inspection, "id" | "created_at">): Promise<Inspection>;
  getAssets(inspectionId?: string, roomId?: string): Promise<Asset[]>;
  getAssetById(id: string): Promise<Asset | null>;
  getAssetByPublicId(publicId: string): Promise<Asset | null>;
  upsertAsset(data: Omit<Asset, "id" | "created_at"> & { id?: string }): Promise<Asset>;
  updateAssetStatus(
    id: string,
    status: AnalysisStatus,
    error?: string | null,
    roomGuess?: any,
    imageQuality?: any
  ): Promise<void>;
  getObservations(assetId: string): Promise<Observation[]>;
  createObservation(
    data: Omit<Observation, "id" | "created_at" | "updated_at">
  ): Promise<Observation>;
  updateObservation(
    id: string,
    update: {
      review_status: ReviewStatus;
      reviewer_note?: string;
      category?: any;
      description?: string;
      sub_area?: string;
    }
  ): Promise<Observation | null>;
  getTimeline(propertyId: string): Promise<{
    property: Property;
    inspections: Array<
      Inspection & {
        assets: Array<Asset & { room: Room; observations: Observation[] }>;
      }
    >;
  }>;
  createComparison(data: Omit<Comparison, "id" | "created_at">): Promise<Comparison>;
  getShareLink(token: string): Promise<{ property_id: string; expires_at: string } | null>;
  createShareLink(propertyId: string, token: string): Promise<void>;
}

// =========================================================================
// IN-MEMORY / MOCK DATABASE (Offline-first, seeded with Property #381)
// =========================================================================

class MockDatabaseService implements DatabaseService {
  private properties: Property[] = [
    {
      id: "prop-381",
      address_label: "381 Elmwood Ave",
      unit_label: "Apt 4B",
      created_at: "2024-01-01T00:00:00Z",
    },
  ];

  private rooms: Room[] = [
    { id: "room-living", property_id: "prop-381", name: "Living Room", category: "living_room" },
    { id: "room-kitchen", property_id: "prop-381", name: "Kitchen", category: "kitchen" },
    { id: "room-bathroom", property_id: "prop-381", name: "Bathroom", category: "bathroom" },
    { id: "room-bedroom", property_id: "prop-381", name: "Master Bedroom", category: "bedroom" },
  ];

  private inspections: Inspection[] = [
    {
      id: "insp-2024-move-in",
      property_id: "prop-381",
      type: "move_in",
      captured_at: "2024-06-01T10:00:00Z",
      status: "completed",
      created_at: "2024-06-01T10:00:00Z",
    },
    {
      id: "insp-2025-periodic",
      property_id: "prop-381",
      type: "inspection",
      captured_at: "2025-06-01T11:00:00Z",
      status: "completed",
      created_at: "2025-06-01T11:00:00Z",
    },
    {
      id: "insp-2026-move-out",
      property_id: "prop-381",
      type: "move_out",
      captured_at: "2026-06-01T09:30:00Z",
      status: "completed",
      created_at: "2026-06-01T09:30:00Z",
    },
  ];

  private assets: Asset[] = [
    {
      id: "asset-01",
      inspection_id: "insp-2024-move-in",
      room_id: "room-kitchen",
      cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01",
      secure_url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
      etag: "etag_k_2024_01",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      width: 1920,
      height: 1080,
      captured_at: "2024-06-01T10:00:00Z",
      analysis_status: "done",
      analysis_error: null,
      room_guess: "kitchen",
      image_quality: "ok",
      created_at: "2024-06-01T10:00:00Z",
    },
    {
      id: "asset-02",
      inspection_id: "insp-2024-move-in",
      room_id: "room-bathroom",
      cloudinary_public_id: "properties/prop-381/insp-2024-move-in/bathroom/shower-tile-01",
      secure_url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      etag: "etag_b_2024_02",
      sha256: "fa42e77b0dfca06746813bfa7e5ecab7a74070a2b0058b86e090df4a7fa19728",
      width: 1920,
      height: 1080,
      captured_at: "2024-06-01T10:15:00Z",
      analysis_status: "done",
      analysis_error: null,
      room_guess: "bathroom",
      image_quality: "ok",
      created_at: "2024-06-01T10:15:00Z",
    },
    {
      id: "asset-03",
      inspection_id: "insp-2025-periodic",
      room_id: "room-kitchen",
      cloudinary_public_id: "properties/prop-381/insp-2025-periodic/kitchen/cabinet-base-02",
      secure_url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
      etag: "etag_k_2025_03",
      sha256: "721a37c040608faecfcb6507c6f0923f6ee5caee3c36c641fcf81ec01ab870c5",
      width: 1920,
      height: 1080,
      captured_at: "2025-06-01T11:00:00Z",
      analysis_status: "done",
      analysis_error: null,
      room_guess: "kitchen",
      image_quality: "ok",
      created_at: "2025-06-01T11:00:00Z",
    },
  ];

  private observations: Observation[] = [
    {
      id: "obs-01",
      asset_id: "asset-01",
      category: "scratch",
      sub_area: "lower_cabinet",
      description: "Possible scratch visible on lower cabinet door surface.",
      confidence: 0.88,
      bbox: [0.15, 0.45, 0.38, 0.72],
      review_status: "accepted",
      reviewer_note: "Confirmed during move-in walkthrough.",
      source: "ai",
      edited_from: null,
      created_at: "2024-06-01T10:02:00Z",
      updated_at: "2024-06-01T10:05:00Z",
    },
    {
      id: "obs-02",
      asset_id: "asset-02",
      category: "stain",
      sub_area: "shower_wall",
      description: "Visible discoloration along shower wall tile grout line.",
      confidence: 0.84,
      bbox: [0.28, 0.35, 0.52, 0.62],
      review_status: "accepted",
      reviewer_note: "Existing grout variation noted.",
      source: "ai",
      edited_from: null,
      created_at: "2024-06-01T10:17:00Z",
      updated_at: "2024-06-01T10:20:00Z",
    },
    {
      id: "obs-03",
      asset_id: "asset-03",
      category: "scratch",
      sub_area: "lower_cabinet",
      description: "Existing cabinet mark reviewed, consistent with baseline move-in capture.",
      confidence: 0.89,
      bbox: [0.16, 0.46, 0.39, 0.73],
      review_status: "accepted",
      reviewer_note: "Baseline scratch verified unchanged.",
      source: "ai",
      edited_from: null,
      created_at: "2025-06-01T11:02:00Z",
      updated_at: "2025-06-01T11:05:00Z",
    },
  ];

  private comparisons: Comparison[] = [];
  private shareLinks: Map<string, { property_id: string; expires_at: string }> = new Map();

  async getProperty(id: string): Promise<Property | null> {
    return this.properties.find((p) => p.id === id) || null;
  }

  async listProperties(): Promise<Property[]> {
    return [...this.properties];
  }

  async getRooms(propertyId: string): Promise<Room[]> {
    return this.rooms.filter((r) => r.property_id === propertyId);
  }

  async getInspections(propertyId: string): Promise<Inspection[]> {
    return this.inspections
      .filter((i) => i.property_id === propertyId)
      .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
  }

  async createInspection(data: Omit<Inspection, "id" | "created_at">): Promise<Inspection> {
    const newInsp: Inspection = {
      id: `insp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.inspections.push(newInsp);
    return newInsp;
  }

  async getAssets(inspectionId?: string, roomId?: string): Promise<Asset[]> {
    return this.assets.filter((a) => {
      if (inspectionId && a.inspection_id !== inspectionId) return false;
      if (roomId && a.room_id !== roomId) return false;
      return true;
    });
  }

  async getAssetById(id: string): Promise<Asset | null> {
    return this.assets.find((a) => a.id === id) || null;
  }

  async getAssetByPublicId(publicId: string): Promise<Asset | null> {
    return this.assets.find((a) => a.cloudinary_public_id === publicId) || null;
  }

  async upsertAsset(data: Omit<Asset, "id" | "created_at"> & { id?: string }): Promise<Asset> {
    const existing = this.assets.find(
      (a) => a.cloudinary_public_id === data.cloudinary_public_id
    );

    if (existing) {
      Object.assign(existing, data);
      return existing;
    }

    const newAsset: Asset = {
      id: data.id || `asset-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.assets.push(newAsset);
    return newAsset;
  }

  async updateAssetStatus(
    id: string,
    status: AnalysisStatus,
    error?: string | null,
    roomGuess?: any,
    imageQuality?: any
  ): Promise<void> {
    const asset = this.assets.find((a) => a.id === id);
    if (asset) {
      asset.analysis_status = status;
      if (error !== undefined) asset.analysis_error = error;
      if (roomGuess !== undefined) asset.room_guess = roomGuess;
      if (imageQuality !== undefined) asset.image_quality = imageQuality;
    }
  }

  async getObservations(assetId: string): Promise<Observation[]> {
    return this.observations.filter((o) => o.asset_id === assetId);
  }

  async createObservation(
    data: Omit<Observation, "id" | "created_at" | "updated_at">
  ): Promise<Observation> {
    const newObs: Observation = {
      id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
    };
    this.observations.push(newObs);
    return newObs;
  }

  async updateObservation(
    id: string,
    update: {
      review_status: ReviewStatus;
      reviewer_note?: string;
      category?: any;
      description?: string;
      sub_area?: string;
    }
  ): Promise<Observation | null> {
    const obs = this.observations.find((o) => o.id === id);
    if (!obs) return null;

    if (update.category || update.description || update.sub_area) {
      obs.edited_from = {
        category: obs.category,
        description: obs.description,
        sub_area: obs.sub_area,
      };
      if (update.category) obs.category = update.category;
      if (update.description) obs.description = update.description;
      if (update.sub_area) obs.sub_area = update.sub_area;
    }

    obs.review_status = update.review_status;
    if (update.reviewer_note !== undefined) obs.reviewer_note = update.reviewer_note;
    obs.updated_at = new Date().toISOString();
    return obs;
  }

  async getTimeline(propertyId: string) {
    const property = await this.getProperty(propertyId);
    if (!property) throw new Error("Property not found");

    const inspections = await this.getInspections(propertyId);
    const rooms = await this.getRooms(propertyId);

    const detailedInspections = await Promise.all(
      inspections.map(async (insp) => {
        const assets = await this.getAssets(insp.id);
        const detailedAssets = await Promise.all(
          assets.map(async (asset) => {
            const room = rooms.find((r) => r.id === asset.room_id) || {
              id: asset.room_id,
              property_id: propertyId,
              name: "General",
              category: "unknown" as any,
            };
            const observations = await this.getObservations(asset.id);
            return {
              ...asset,
              room,
              observations,
            };
          })
        );
        return {
          ...insp,
          assets: detailedAssets,
        };
      })
    );

    return {
      property,
      inspections: detailedInspections,
    };
  }

  async createComparison(data: Omit<Comparison, "id" | "created_at">): Promise<Comparison> {
    const comp: Comparison = {
      id: `comp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.comparisons.push(comp);
    return comp;
  }

  async getShareLink(token: string): Promise<{ property_id: string; expires_at: string } | null> {
    return this.shareLinks.get(token) || null;
  }

  async createShareLink(propertyId: string, token: string): Promise<void> {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    this.shareLinks.set(token, { property_id: propertyId, expires_at: expires });
  }
}

// =========================================================================
// SINGLETON / FACTORY
// =========================================================================

let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    // Check if live Supabase is configured
    const hasSupabase = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    );

    if (hasSupabase) {
      // In live Supabase mode, we could instantiate a SupabaseDatabaseService.
      // For default resilience, we use the MockDatabaseService and can augment with Supabase client.
      dbInstance = new MockDatabaseService();
    } else {
      dbInstance = new MockDatabaseService();
    }
  }
  return dbInstance;
}

import fs from "fs";
import path from "path";
import {
  Property,
  Room,
  Inspection,
  Asset,
  Observation,
  Comparison,
  AnalysisStatus,
  ReviewStatus,
  User,
  ShareLink,
} from "./schemas";

export interface DatabaseService {
  // Users & Auth
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;

  // Properties
  getProperty(id: string): Promise<Property | null>;
  listProperties(ownerId?: string): Promise<Property[]>;
  createProperty(data: {
    address_label: string;
    unit_label: string;
    owner_id?: string;
    rooms?: Array<{ name: string; category: any }>;
  }): Promise<Property>;

  // Rooms
  getRooms(propertyId: string): Promise<Room[]>;
  createRoom(data: Omit<Room, "id">): Promise<Room>;

  // Inspections
  getInspections(propertyId: string): Promise<Inspection[]>;
  createInspection(data: Omit<Inspection, "id" | "created_at">): Promise<Inspection>;

  // Assets
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

  // Observations
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

  // Timeline
  getTimeline(propertyId: string): Promise<{
    property: Property;
    inspections: Array<
      Inspection & {
        assets: Array<Asset & { room: Room; observations: Observation[] }>;
      }
    >;
  }>;

  // Comparisons
  createComparison(data: Omit<Comparison, "id" | "created_at">): Promise<Comparison>;
  getComparisons(propertyId: string): Promise<Comparison[]>;

  // Share Links
  getShareLink(token: string): Promise<ShareLink | null>;
  createShareLink(propertyId: string, token: string, inspectionId?: string): Promise<ShareLink>;
  revokeShareLink(token: string): Promise<boolean>;
}

export interface StoreData {
  users: User[];
  properties: Property[];
  rooms: Room[];
  inspections: Inspection[];
  assets: Asset[];
  observations: Observation[];
  comparisons: Comparison[];
  share_links: ShareLink[];
}

// =========================================================================
// DEFAULT SEED DATA
// =========================================================================

function getDefaultSeedData(): StoreData {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "yxrdw0hc";

  return {
    users: [
      {
        id: "user-tenant-1",
        name: "Alex Chen",
        email: "alex.tenant@rentalmove.demo",
        role: "tenant",
        assigned_property_id: "prop-381",
        owned_properties: [],
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "user-owner-1",
        name: "Sarah Jenkins",
        email: "sarah.owner@rentalmove.demo",
        role: "owner",
        owned_properties: ["prop-381"],
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    properties: [
      {
        id: "prop-381",
        address_label: "381 Elmwood Ave",
        unit_label: "Apt 4B",
        owner_id: "user-owner-1",
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    rooms: [
      { id: "room-kitchen", property_id: "prop-381", name: "Kitchen", category: "kitchen" },
      { id: "room-bathroom", property_id: "prop-381", name: "Bathroom", category: "bathroom" },
      { id: "room-living", property_id: "prop-381", name: "Living Room", category: "living_room" },
      { id: "room-bedroom", property_id: "prop-381", name: "Master Bedroom", category: "bedroom" },
    ],
    inspections: [
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
    ],
    assets: [
      {
        id: "asset-01",
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01.jpg`,
        etag: "etag_k_2024_01",
        sha256: "8e9f2c5a1d7b3e4f6a8c0e2d4b6a8f1e3c5d7b9a2f4e6c8b0d2e4f6a8c0e2d4b",
        width: 1480,
        height: 1110,
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
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2024-move-in/bathroom/shower-tile-01.jpg`,
        etag: "etag_b_2024_02",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        width: 1480,
        height: 1110,
        captured_at: "2024-06-01T10:15:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "bathroom",
        image_quality: "ok",
        created_at: "2024-06-01T10:15:00Z",
      },
      {
        id: "asset-03",
        inspection_id: "insp-2024-move-in",
        room_id: "room-living",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/living_room/living-floor-01",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2024-move-in/living_room/living-floor-01.jpg`,
        etag: "etag_l_2024_03",
        sha256: "3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e",
        width: 1480,
        height: 1110,
        captured_at: "2024-06-01T10:30:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "living_room",
        image_quality: "ok",
        created_at: "2024-06-01T10:30:00Z",
      },
      {
        id: "asset-04",
        inspection_id: "insp-2024-move-in",
        room_id: "room-bedroom",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/bedroom/bedroom-wall-01",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2024-move-in/bedroom/bedroom-wall-01.jpg`,
        etag: "etag_m_2024_04",
        sha256: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
        width: 1480,
        height: 1110,
        captured_at: "2024-06-01T10:45:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "bedroom",
        image_quality: "ok",
        created_at: "2024-06-01T10:45:00Z",
      },
      {
        id: "asset-05",
        inspection_id: "insp-2025-periodic",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2025-periodic/kitchen/cabinet-base-02",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2025-periodic/kitchen/cabinet-base-02.jpg`,
        etag: "etag_k_2025_05",
        sha256: "8e9f2c5a1d7b3e4f6a8c0e2d4b6a8f1e3c5d7b9a2f4e6c8b0d2e4f6a8c0e2d4b",
        width: 1480,
        height: 1110,
        captured_at: "2025-06-01T11:00:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "kitchen",
        image_quality: "ok",
        created_at: "2025-06-01T11:00:00Z",
      },
      {
        id: "asset-06",
        inspection_id: "insp-2025-periodic",
        room_id: "room-bathroom",
        cloudinary_public_id: "properties/prop-381/insp-2025-periodic/bathroom/shower-tile-02",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2025-periodic/bathroom/shower-tile-02.jpg`,
        etag: "etag_b_2025_06",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        width: 1480,
        height: 1110,
        captured_at: "2025-06-01T11:20:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "bathroom",
        image_quality: "ok",
        created_at: "2025-06-01T11:20:00Z",
      },
      {
        id: "asset-07",
        inspection_id: "insp-2026-move-out",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2026-move-out/kitchen/cabinet-base-03",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2026-move-out/kitchen/cabinet-base-03.jpg`,
        etag: "etag_k_2026_07",
        sha256: "8e9f2c5a1d7b3e4f6a8c0e2d4b6a8f1e3c5d7b9a2f4e6c8b0d2e4f6a8c0e2d4b",
        width: 1480,
        height: 1110,
        captured_at: "2026-06-01T09:30:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "kitchen",
        image_quality: "ok",
        created_at: "2026-06-01T09:30:00Z",
      },
      {
        id: "asset-08",
        inspection_id: "insp-2026-move-out",
        room_id: "room-bathroom",
        cloudinary_public_id: "properties/prop-381/insp-2026-move-out/bathroom/shower-tile-03",
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2026-move-out/bathroom/shower-tile-03.jpg`,
        etag: "etag_b_2026_08",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        width: 1480,
        height: 1110,
        captured_at: "2026-06-01T09:50:00Z",
        analysis_status: "done",
        analysis_error: null,
        room_guess: "bathroom",
        image_quality: "ok",
        created_at: "2026-06-01T09:50:00Z",
      },
    ],
    observations: [
      {
        id: "obs-01",
        asset_id: "asset-01",
        category: "scratch",
        sub_area: "lower_cabinet",
        description: "Possible scratch visible on lower cabinet door surface.",
        confidence: 0.88,
        bbox: [0.38, 0.42, 0.55, 0.65],
        review_status: "accepted",
        reviewer_note: "Confirmed during move-in walkthrough baseline.",
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
        description: "Visible grout discoloration along shower wall tile grout line.",
        confidence: 0.84,
        bbox: [0.42, 0.65, 0.55, 0.85],
        review_status: "accepted",
        reviewer_note: "Existing grout variation noted.",
        source: "ai",
        edited_from: null,
        created_at: "2024-06-01T10:17:00Z",
        updated_at: "2024-06-01T10:20:00Z",
      },
      {
        id: "obs-03",
        asset_id: "asset-04",
        category: "mark",
        sub_area: "door_trim",
        description: "Minor dark surface mark visible near lower door moulding trim.",
        confidence: 0.82,
        bbox: [0.20, 0.78, 0.28, 0.86],
        review_status: "accepted",
        reviewer_note: "Pre-existing baseline mark documented.",
        source: "ai",
        edited_from: null,
        created_at: "2024-06-01T10:47:00Z",
        updated_at: "2024-06-01T10:50:00Z",
      },
      {
        id: "obs-04",
        asset_id: "asset-05",
        category: "scratch",
        sub_area: "lower_cabinet",
        description: "Existing cabinet mark reviewed, consistent with baseline move-in capture.",
        confidence: 0.89,
        bbox: [0.38, 0.42, 0.55, 0.65],
        review_status: "accepted",
        reviewer_note: "Baseline scratch verified unchanged.",
        source: "ai",
        edited_from: null,
        created_at: "2025-06-01T11:02:00Z",
        updated_at: "2025-06-01T11:05:00Z",
      },
      {
        id: "obs-05",
        asset_id: "asset-07",
        category: "scratch",
        sub_area: "lower_cabinet",
        description: "Superficial scratch visible on lower cabinet door surface, consistent with baseline.",
        confidence: 0.87,
        bbox: [0.38, 0.42, 0.55, 0.65],
        review_status: "accepted",
        reviewer_note: "Move-out review: condition matches 2024 baseline.",
        source: "ai",
        edited_from: null,
        created_at: "2026-06-01T09:32:00Z",
        updated_at: "2026-06-01T09:35:00Z",
      },
    ],
    comparisons: [],
    share_links: [
      {
        token: "demo-token-9842f1a",
        property_id: "prop-381",
        created_at: "2024-06-01T10:00:00Z",
        expires_at: "2027-01-01T00:00:00Z",
        revoked_at: null,
      },
    ],
  };
}

// =========================================================================
// PERSISTENT FILE-BASED DATABASE SERVICE
// =========================================================================

export class PersistentDatabaseService implements DatabaseService {
  private dataFilePath: string;
  private memoryCache: StoreData;

  constructor(filePath?: string) {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataFilePath = filePath || path.join(dataDir, "rentalmove-store.json");

    if (fs.existsSync(this.dataFilePath)) {
      try {
        const raw = fs.readFileSync(this.dataFilePath, "utf8");
        this.memoryCache = JSON.parse(raw);
      } catch (err) {
        console.warn("[Database] Corrupt store file; initializing from seed data:", err);
        this.memoryCache = getDefaultSeedData();
        this.flushToDisk();
      }
    } else {
      this.memoryCache = getDefaultSeedData();
      this.flushToDisk();
    }
  }

  private flushToDisk(): void {
    try {
      const tempPath = `${this.dataFilePath}.tmp-${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.memoryCache, null, 2), "utf8");
      fs.renameSync(tempPath, this.dataFilePath);
    } catch (err) {
      console.error("[Database] Failed to flush to disk:", err);
    }
  }

  // --- Users & Auth ---
  async getUser(id: string): Promise<User | null> {
    return this.memoryCache.users.find((u) => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const lower = email.toLowerCase().trim();
    return this.memoryCache.users.find((u) => u.email.toLowerCase() === lower) || null;
  }

  async listUsers(): Promise<User[]> {
    return [...this.memoryCache.users];
  }

  // --- Properties ---
  async getProperty(id: string): Promise<Property | null> {
    return this.memoryCache.properties.find((p) => p.id === id) || null;
  }

  async listProperties(ownerId?: string): Promise<Property[]> {
    if (ownerId) {
      return this.memoryCache.properties.filter(
        (p) => !p.owner_id || p.owner_id === ownerId
      );
    }
    return [...this.memoryCache.properties];
  }

  async createProperty(data: {
    address_label: string;
    unit_label: string;
    owner_id?: string;
    rooms?: Array<{ name: string; category: any }>;
  }): Promise<Property> {
    const propertyId = `prop-${Date.now()}`;
    const newProperty: Property = {
      id: propertyId,
      address_label: data.address_label,
      unit_label: data.unit_label,
      owner_id: data.owner_id,
      created_at: new Date().toISOString(),
    };

    this.memoryCache.properties.push(newProperty);

    // If initial rooms provided, create them
    const initialRooms = data.rooms && data.rooms.length > 0
      ? data.rooms
      : [
          { name: "Living Room", category: "living_room" },
          { name: "Kitchen", category: "kitchen" },
          { name: "Bathroom", category: "bathroom" },
          { name: "Bedroom", category: "bedroom" },
        ];

    for (const r of initialRooms) {
      this.memoryCache.rooms.push({
        id: `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        property_id: propertyId,
        name: r.name,
        category: r.category,
      });
    }

    this.flushToDisk();
    return newProperty;
  }

  // --- Rooms ---
  async getRooms(propertyId: string): Promise<Room[]> {
    return this.memoryCache.rooms.filter((r) => r.property_id === propertyId);
  }

  async createRoom(data: Omit<Room, "id">): Promise<Room> {
    const newRoom: Room = {
      id: `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...data,
    };
    this.memoryCache.rooms.push(newRoom);
    this.flushToDisk();
    return newRoom;
  }

  // --- Inspections ---
  async getInspections(propertyId: string): Promise<Inspection[]> {
    return this.memoryCache.inspections
      .filter((i) => i.property_id === propertyId)
      .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
  }

  async createInspection(data: Omit<Inspection, "id" | "created_at">): Promise<Inspection> {
    const newInsp: Inspection = {
      id: `insp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.memoryCache.inspections.push(newInsp);
    this.flushToDisk();
    return newInsp;
  }

  // --- Assets ---
  async getAssets(inspectionId?: string, roomId?: string): Promise<Asset[]> {
    return this.memoryCache.assets.filter((a) => {
      if (inspectionId && a.inspection_id !== inspectionId) return false;
      if (roomId && a.room_id !== roomId) return false;
      return true;
    });
  }

  async getAssetById(id: string): Promise<Asset | null> {
    return this.memoryCache.assets.find((a) => a.id === id) || null;
  }

  async getAssetByPublicId(publicId: string): Promise<Asset | null> {
    return this.memoryCache.assets.find((a) => a.cloudinary_public_id === publicId) || null;
  }

  async upsertAsset(data: Omit<Asset, "id" | "created_at"> & { id?: string }): Promise<Asset> {
    const existing = this.memoryCache.assets.find(
      (a) => a.cloudinary_public_id === data.cloudinary_public_id
    );

    if (existing) {
      Object.assign(existing, data);
      this.flushToDisk();
      return existing;
    }

    const newAsset: Asset = {
      id: data.id || `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.memoryCache.assets.push(newAsset);
    this.flushToDisk();
    return newAsset;
  }

  async updateAssetStatus(
    id: string,
    status: AnalysisStatus,
    error?: string | null,
    roomGuess?: any,
    imageQuality?: any
  ): Promise<void> {
    const asset = this.memoryCache.assets.find((a) => a.id === id);
    if (asset) {
      asset.analysis_status = status;
      if (error !== undefined) asset.analysis_error = error;
      if (roomGuess !== undefined) asset.room_guess = roomGuess;
      if (imageQuality !== undefined) asset.image_quality = imageQuality;
      this.flushToDisk();
    }
  }

  // --- Observations ---
  async getObservations(assetId: string): Promise<Observation[]> {
    return this.memoryCache.observations.filter((o) => o.asset_id === assetId);
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
    this.memoryCache.observations.push(newObs);
    this.flushToDisk();
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
    const obs = this.memoryCache.observations.find((o) => o.id === id);
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
    this.flushToDisk();
    return obs;
  }

  // --- Timeline ---
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

  // --- Comparisons ---
  async createComparison(data: Omit<Comparison, "id" | "created_at">): Promise<Comparison> {
    const comp: Comparison = {
      id: `comp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.memoryCache.comparisons.push(comp);
    this.flushToDisk();
    return comp;
  }

  async getComparisons(propertyId: string): Promise<Comparison[]> {
    return this.memoryCache.comparisons.filter((c) => c.property_id === propertyId);
  }

  // --- Share Links ---
  async getShareLink(token: string): Promise<ShareLink | null> {
    const link = this.memoryCache.share_links.find((s) => s.token === token);
    if (!link) return null;
    if (link.revoked_at) return null;
    if (new Date(link.expires_at).getTime() < Date.now()) return null;
    return link;
  }

  async createShareLink(
    propertyId: string,
    token: string,
    inspectionId?: string
  ): Promise<ShareLink> {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const newLink: ShareLink = {
      token,
      property_id: propertyId,
      inspection_id: inspectionId,
      created_at: new Date().toISOString(),
      expires_at: expires,
      revoked_at: null,
    };
    this.memoryCache.share_links.push(newLink);
    this.flushToDisk();
    return newLink;
  }

  async revokeShareLink(token: string): Promise<boolean> {
    const link = this.memoryCache.share_links.find((s) => s.token === token);
    if (!link) return false;
    link.revoked_at = new Date().toISOString();
    this.flushToDisk();
    return true;
  }
}

// =========================================================================
// SINGLETON / FACTORY
// =========================================================================

let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new PersistentDatabaseService();
  }
  return dbInstance;
}

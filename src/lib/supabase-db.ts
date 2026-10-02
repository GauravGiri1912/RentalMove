import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import { DatabaseService } from "./db";
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

function mapAssetRow(a: any): Asset {
  return {
    id: a.id,
    inspection_id: a.inspection_id,
    room_id: a.room_id,
    cloudinary_public_id: a.cloudinary_public_id,
    secure_url: a.secure_url,
    resource_type: a.resource_type || "image",
    format: a.format,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    etag: a.etag,
    sha256: a.sha256,
    captured_at: a.captured_at,
    analysis_status: a.analysis_status,
    analysis_error: a.analysis_error,
    room_guess: a.room_guess,
    image_quality: a.image_quality,
    created_at: a.created_at,
  };
}

function mapObservationRow(o: any): Observation {
  return {
    id: o.id,
    asset_id: o.asset_id,
    category: o.category,
    sub_area: o.sub_area,
    description: o.description,
    confidence: Number(o.confidence),
    bbox: o.bbox,
    review_status: o.review_status,
    reviewer_note: o.reviewer_note,
    reviewed_by: o.reviewed_by,
    reviewed_at: o.reviewed_at,
    source: o.source,
    edited_from: o.edited_from,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

export class SupabaseDatabaseService implements DatabaseService {
  private client: SupabaseClient;
  private fallback?: DatabaseService;
  private warnedSchemaMissing = false;
  private schemaMissing = false;

  constructor(client?: SupabaseClient, fallback?: DatabaseService) {
    const activeClient = client || getSupabaseClient();
    if (!activeClient) {
      throw new Error(
        "Cannot initialize SupabaseDatabaseService: Supabase environment variables are missing."
      );
    }
    this.client = activeClient;
    this.fallback = fallback;
  }

  private isSchemaMissingError(error: any): boolean {
    if (!error) return false;
    return (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      (typeof error.message === "string" && error.message.includes("schema cache"))
    );
  }

  private logSchemaWarning(tableName: string) {
    this.schemaMissing = true;
    if (!this.fallback) {
      throw new Error(
        `Supabase table '${tableName}' not found. Apply supabase/migrations/*.sql to the project.`
      );
    }
    if (!this.warnedSchemaMissing) {
      this.warnedSchemaMissing = true;
      console.warn(
        `[Supabase] Table '${tableName}' not found in Supabase schema cache. Operating seamlessly with fallback data store until migration 'supabase/migrations/0001_init.sql' is applied.`
      );
    }
  }

  // =========================================================================
  // Users & Auth
  // =========================================================================

  async getUser(id: string): Promise<User | null> {
    try {
      // Run all three lookups in parallel (one round trip instead of two sequential ones)
      const [userRes, assignmentsRes, propsRes] = await Promise.all([
        this.client.from("users").select("*").eq("id", id).maybeSingle(),
        this.client.from("property_tenants").select("property_id").eq("tenant_id", id),
        this.client.from("properties").select("id").eq("owner_id", id),
      ]);
      const { data: user, error } = userRes;

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("users");
          return this.fallback ? this.fallback.getUser(id) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!user) {
        return this.fallback ? this.fallback.getUser(id) : null;
      }

      let assigned_property_id: string | undefined;
      let owned_properties: string[] = [];

      if (user.role === "tenant") {
        const assignments = assignmentsRes.data;
        if (assignments && assignments.length > 0) {
          assigned_property_id = assignments[0].property_id;
        }
      } else if (user.role === "owner") {
        const props = propsRes.data;
        if (props) {
          owned_properties = props.map((p) => p.id);
        }
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assigned_property_id,
        owned_properties,
        created_at: user.created_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getUser(id) : null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const { data: user, error } = await this.client
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("users");
          return this.fallback ? this.fallback.getUserByEmail(email) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!user) {
        return this.fallback ? this.fallback.getUserByEmail(email) : null;
      }
      return this.getUser(user.id);
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getUserByEmail(email) : null;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const { data: users, error } = await this.client
        .from("users")
        .select("*")
        .order("created_at");

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("users");
          return this.fallback ? this.fallback.listUsers() : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!users || users.length === 0) {
        return this.fallback ? this.fallback.listUsers() : [];
      }

      const detailedUsers = await Promise.all(users.map((u) => this.getUser(u.id)));
      return detailedUsers.filter((u): u is User => u !== null);
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.listUsers() : [];
    }
  }

  // =========================================================================
  // Properties
  // =========================================================================

  async getProperty(id: string): Promise<Property | null> {
    try {
      const { data, error } = await this.client
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("properties");
          return this.fallback ? this.fallback.getProperty(id) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) {
        return this.fallback ? this.fallback.getProperty(id) : null;
      }

      return {
        id: data.id,
        address_label: data.address_label,
        unit_label: data.unit_label,
        owner_id: data.owner_id || undefined,
        created_at: data.created_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getProperty(id) : null;
    }
  }

  async listProperties(userId?: string, role?: string): Promise<Property[]> {
    try {
      let query = this.client.from("properties").select("*");

      if (userId) {
        if (role === "owner") {
          query = query.eq("owner_id", userId);
        } else if (role === "tenant") {
          const { data: assignments } = await this.client
            .from("property_tenants")
            .select("property_id")
            .eq("tenant_id", userId);
          const assignedIds = (assignments || []).map((a) => a.property_id);
          if (assignedIds.length === 0) return [];
          query = query.in("id", assignedIds);
        } else {
          const user = await this.getUser(userId);
          if (user?.role === "owner") {
            query = query.eq("owner_id", userId);
          } else if (user?.role === "tenant") {
            const { data: assignments } = await this.client
              .from("property_tenants")
              .select("property_id")
              .eq("tenant_id", userId);
            const assignedIds = (assignments || []).map((a) => a.property_id);
            if (assignedIds.length === 0) return [];
            query = query.in("id", assignedIds);
          }
        }
      }

      const { data, error } = await query.order("created_at");
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("properties");
          return this.fallback ? this.fallback.listProperties(userId, role as any) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.listProperties(userId, role as any) : [];
      }

      return data.map((p) => ({
        id: p.id,
        address_label: p.address_label,
        unit_label: p.unit_label,
        owner_id: p.owner_id || undefined,
        created_at: p.created_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.listProperties(userId, role as any) : [];
    }
  }

  async createProperty(data: {
    id?: string;
    address_label: string;
    unit_label: string;
    owner_id?: string | null;
    rooms?: Array<{ name: string; category: any }>;
  }): Promise<Property> {
    const id = data.id || `prop-${Date.now()}`;
    const newProperty = {
      id,
      address_label: data.address_label,
      unit_label: data.unit_label,
      // null = no owner on purpose (move-in kits); omitted = the legacy demo owner.
      owner_id: data.owner_id === null ? (null as unknown as string) : data.owner_id || "user-owner-1",
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await this.client.from("properties").insert(newProperty);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("properties");
          return this.fallback ? this.fallback.createProperty(data) : newProperty;
        }
        throw new Error(`Failed to create property in Supabase: ${error.message}`);
      }

      if (data.rooms && data.rooms.length > 0) {
        const roomInserts = data.rooms.map((r, i) => ({
          id: `room-${id}-${i + 1}`,
          property_id: id,
          name: r.name,
          category: r.category,
          created_at: new Date().toISOString(),
        }));
        await this.client.from("rooms").insert(roomInserts);
      }

      if (this.fallback) {
        await (this.fallback as any).createProperty({ ...data, id }).catch(() => {});
      }

      return newProperty;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createProperty(data);
      }
      throw err;
    }
  }

  // =========================================================================
  // Rooms
  // =========================================================================

  async getRooms(propertyId: string): Promise<Room[]> {
    try {
      const { data, error } = await this.client
        .from("rooms")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at");

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("rooms");
          return this.fallback ? this.fallback.getRooms(propertyId) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.getRooms(propertyId) : [];
      }

      return data.map((r) => ({
        id: r.id,
        property_id: r.property_id,
        name: r.name,
        category: r.category,
        created_at: r.created_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getRooms(propertyId) : [];
    }
  }

  async getRoomById(id: string): Promise<Room | null> {
    try {
      const { data, error } = await this.client
        .from("rooms")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("rooms");
          return this.fallback ? this.fallback.getRoomById(id) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) return this.fallback ? this.fallback.getRoomById(id) : null;
      return {
        id: data.id,
        property_id: data.property_id,
        name: data.name,
        category: data.category,
        created_at: data.created_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getRoomById(id) : null;
    }
  }

  async createRoom(data: Omit<Room, "id">): Promise<Room> {
    const newRoom: Room = {
      id: `room-${Date.now()}`,
      property_id: data.property_id,
      name: data.name,
      category: data.category,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await this.client.from("rooms").insert(newRoom);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("rooms");
          return this.fallback ? this.fallback.createRoom(data) : newRoom;
        }
        throw new Error(`Failed to create room in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.createRoom(data).catch(() => {});
      }
      return newRoom;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createRoom(data);
      }
      throw err;
    }
  }

  // =========================================================================
  // Inspections
  // =========================================================================

  async getInspections(propertyId: string): Promise<Inspection[]> {
    try {
      const { data, error } = await this.client
        .from("inspections")
        .select("*")
        .eq("property_id", propertyId)
        .order("captured_at", { ascending: false });

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("inspections");
          return this.fallback ? this.fallback.getInspections(propertyId) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.getInspections(propertyId) : [];
      }

      return data.map((i) => ({
        id: i.id,
        property_id: i.property_id,
        type: i.type,
        captured_at: i.captured_at,
        status: i.status,
        created_by: i.created_by,
        created_at: i.created_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getInspections(propertyId) : [];
    }
  }

  async getInspectionById(id: string): Promise<Inspection | null> {
    try {
      const { data, error } = await this.client
        .from("inspections")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("inspections");
          return this.fallback ? this.fallback.getInspectionById(id) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) return this.fallback ? this.fallback.getInspectionById(id) : null;
      return {
        id: data.id,
        property_id: data.property_id,
        type: data.type,
        captured_at: data.captured_at,
        status: data.status,
        created_by: data.created_by,
        created_at: data.created_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getInspectionById(id) : null;
    }
  }

  async createInspection(
    data: Omit<Inspection, "id" | "created_at"> & { id?: string }
  ): Promise<Inspection> {
    const newInspection: Inspection = {
      id: data.id || `insp-${Date.now()}`,
      property_id: data.property_id,
      type: data.type,
      captured_at: data.captured_at,
      status: data.status || "completed",
      created_by: data.created_by || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await this.client.from("inspections").insert(newInspection);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("inspections");
          return this.fallback ? this.fallback.createInspection(data) : newInspection;
        }
        throw new Error(`Failed to create inspection in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.createInspection(data).catch(() => {});
      }
      return newInspection;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createInspection(data);
      }
      throw err;
    }
  }

  // =========================================================================
  // Assets
  // =========================================================================

  async getAssets(inspectionId?: string, roomId?: string): Promise<Asset[]> {
    try {
      let query = this.client.from("assets").select("*");

      if (inspectionId) query = query.eq("inspection_id", inspectionId);
      if (roomId) query = query.eq("room_id", roomId);

      const { data, error } = await query.order("captured_at", { ascending: false });
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("assets");
          return this.fallback ? this.fallback.getAssets(inspectionId, roomId) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.getAssets(inspectionId, roomId) : [];
      }

      return data.map((a) => ({
        id: a.id,
        inspection_id: a.inspection_id,
        room_id: a.room_id,
        cloudinary_public_id: a.cloudinary_public_id,
        secure_url: a.secure_url,
        resource_type: a.resource_type || "image",
        format: a.format,
        width: a.width,
        height: a.height,
        bytes: a.bytes,
        etag: a.etag,
        sha256: a.sha256,
        captured_at: a.captured_at,
        analysis_status: a.analysis_status,
        analysis_error: a.analysis_error,
        room_guess: a.room_guess,
        image_quality: a.image_quality,
        created_at: a.created_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getAssets(inspectionId, roomId) : [];
    }
  }

  async getAssetsForInspections(inspectionIds: string[]): Promise<Asset[]> {
    if (!inspectionIds.length) return [];
    const { data, error } = await this.client.from("assets").select("*").in("inspection_id", inspectionIds).order("captured_at", { ascending: true });
    if (error) {
      if (this.fallback) return this.fallback.getAssetsForInspections(inspectionIds);
      throw new Error(`Supabase query failed: ${error.message}`);
    }
    return (data || []).map(mapAssetRow);
  }

  async getObservationsForAssets(assetIds: string[]): Promise<Observation[]> {
    if (!assetIds.length) return [];
    const { data, error } = await this.client.from("observations").select("*").in("asset_id", assetIds).order("created_at", { ascending: true });
    if (error) {
      if (this.fallback) return this.fallback.getObservationsForAssets(assetIds);
      throw new Error(`Supabase query failed: ${error.message}`);
    }
    return (data || []).map(mapObservationRow);
  }

  async getAssetById(id: string): Promise<Asset | null> {
    try {
      const { data, error } = await this.client
        .from("assets")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("assets");
          return this.fallback ? this.fallback.getAssetById(id) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) {
        return this.fallback ? this.fallback.getAssetById(id) : null;
      }

      return {
        id: data.id,
        inspection_id: data.inspection_id,
        room_id: data.room_id,
        cloudinary_public_id: data.cloudinary_public_id,
        secure_url: data.secure_url,
        resource_type: data.resource_type || "image",
        format: data.format,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
        etag: data.etag,
        sha256: data.sha256,
        captured_at: data.captured_at,
        analysis_status: data.analysis_status,
        analysis_error: data.analysis_error,
        room_guess: data.room_guess,
        image_quality: data.image_quality,
        created_at: data.created_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getAssetById(id) : null;
    }
  }

  async getAssetByPublicId(publicId: string): Promise<Asset | null> {
    try {
      const { data, error } = await this.client
        .from("assets")
        .select("*")
        .eq("cloudinary_public_id", publicId)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("assets");
          return this.fallback ? this.fallback.getAssetByPublicId(publicId) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) {
        return this.fallback ? this.fallback.getAssetByPublicId(publicId) : null;
      }
      return this.getAssetById(data.id);
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getAssetByPublicId(publicId) : null;
    }
  }

  async getAssetBySha256(sha256: string): Promise<Asset | null> {
    const target = sha256.toLowerCase().trim();
    try {
      const { data, error } = await this.client
        .from("assets")
        .select("*")
        .eq("sha256", target)
        .limit(1)
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("assets");
          return this.fallback ? this.fallback.getAssetBySha256(target) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) return this.fallback ? this.fallback.getAssetBySha256(target) : null;
      return mapAssetRow(data);
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getAssetBySha256(target) : null;
    }
  }

  async upsertAsset(data: Omit<Asset, "id" | "created_at"> & { id?: string }): Promise<Asset> {
    const id = data.id || `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const assetPayload = {
      id,
      inspection_id: data.inspection_id,
      room_id: data.room_id,
      cloudinary_public_id: data.cloudinary_public_id,
      secure_url: data.secure_url,
      resource_type: data.resource_type || "image",
      format: data.format || null,
      width: data.width || null,
      height: data.height || null,
      bytes: data.bytes || null,
      etag: data.etag || null,
      sha256: data.sha256 || null,
      captured_at: data.captured_at || new Date().toISOString(),
      analysis_status: data.analysis_status || "queued",
      analysis_error: data.analysis_error || null,
      room_guess: data.room_guess || null,
      image_quality: data.image_quality || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { data: upserted, error } = await this.client
        .from("assets")
        .upsert(assetPayload, { onConflict: "cloudinary_public_id" })
        .select("*")
        .single();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("assets");
          return this.fallback ? this.fallback.upsertAsset(data) : (assetPayload as any);
        }
        throw new Error(`Failed to upsert asset in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.upsertAsset(data).catch(() => {});
      }

      return {
        id: upserted.id,
        inspection_id: upserted.inspection_id,
        room_id: upserted.room_id,
        cloudinary_public_id: upserted.cloudinary_public_id,
        secure_url: upserted.secure_url,
        resource_type: upserted.resource_type || "image",
        format: upserted.format,
        width: upserted.width,
        height: upserted.height,
        bytes: upserted.bytes,
        etag: upserted.etag,
        sha256: upserted.sha256,
        captured_at: upserted.captured_at,
        analysis_status: upserted.analysis_status,
        analysis_error: upserted.analysis_error,
        room_guess: upserted.room_guess,
        image_quality: upserted.image_quality,
        created_at: upserted.created_at,
      };
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.upsertAsset(data);
      }
      throw err;
    }
  }

  async updateAssetStatus(
    id: string,
    status: AnalysisStatus,
    error?: string | null,
    roomGuess?: any,
    imageQuality?: any
  ): Promise<void> {
    try {
      const updates: Record<string, any> = {
        analysis_status: status,
        analysis_error: error || null,
      };
      if (roomGuess) updates.room_guess = roomGuess;
      if (imageQuality) updates.image_quality = imageQuality;

      const { error: updateError } = await this.client.from("assets").update(updates).eq("id", id);
      if (updateError) throw new Error(`Failed to update asset status: ${updateError.message}`);
    } catch (err) {
      // A status write that silently fails leaves assets stuck in "running" forever.
      if (!this.fallback) throw err;
    } finally {
      if (this.fallback) {
        await this.fallback.updateAssetStatus(id, status, error, roomGuess, imageQuality).catch(() => {});
      }
    }
  }

  // =========================================================================
  // Observations
  // =========================================================================

  async getObservations(assetId: string): Promise<Observation[]> {
    try {
      const { data, error } = await this.client
        .from("observations")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at");

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("observations");
          return this.fallback ? this.fallback.getObservations(assetId) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.getObservations(assetId) : [];
      }

      return data.map((o) => ({
        id: o.id,
        asset_id: o.asset_id,
        category: o.category,
        sub_area: o.sub_area,
        description: o.description,
        confidence: Number(o.confidence),
        bbox: o.bbox,
        review_status: o.review_status,
        reviewer_note: o.reviewer_note,
        reviewed_by: o.reviewed_by,
        reviewed_at: o.reviewed_at,
        source: o.source,
        edited_from: o.edited_from,
        created_at: o.created_at,
        updated_at: o.updated_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getObservations(assetId) : [];
    }
  }

  async createObservation(
    data: Omit<Observation, "id" | "created_at" | "updated_at">
  ): Promise<Observation> {
    const newObs = {
      id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      asset_id: data.asset_id,
      category: data.category,
      sub_area: data.sub_area,
      description: data.description,
      confidence: data.confidence,
      bbox: data.bbox,
      review_status: data.review_status || "pending",
      reviewer_note: data.reviewer_note || null,
      reviewed_by: data.reviewed_by || null,
      reviewed_at: data.reviewed_at || null,
      source: data.source || "ai",
      edited_from: data.edited_from || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await this.client.from("observations").insert(newObs);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("observations");
          return this.fallback ? this.fallback.createObservation(data) : (newObs as any);
        }
        throw new Error(`Failed to create observation in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.createObservation(data).catch(() => {});
      }
      return newObs as any;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createObservation(data);
      }
      throw err;
    }
  }

  async updateObservation(
    id: string,
    update: {
      review_status: ReviewStatus;
      reviewer_note?: string;
      category?: any;
      description?: string;
      sub_area?: string;
      reviewed_by?: string;
    }
  ): Promise<Observation | null> {
    const patch: Record<string, any> = {
      review_status: update.review_status,
      updated_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    };
    if (update.reviewer_note !== undefined) patch.reviewer_note = update.reviewer_note;
    if (update.category) patch.category = update.category;
    if (update.description) patch.description = update.description;
    if (update.sub_area) patch.sub_area = update.sub_area;
    if (update.reviewed_by) patch.reviewed_by = update.reviewed_by;

    try {
      if (update.category || update.description || update.sub_area) {
        const { data: existing } = await this.client
          .from("observations")
          .select("category, description, sub_area")
          .eq("id", id)
          .maybeSingle();

        if (existing) {
          patch.edited_from = {
            category: existing.category,
            description: existing.description,
            sub_area: existing.sub_area,
          };
        }
      }
      const { data, error } = await this.client
        .from("observations")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("observations");
          return this.fallback ? this.fallback.updateObservation(id, update) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) {
        return this.fallback ? this.fallback.updateObservation(id, update) : null;
      }

      if (this.fallback) {
        await this.fallback.updateObservation(id, update).catch(() => {});
      }

      return {
        id: data.id,
        asset_id: data.asset_id,
        category: data.category,
        sub_area: data.sub_area,
        description: data.description,
        confidence: Number(data.confidence),
        bbox: data.bbox,
        review_status: data.review_status,
        reviewer_note: data.reviewer_note,
        reviewed_by: data.reviewed_by,
        reviewed_at: data.reviewed_at,
        source: data.source,
        edited_from: data.edited_from,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.updateObservation(id, update) : null;
    }
  }

  // =========================================================================
  // Timeline
  // =========================================================================

  async getTimeline(propertyId: string): Promise<{
    property: Property;
    inspections: Array<
      Inspection & {
        assets: Array<Asset & { room: Room; observations: Observation[] }>;
      }
    >;
  }> {
    if (this.schemaMissing && this.fallback) {
      return this.fallback.getTimeline(propertyId);
    }
    try {
      // Fetch property, rooms and the full inspection → asset → observation tree
      // in parallel. The tree is a single PostgREST nested select (one round trip)
      // instead of one query per inspection and per asset.
      const [property, rooms, tree] = await Promise.all([
        this.getProperty(propertyId),
        this.getRooms(propertyId),
        this.client
          .from("inspections")
          .select("*, assets(*, observations(*))")
          .eq("property_id", propertyId)
          .order("captured_at", { ascending: false }),
      ]);

      if (!property) {
        if (this.fallback) {
          return this.fallback.getTimeline(propertyId);
        }
        throw new Error(`Property ${propertyId} not found`);
      }
      if (tree.error) throw tree.error;

      const inspectionRows: any[] = tree.data || [];

      // If Supabase has empty inspections but fallback has seed inspections, use fallback
      if (inspectionRows.length === 0 && this.fallback) {
        const fallbackTimeline = await this.fallback.getTimeline(propertyId).catch(() => null);
        if (fallbackTimeline && fallbackTimeline.inspections.length > 0) {
          return fallbackTimeline;
        }
      }

      const detailedInspections = await Promise.all(
        inspectionRows.map(async (i) => {
          const insp: Inspection = {
            id: i.id,
            property_id: i.property_id,
            type: i.type,
            captured_at: i.captured_at,
            status: i.status,
            created_by: i.created_by,
            created_at: i.created_at,
          };
          const assetRows: any[] = (i.assets || []).sort(
            (a: any, b: any) =>
              new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
          );
          const assets: Array<Asset & { observations?: Observation[] }> =
            assetRows.length > 0
              ? assetRows.map((a) => ({
                  ...mapAssetRow(a),
                  observations: (a.observations || [])
                    .map(mapObservationRow)
                    .sort(
                      (x: Observation, y: Observation) =>
                        new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
                    ),
                }))
              : this.fallback
                ? await this.fallback.getAssets(insp.id)
                : [];

          const detailedAssets = await Promise.all(
            assets.map(async ({ observations, ...asset }) => {
              const room = rooms.find((r) => r.id === asset.room_id) || {
                id: asset.room_id,
                property_id: propertyId,
                name: "General",
                category: "unknown" as any,
              };
              // Preserve previous behavior: fall back to local store when Supabase has none
              const obs =
                observations && observations.length > 0
                  ? observations
                  : this.fallback
                    ? await this.fallback.getObservations(asset.id)
                    : [];
              return {
                ...asset,
                room,
                observations: obs,
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
    } catch (err) {
      if (this.fallback) {
        return this.fallback.getTimeline(propertyId);
      }
      throw err;
    }
  }

  // =========================================================================
  // Comparisons
  // =========================================================================

  async createComparison(data: Omit<Comparison, "id" | "created_at">): Promise<Comparison> {
    const comp: Comparison = {
      id: `comp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
      review_required: data.review_required ?? true,
    };

    try {
      const { error } = await this.client.from("comparisons").insert(comp);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("comparisons");
          return this.fallback ? this.fallback.createComparison(data) : comp;
        }
        throw new Error(`Failed to create comparison in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.createComparison(data).catch(() => {});
      }
      return comp;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createComparison(data);
      }
      throw err;
    }
  }

  async getComparisons(propertyId: string): Promise<Comparison[]> {
    try {
      const { data, error } = await this.client
        .from("comparisons")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("comparisons");
          return this.fallback ? this.fallback.getComparisons(propertyId) : [];
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return [];
      }
      if (!data || data.length === 0) {
        return this.fallback ? this.fallback.getComparisons(propertyId) : [];
      }

      return data.map((c) => ({
        id: c.id,
        property_id: c.property_id,
        room_id: c.room_id,
        prior_asset_id: c.prior_asset_id,
        current_asset_id: c.current_asset_id,
        summary: c.summary,
        changes: c.changes || [],
        caveats: c.caveats || [],
        confidence: c.confidence ? Number(c.confidence) : undefined,
        review_required: Boolean(c.review_required),
        model_version: c.model_version,
        created_at: c.created_at,
      }));
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getComparisons(propertyId) : [];
    }
  }

  // =========================================================================
  // Share Links
  // =========================================================================

  async getShareLink(token: string): Promise<ShareLink | null> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    try {
      const { data, error } = await this.client
        .from("share_links")
        .select("*")
        .or(`token.eq.${token},token_hash.eq.${tokenHash}`)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("share_links");
          return this.fallback ? this.fallback.getShareLink(token) : null;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return null;
      }
      if (!data) {
        return this.fallback ? this.fallback.getShareLink(token) : null;
      }

      return {
        id: data.id,
        token: data.token,
        token_hash: data.token_hash,
        property_id: data.property_id,
        inspection_id: data.inspection_id,
        created_by: data.created_by,
        created_at: data.created_at,
        expires_at: data.expires_at,
        revoked_at: data.revoked_at,
      };
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.getShareLink(token) : null;
    }
  }

  async createShareLink(
    propertyId: string,
    token: string,
    inspectionId?: string,
    createdBy?: string,
    expiresAt?: string
  ): Promise<ShareLink> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expires = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const newLink: ShareLink = {
      id: `share-${Date.now()}`,
      token,
      token_hash: tokenHash,
      property_id: propertyId,
      inspection_id: inspectionId,
      created_by: createdBy || null,
      created_at: new Date().toISOString(),
      expires_at: expires,
      revoked_at: null,
    };

    try {
      const { error } = await this.client.from("share_links").insert(newLink);
      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("share_links");
          return this.fallback
            ? this.fallback.createShareLink(propertyId, token, inspectionId, createdBy, expires)
            : newLink;
        }
        throw new Error(`Failed to create share link in Supabase: ${error.message}`);
      }

      if (this.fallback) {
        await this.fallback.createShareLink(propertyId, token, inspectionId, createdBy, expires).catch(() => {});
      }
      return newLink;
    } catch (err: any) {
      if (this.fallback) {
        return this.fallback.createShareLink(propertyId, token, inspectionId, createdBy, expires);
      }
      throw err;
    }
  }

  async listShareLinks(propertyId: string): Promise<ShareLink[]> {
    const { data, error } = await this.client
      .from("share_links")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (error) {
      if (this.isSchemaMissingError(error) && this.fallback) return this.fallback.listShareLinks(propertyId);
      throw new Error(`Supabase query failed: ${error.message}`);
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      token: d.token,
      token_hash: d.token_hash,
      property_id: d.property_id,
      inspection_id: d.inspection_id,
      created_by: d.created_by,
      created_at: d.created_at,
      expires_at: d.expires_at,
      revoked_at: d.revoked_at,
    }));
  }

  async revokeShareLink(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    try {
      const { error } = await this.client
        .from("share_links")
        .update({ revoked_at: new Date().toISOString() })
        .or(`token.eq.${token},token_hash.eq.${tokenHash}`);

      if (error) {
        if (this.isSchemaMissingError(error)) {
          this.logSchemaWarning("share_links");
          return this.fallback ? this.fallback.revokeShareLink(token) : false;
        }
        if (!this.fallback) throw new Error(`Supabase query failed: ${error.message}`);
        return false;
      }

      if (this.fallback) {
        await this.fallback.revokeShareLink(token).catch(() => {});
      }
      return true;
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback ? this.fallback.revokeShareLink(token) : false;
    }
  }

  async deleteProperty(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.from("properties").delete().eq("id", id);
      if (error) return false;
      if (this.fallback && "deleteProperty" in this.fallback) {
        await (this.fallback as any).deleteProperty(id).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  async deleteAsset(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.from("assets").delete().eq("id", id);
      if (error) return false;
      if (this.fallback && "deleteAsset" in this.fallback) {
        await (this.fallback as any).deleteAsset(id).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  async deleteShareLink(token: string): Promise<boolean> {
    try {
      const { error } = await this.client.from("share_links").delete().eq("token", token);
      if (error) return false;
      if (this.fallback && "deleteShareLink" in this.fallback) {
        await (this.fallback as any).deleteShareLink(token).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }
}

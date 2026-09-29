import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import {
  thumbUrl,
  reviewUrl,
  vlmUrl,
  originalUrl,
  sharedUrl,
  matchedUrl,
  matchedTileUrl,
  evidenceUrl,
  TileSpec,
  EvidenceBox,
} from "./cloudinary-urls";
import { diffTags } from "./tags";

/**
 * Load env files when running outside Next.js (vitest, tsx scripts). Next.js loads .env,
 * .env.local etc. itself; here we mirror that so both files are honoured (.env.local wins).
 */
function loadEnvFiles() {
  if (typeof window !== "undefined") return;
  for (const name of [".env.local", ".env"]) {
    try {
      const envFile = path.resolve(process.cwd(), name);
      if (!fs.existsSync(envFile)) continue;
      for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      /* best effort */
    }
  }
}

loadEnvFiles();

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function ensureCloudinaryConfig() {
  if (isCloudinaryConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

ensureCloudinaryConfig();

export interface UploadSignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  tags: string;
  context?: string;
  notificationUrl?: string;
}

export interface SearchMediaResult {
  total_count: number;
  resources: Array<{
    public_id: string;
    secure_url: string;
    created_at: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
    metadata?: Record<string, any>;
    tags?: string[];
  }>;
}

export interface MediaProvider {
  isMock(): boolean;
  signUpload(params: {
    propertyId: string;
    inspectionId: string;
    inspectionType: string;
    room: string;
  }): Promise<UploadSignatureResult>;
  updateMetadata(
    publicId: string,
    metadata: Record<string, string | number | undefined>
  ): Promise<void>;
  /** Make the asset's managed tags (issue:*, review:*, plain issue category) equal `desired`. */
  syncManagedTags(publicId: string, desired: string[]): Promise<{ added: string[]; removed: string[] }>;
  search(expression: string, maxResults?: number): Promise<SearchMediaResult>;

  // Delivery renditions — every one is a transformation of the untouched original.
  thumb(publicIdOrUrl: string): string;
  review(publicIdOrUrl: string): string;
  vlmCopy(publicIdOrUrl: string): string;
  fullOriginal(publicIdOrUrl: string): string;
  /** Faces pixelated; use for anything shown through a share link. */
  shared(publicIdOrUrl: string): string;
  /** Same crop + exposure pipeline for both photos of a comparison. */
  matched(publicIdOrUrl: string): string;
  matchedTile(publicIdOrUrl: string, tile: TileSpec): string;
  /** Image with finding boxes and labels drawn by Cloudinary in the URL itself. */
  evidence(publicIdOrUrl: string, boxes: EvidenceBox[], opts?: { pixelateFaces?: boolean }): string;
}

/** URL renditions are provider-independent; both providers share this mixin. */
abstract class RenditionMixin {
  thumb = thumbUrl;
  review = reviewUrl;
  vlmCopy = vlmUrl;
  fullOriginal = originalUrl;
  shared = sharedUrl;
  matched = matchedUrl;
  matchedTile = matchedTileUrl;
  evidence = evidenceUrl;
}

// =========================================================================
// MOCK MEDIA PROVIDER (only when Cloudinary credentials are absent)
// =========================================================================

export class MockMediaProvider extends RenditionMixin implements MediaProvider {
  private mockStore: Array<{
    public_id: string;
    secure_url: string;
    created_at: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
    metadata: Record<string, any>;
    tags: string[];
  }> = [];

  isMock(): boolean {
    return true;
  }

  async signUpload(params: {
    propertyId: string;
    inspectionId: string;
    inspectionType: string;
    room: string;
  }): Promise<UploadSignatureResult> {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `properties/${params.propertyId}/${params.inspectionId}/${params.room}`;
    const tags = `rentalmove,${params.room},${params.inspectionType},room:${params.room},insp:${params.inspectionType}`;

    return {
      signature: `mock_sig_${timestamp}`,
      timestamp,
      apiKey: "mock_api_key",
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo",
      folder,
      tags,
      notificationUrl: process.env.CLOUDINARY_NOTIFICATION_URL,
    };
  }

  async updateMetadata(
    publicId: string,
    metadata: Record<string, string | number | undefined>
  ): Promise<void> {
    const item = this.mockStore.find((m) => m.public_id === publicId);
    if (item) {
      item.metadata = { ...item.metadata, ...metadata };
    }
  }

  async syncManagedTags(publicId: string, desired: string[]) {
    const item = this.mockStore.find((m) => m.public_id === publicId);
    if (!item) return { added: [], removed: [] };
    const { add, remove } = diffTags(item.tags, desired);
    item.tags = [...item.tags.filter((t) => !remove.includes(t)), ...add];
    return { added: add, removed: remove };
  }

  async search(_expression: string, _maxResults = 50): Promise<SearchMediaResult> {
    // Offline mode has no media index: an honest empty result instead of canned assets.
    return { total_count: 0, resources: [] };
  }
}

// =========================================================================
// REAL CLOUDINARY MEDIA PROVIDER
// =========================================================================

export class CloudinaryMediaProvider extends RenditionMixin implements MediaProvider {
  isMock(): boolean {
    return false;
  }

  async signUpload(params: {
    propertyId: string;
    inspectionId: string;
    inspectionType: string;
    room: string;
  }): Promise<UploadSignatureResult> {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `properties/${params.propertyId}/${params.inspectionId}/${params.room}`;
    const tags = `rentalmove,${params.room},${params.inspectionType},room:${params.room},insp:${params.inspectionType}`;
    const notificationUrl = process.env.CLOUDINARY_NOTIFICATION_URL;

    const paramsToSign: Record<string, any> = {
      folder,
      tags,
      timestamp,
    };
    if (notificationUrl) {
      paramsToSign.notification_url = notificationUrl;
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!
    );

    return {
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      folder,
      tags,
      notificationUrl,
    };
  }

  async updateMetadata(
    publicId: string,
    metadata: Record<string, string | number | undefined>
  ): Promise<void> {
    // Structured metadata is best-effort: fields must be provisioned in the account
    // (scripts/provision-cloudinary.ts). Tags — not metadata — drive search, so a failure
    // here must not fail the pipeline.
    try {
      const metadataPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined) {
          metadataPayload[k] = v;
        }
      }
      if (Object.keys(metadataPayload).length > 0) {
        await (cloudinary.uploader as any).update_metadata(metadataPayload, [publicId]);
      }
    } catch (err: any) {
      console.warn("[Media] updateMetadata warning:", err?.message || err?.error?.message || err);
    }
  }

  async syncManagedTags(publicId: string, desired: string[]) {
    const resource = await cloudinary.api.resource(publicId);
    const { add, remove } = diffTags(resource.tags || [], desired);
    for (const tag of remove) {
      await cloudinary.uploader.remove_tag(tag, [publicId]);
    }
    if (add.length > 0) {
      await cloudinary.uploader.add_tag(add.join(","), [publicId]);
    }
    return { added: add, removed: remove };
  }

  async search(expression: string, maxResults = 50): Promise<SearchMediaResult> {
    const result = await cloudinary.search
      .expression(expression)
      .with_field("context")
      .with_field("tags")
      .with_field("metadata")
      .sort_by("created_at", "desc")
      .max_results(maxResults)
      .execute();

    return {
      total_count: result.total_count || result.resources?.length || 0,
      resources: (result.resources || []).map((r: any) => ({
        public_id: r.public_id,
        secure_url: r.secure_url,
        created_at: r.created_at,
        format: r.format,
        width: r.width,
        height: r.height,
        bytes: r.bytes,
        metadata: r.metadata,
        tags: r.tags,
      })),
    };
  }
}

// =========================================================================
// SINGLETON FACTORY
// =========================================================================

let mediaInstance: MediaProvider | null = null;

export function getMediaProvider(): MediaProvider {
  if (!mediaInstance) {
    if (isCloudinaryConfigured()) {
      ensureCloudinaryConfig();
      mediaInstance = new CloudinaryMediaProvider();
    } else {
      mediaInstance = new MockMediaProvider();
    }
  }
  return mediaInstance;
}

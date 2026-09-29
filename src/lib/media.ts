import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary if credentials exist
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

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
  search(expression: string, maxResults?: number): Promise<SearchMediaResult>;
  thumb(publicIdOrUrl: string): string;
  review(publicIdOrUrl: string): string;
  vlmCopy(publicIdOrUrl: string): string;
  fullOriginal(publicIdOrUrl: string): string;
}

// =========================================================================
// MOCK MEDIA PROVIDER
// =========================================================================

export class MockMediaProvider implements MediaProvider {
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

  constructor() {
    // Seed some initial mock assets for offline testing
    this.mockStore = [
      {
        public_id: "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01",
        secure_url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
        created_at: "2024-06-01T10:00:00Z",
        format: "jpg",
        width: 1920,
        height: 1080,
        bytes: 420000,
        tags: ["rentalmove", "room:kitchen", "insp:move_in"],
        metadata: {
          property_id: "prop-381",
          inspection_id: "insp-2024-move-in",
          inspection_type: "move_in",
          room: "kitchen",
          capture_date: "2024-06-01",
          issue_category: "scratch",
          review_status: "accepted",
          ai_confidence: 0.88,
        },
      },
      {
        public_id: "properties/prop-381/insp-2024-move-in/bathroom/shower-tile-01",
        secure_url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
        created_at: "2024-06-01T10:15:00Z",
        format: "jpg",
        width: 1920,
        height: 1080,
        bytes: 380000,
        tags: ["rentalmove", "room:bathroom", "insp:move_in"],
        metadata: {
          property_id: "prop-381",
          inspection_id: "insp-2024-move-in",
          inspection_type: "move_in",
          room: "bathroom",
          capture_date: "2024-06-01",
          issue_category: "stain",
          review_status: "accepted",
          ai_confidence: 0.84,
        },
      },
      {
        public_id: "properties/prop-381/insp-2025-periodic/kitchen/cabinet-base-02",
        secure_url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80",
        created_at: "2025-06-01T11:00:00Z",
        format: "jpg",
        width: 1920,
        height: 1080,
        bytes: 430000,
        tags: ["rentalmove", "room:kitchen", "insp:inspection"],
        metadata: {
          property_id: "prop-381",
          inspection_id: "insp-2025-periodic",
          inspection_type: "inspection",
          room: "kitchen",
          capture_date: "2025-06-01",
          issue_category: "scratch",
          review_status: "accepted",
          ai_confidence: 0.89,
        },
      },
    ];
  }

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
    const tags = `rentalmove,room:${params.room},insp:${params.inspectionType}`;

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

  async search(expression: string, maxResults = 50): Promise<SearchMediaResult> {
    // Basic filter matching on mock resources
    const exprLower = expression.toLowerCase();
    const filtered = this.mockStore.filter((res) => {
      if (exprLower.includes("room=kitchen") && res.metadata.room !== "kitchen") return false;
      if (exprLower.includes("room=bathroom") && res.metadata.room !== "bathroom") return false;
      if (exprLower.includes("room=bedroom") && res.metadata.room !== "bedroom") return false;
      if (exprLower.includes("room=living_room") && res.metadata.room !== "living_room") return false;
      if (exprLower.includes("inspection_type=move_in") && res.metadata.inspection_type !== "move_in") return false;
      if (exprLower.includes("inspection_type=move_out") && res.metadata.inspection_type !== "move_out") return false;
      if (exprLower.includes("2024") && !res.metadata.capture_date?.includes("2024")) return false;
      if (exprLower.includes("2025") && !res.metadata.capture_date?.includes("2025")) return false;
      return true;
    });

    return {
      total_count: filtered.length,
      resources: filtered.slice(0, maxResults),
    };
  }

  thumb(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo";
    return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_400,h_300,f_auto,q_auto/${publicIdOrUrl}.jpg`;
  }

  review(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo";
    return `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_1600,h_1200,f_auto,q_auto/${publicIdOrUrl}.jpg`;
  }

  vlmCopy(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo";
    return `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_1024,q_auto,f_jpg/${publicIdOrUrl}.jpg`;
  }

  fullOriginal(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo";
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${publicIdOrUrl}`;
  }
}

// =========================================================================
// REAL CLOUDINARY MEDIA PROVIDER
// =========================================================================

export class CloudinaryMediaProvider implements MediaProvider {
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
    const tags = `rentalmove,room:${params.room},insp:${params.inspectionType}`;
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
    // Cloudinary Admin API: metadata update
    // e.g. update structured metadata values on asset
    try {
      const metadataPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined) {
          metadataPayload[k] = v;
        }
      }
      // Note: Cloudinary Admin API uses update_metadata
      if (Object.keys(metadataPayload).length > 0) {
        await (cloudinary.uploader as any).update_metadata(metadataPayload, [publicId]);
      }
    } catch (err) {
      console.warn("Cloudinary updateMetadata warning:", err);
    }
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

  thumb(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    return cloudinary.url(publicIdOrUrl, {
      transformation: [
        { width: 400, height: 300, crop: "fill" },
        { fetch_format: "auto", quality: "auto" },
      ],
      secure: true,
    });
  }

  review(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    return cloudinary.url(publicIdOrUrl, {
      transformation: [
        { width: 1600, height: 1200, crop: "limit" },
        { fetch_format: "auto", quality: "auto" },
      ],
      secure: true,
    });
  }

  vlmCopy(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    return cloudinary.url(publicIdOrUrl, {
      transformation: [
        { width: 1024, crop: "limit" },
        { fetch_format: "jpg", quality: "auto" },
      ],
      secure: true,
    });
  }

  fullOriginal(publicIdOrUrl: string): string {
    if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
    return cloudinary.url(publicIdOrUrl, {
      transformation: [{ fetch_format: "auto", quality: "auto" }],
      secure: true,
    });
  }
}

// =========================================================================
// SINGLETON FACTORY
// =========================================================================

let mediaInstance: MediaProvider | null = null;

export function getMediaProvider(): MediaProvider {
  if (!mediaInstance) {
    if (isCloudinaryConfigured) {
      mediaInstance = new CloudinaryMediaProvider();
    } else {
      mediaInstance = new MockMediaProvider();
    }
  }
  return mediaInstance;
}

/**
 * voice.ts — voice notes on findings (server side).
 *
 * The browser records audio (MediaRecorder) and, where supported, transcribes it with the
 * browser's own speech recognition. The audio goes straight to Cloudinary with a signature
 * scoped to one finding; before a note is posted the server confirms the upload exists in
 * that folder, is audio, and is at most MAX_SECONDS long.
 */

import { v2 as cloudinary } from "cloudinary";
import { isCloudinaryConfigured } from "./media";

export const VOICE_LANGS = ["en-IN", "hi-IN", "en-GB", "en-US"] as const;
export const MAX_SECONDS = 120;

export const voiceFolder = (propertyId: string, obsId: string) => `properties/${propertyId}/voice/${obsId}`;

/** Upload signature for one voice note (resource_type video = audio in Cloudinary). */
export function signVoiceUpload(propertyId: string, obsId: string) {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = voiceFolder(propertyId, obsId);
  const tags = "rentalmove,voice-note";
  // No notification_url: a voice note must never be registered as an inspection photo.
  const signature = cloudinary.utils.api_sign_request({ folder, tags, timestamp }, process.env.CLOUDINARY_API_SECRET!);
  return { signature, timestamp, apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME, folder, tags, resourceType: "video" };
}

/** Confirms an uploaded clip belongs to this finding and is short audio. */
export async function checkVoiceClip(propertyId: string, obsId: string, publicId: string): Promise<{ public_id: string; url: string; duration: number } | { error: string }> {
  if (!publicId.startsWith(`${voiceFolder(propertyId, obsId)}/`)) return { error: "Voice note was not uploaded for this finding." };
  if (!isCloudinaryConfigured()) return { error: "Voice notes need Cloudinary configured." };
  let r: any;
  try {
    // duration is only returned with media_metadata (checked against the live API).
    r = await cloudinary.api.resource(publicId, { resource_type: "video", media_metadata: true });
  } catch {
    return { error: "Voice note not found in storage." };
  }
  const duration = Number(r.duration ?? 0);
  if (!r.is_audio && !r.has_audio) return { error: "That upload is not audio." };
  if (!(duration > 0) || duration > MAX_SECONDS + 1) return { error: `Voice notes must be up to ${MAX_SECONDS} seconds.` };
  return { public_id: publicId, url: String(r.secure_url), duration: Math.round(duration * 10) / 10 };
}

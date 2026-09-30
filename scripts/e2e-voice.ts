/**
 * e2e-voice.ts — voice-note storage checks through real Cloudinary, without posting a comment.
 *
 *   npx tsx --env-file=.env scripts/e2e-voice.ts
 *
 * Uploads (signed, like the browser) a 2-second generated tone and a JPEG into one finding's
 * voice folder, then runs the server's checkVoiceClip on each: the tone must pass with its
 * duration, the image must be refused as "not audio". Uses fixed public ids, so reruns
 * overwrite instead of piling up. No thread comment is created.
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "../src/lib/db";
import { checkVoiceClip, signVoiceUpload } from "../src/lib/voice";
import { v2 as cloudinary } from "cloudinary";
import { ensureCloudinaryConfig } from "../src/lib/media";

function toneWav(seconds: number, rate = 16000): Buffer {
  const n = seconds * rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main() {
  ensureCloudinaryConfig();
  const P = "prop-381";
  const db = getDatabase();
  const insps = await db.getInspections(P);
  const assets = await db.getAssetsForInspections(insps.map((i) => i.id));
  const obs = (await db.getObservationsForAssets(assets.map((a) => a.id)))[0];
  const sig = signVoiceUpload(P, obs.id);
  let pass = 0;

  // Upload with exactly the browser's signed parameters (folder, tags, timestamp).
  const up = async (name: string, buf: Buffer, type: string, filename: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type }), filename);
    form.append("api_key", String(sig.apiKey)); form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature); form.append("folder", sig.folder); form.append("tags", sig.tags);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${name}/upload`, { method: "POST", body: form });
    const b: any = await r.json();
    if (!r.ok) throw new Error(b?.error?.message);
    return b;
  };

  const audio = await up("video", toneWav(2), "audio/wav", "tone.wav");
  const a = await checkVoiceClip(P, obs.id, audio.public_id);
  const okA = !("error" in a) && Math.abs(a.duration - 2) < 0.3;
  if (okA) pass++;
  console.log(`${okA ? "PASS" : "FAIL"}  2 s tone accepted: ${JSON.stringify(a)}`);

  const img = await up("video", fs.readFileSync(path.join(process.cwd(), "seed/images/2024/kitchen/cabinet-base-01.jpg")), "image/jpeg", "x.jpg").catch((e) => ({ error: String(e.message) }));
  if ("error" in img) {
    pass++;
    console.log(`PASS  image refused by Cloudinary as a video/audio upload: ${img.error}`);
  } else {
    const b = await checkVoiceClip(P, obs.id, img.public_id);
    const okB = "error" in b;
    if (okB) pass++;
    console.log(`${okB ? "PASS" : "FAIL"}  image in the voice folder refused: ${JSON.stringify(b)}`);
  }

  const foreign = await checkVoiceClip(P, "obs-other", audio.public_id);
  if ("error" in foreign) pass++;
  console.log(`${"error" in foreign ? "PASS" : "FAIL"}  clip checked against another finding refused: ${JSON.stringify(foreign)}`);

  // Remove only the test tone this script just uploaded (keeps the folder clean on reruns).
  await cloudinary.uploader.destroy(audio.public_id, { resource_type: "video" }).catch(() => {});
  console.log(`\n${pass}/3 as expected`);
  process.exit(pass === 3 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

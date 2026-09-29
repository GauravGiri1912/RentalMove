/**
 * env.ts — Server-side environment variable validation.
 *
 * Validates all required env vars at startup using Zod.
 * Throws a clear error at build/startup time if any required var is missing,
 * rather than failing silently at runtime.
 *
 * USAGE: Import this in any server-side file that needs env vars.
 * It will throw once on first import if config is invalid.
 */

import { z } from "zod";

const ServerEnvSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(10, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(10, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),

  // AI/Vision
  VISION_PROVIDER: z.enum(["groq", "mock"]).default("mock"),
  GROQ_API_KEY: z.string().optional(),

  // App URL
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),

  // Node Environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _validatedEnv: ServerEnv | null = null;

export function getValidatedEnv(): ServerEnv {
  if (_validatedEnv) return _validatedEnv;

  const result = ServerEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    console.error(
      `\n[RentalMove] ❌ Environment variable validation failed:\n${missing}\n` +
        `\nCopy .env.local.example to .env.local and fill in the required values.\n`
    );

    // In production, throw hard — don't run with broken config
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required environment variables. See server logs for details.`
      );
    }

    // In dev, warn but continue with what we have
    _validatedEnv = result.data || ({} as ServerEnv);
  } else {
    _validatedEnv = result.data;
  }

  return _validatedEnv;
}

/**
 * Boolean helper: is Supabase properly configured (non-placeholder creds)?
 */
export function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return (
    url.startsWith("https://") &&
    url.includes(".supabase.co") &&
    key.length > 20
  );
}

/**
 * Boolean helper: is Cloudinary properly configured?
 */
export function isCloudinaryReady(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

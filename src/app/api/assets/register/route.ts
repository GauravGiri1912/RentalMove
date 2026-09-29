import { NextRequest, NextResponse } from "next/server";
import { AssetRegisterRequestSchema } from "@/lib/schemas";
import { registerAsset } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = AssetRegisterRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid asset registration payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const asset = await registerAsset(parsed.data);
    return NextResponse.json(asset, { status: 201 });
  } catch (err: any) {
    console.error("Asset registration error:", err);
    return NextResponse.json(
      { error: "Failed to register asset", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

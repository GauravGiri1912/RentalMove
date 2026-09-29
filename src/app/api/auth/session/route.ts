import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const db = getDatabase();
    const userIdCookie = req.cookies.get("rentalmove_session_user_id")?.value;

    let user = null;
    if (userIdCookie) {
      user = await db.getUser(userIdCookie);
    }

    // Default to tenant demo user if not logged in yet
    if (!user) {
      user = await db.getUser("user-tenant-1");
    }

    return NextResponse.json({
      authenticated: Boolean(user),
      user,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to get session", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDatabase();

    let user = null;
    if (body.userId) {
      user = await db.getUser(body.userId);
    } else if (body.email) {
      user = await db.getUserByEmail(body.email);
    } else if (body.role === "owner") {
      user = await db.getUser("user-owner-1");
    } else {
      user = await db.getUser("user-tenant-1");
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json({
      success: true,
      user,
    });

    res.cookies.set("rentalmove_session_user_id", user.id, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: "Authentication failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.delete("rentalmove_session_user_id");
  return res;
}

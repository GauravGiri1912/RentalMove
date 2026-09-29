import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const db = getDatabase();

    // If no active session, provide available demo accounts for 1-click switch
    if (!user) {
      const demoUsers = await db.listUsers();
      return NextResponse.json({
        authenticated: false,
        user: null,
        availableDemoAccounts: demoUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        })),
      });
    }

    return NextResponse.json({
      authenticated: true,
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
    } else if (body.role === "tenant") {
      user = await db.getUser("user-tenant-1");
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Server-side source of truth: user.role is retrieved from the database, NOT client input
    const res = NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assigned_property_id: user.assigned_property_id,
        owned_properties: user.owned_properties,
      },
    });

    res.cookies.set("rentalmove_session_user_id", user.id, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: false,
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

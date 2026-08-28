import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, checkAdminPassword, signAdminSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 500 });
  }

  const isValid = await checkAdminPassword(password);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const session = await signAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60
  });

  return response;
}

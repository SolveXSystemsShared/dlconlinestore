import { NextResponse } from "next/server"
import { AGE_COOKIE } from "@/lib/member-access"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
  return response
}

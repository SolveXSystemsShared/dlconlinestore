import { NextResponse } from "next/server"
import { getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { forgetMember } from "@/lib/member-session"

/**
 * Signs this browser out: the member cookie is cleared (it is HTTP-only, so
 * only the server can), and the cached session is forgotten. The 18+
 * confirmation stays — the visitor is still an adult, just not signed in.
 */
export async function POST() {
  const access = await getMemberAccess()
  if (access.memberId) forgetMember(access.memberId)
  const response = NextResponse.json({ ok: true })
  response.cookies.set({ name: MEMBER_COOKIE, value: "", path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
  return response
}

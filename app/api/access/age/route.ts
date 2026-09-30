import { NextResponse } from "next/server"
import { AGE_COOKIE, getMemberAccess } from "@/lib/member-access"
import { activeMemberFor } from "@/lib/member-session"

/**
 * Records the 18+ confirmation, and answers the gate's next question in the
 * same round trip: is this browser already signed in as an active member? On
 * a slow connection that saves a whole request after "Enter site".
 */
export async function POST() {
  const access = await getMemberAccess()
  let member = null
  if (access.memberId) {
    try { member = await activeMemberFor(access.memberId) } catch { member = null }
  }
  const response = NextResponse.json({ ok: true, ageConfirmed: true, member })
  response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
  return response
}

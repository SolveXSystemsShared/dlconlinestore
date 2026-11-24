import { NextResponse } from "next/server"
import { getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { activeMemberFor } from "@/lib/member-session"

/**
 * The gate's source of truth on page load.
 *
 * Always 200 with the full picture — `ageConfirmed` and either a verified
 * member or null — so a returning member with valid cookies is put straight
 * back into the member area instead of being asked to confirm their age and
 * re-enter a Member ID they already proved.
 *
 * No member is named until this browser has confirmed it is 18+, so the
 * member's name never reaches the age screen. The member cookie is left alone:
 * confirming age (POST /api/access/age) answers with the member, so a returning
 * member is let straight back in without a new PIN.
 */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed) {
    return NextResponse.json({ ageConfirmed: false, member: null })
  }
  if (!access.memberId) {
    return NextResponse.json({ ageConfirmed: access.ageConfirmed, member: null })
  }

  try {
    // Re-checked (at most a minute apart), so a membership deactivated in
    // CDASH loses access without waiting for the signed cookie to expire.
    const member = await activeMemberFor(access.memberId)
    if (!member) {
      // The cookie outlived the membership — drop it so the gate asks again
      // instead of re-checking a dead ID on every navigation.
      const response = NextResponse.json({ ageConfirmed: access.ageConfirmed, member: null })
      response.cookies.set({ name: MEMBER_COOKIE, value: "", path: "/", maxAge: 0 })
      return response
    }
    return NextResponse.json({ ageConfirmed: access.ageConfirmed, member })
  } catch (error) {
    console.error("Member session error", error)
    return NextResponse.json({ error: "Member session unavailable" }, { status: 500 })
  }
}

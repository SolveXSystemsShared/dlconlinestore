import { NextResponse } from "next/server"
import { getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { lookupMember } from "@/lib/members"

/**
 * The gate's source of truth on page load.
 *
 * Always 200 with the full picture — `ageConfirmed` and either a verified
 * member or null — so a returning member with valid cookies is put straight
 * back into the store instead of being asked to confirm their age and re-enter
 * a Member ID they already proved.
 */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.memberId) {
    return NextResponse.json({ ageConfirmed: access.ageConfirmed, member: null })
  }

  try {
    // Re-checked on every page load, so a membership deactivated in CDASH loses
    // store access without waiting for the signed cookie to expire.
    const member = await lookupMember(access.memberId)
    if (!member.found || member.verdict !== "active") {
      // The cookie outlived the membership — drop it so the gate asks again
      // instead of re-checking a dead ID on every navigation.
      const response = NextResponse.json({ ageConfirmed: access.ageConfirmed, member: null })
      response.cookies.set({ name: MEMBER_COOKIE, value: "", path: "/", maxAge: 0 })
      return response
    }
    return NextResponse.json({
      ageConfirmed: access.ageConfirmed,
      member: { memberId: member.memberId, name: member.name },
    })
  } catch (error) {
    console.error("Member session error", error)
    return NextResponse.json({ error: "Member session unavailable" }, { status: 500 })
  }
}

/**
 * Sign out of the member session.
 *
 * Clears the Member ID cookie only. The 18+ confirmation is a property of the
 * device rather than the person, so it stays — which drops the next person on
 * the Member ID step instead of making them confirm their age again on a
 * machine where that has already been answered.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({ name: MEMBER_COOKIE, value: "", path: "/", maxAge: 0 })
  return response
}

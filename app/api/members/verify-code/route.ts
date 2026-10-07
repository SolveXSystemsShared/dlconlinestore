import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { AGE_COOKIE, createMemberAccessToken, getMemberAccess, MEMBER_COOKIE, MEMBER_SESSION_SECONDS } from "@/lib/member-access"
import { lookupMember, memberLookupMessage } from "@/lib/members"
import { clearFailures, clientKey, lockedFor, recordFailure } from "@/lib/rate-limit"
import { checkMessage, checkSigninCode } from "@/lib/signin-code"

const input = z.object({ memberId: z.string().min(4).max(40), pin: z.string().regex(/^\d{6}$/) })

/**
 * Step two of signing in: the PIN from the SMS. Only here is the signed member
 * cookie set. The membership is looked up again so one stopped in CDASH
 * between the two steps does not get in.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })
    const client = clientKey(request)
    const wait = lockedFor(client)
    if (wait) return NextResponse.json({ error: `Too many attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}, or ask the team at the lounge.` }, { status: 429, headers: { "Retry-After": String(wait * 60) } })

    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit PIN from your SMS" }, { status: 400 })

    const member = await lookupMember(parsed.data.memberId)
    if (!member.found || member.verdict !== "active") {
      recordFailure(client)
      return NextResponse.json({ error: memberLookupMessage(member) || "That membership cannot sign in." }, { status: member.found ? 403 : 404 })
    }

    const result = await checkSigninCode(member.memberId, parsed.data.pin)
    if (!result.ok) {
      recordFailure(client)
      return NextResponse.json({ error: checkMessage(result), reason: result.reason }, { status: 401 })
    }

    clearFailures(client)
    const response = NextResponse.json({ member: { memberId: member.memberId, name: member.name } })
    response.cookies.set({ name: MEMBER_COOKIE, value: createMemberAccessToken(member.memberId), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: MEMBER_SESSION_SECONDS, path: "/" })
    response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
    return response
  } catch (error) {
    console.error("Member PIN check error", error)
    return NextResponse.json({ error: "We could not check your PIN just now. Please try again." }, { status: 500 })
  }
}

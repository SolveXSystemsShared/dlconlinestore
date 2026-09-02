import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { AGE_COOKIE, createMemberAccessToken, getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { lookupMember, memberLookupMessage } from "@/lib/members"

const input = z.object({ memberId: z.string().min(4).max(40) })

export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid DLC Member ID" }, { status: 400 })

    const member = await lookupMember(parsed.data.memberId)
    if (!member.found) return NextResponse.json({ error: memberLookupMessage(member) }, { status: 404 })
    // A pending or stopped membership exists but may not shop. 403 separates
    // "we know you, but not yet" from the 404 above.
    if (member.verdict !== "active") {
      return NextResponse.json({ error: memberLookupMessage(member) }, { status: 403 })
    }

    const response = NextResponse.json({ member: { memberId: member.memberId, name: member.name } })
    response.cookies.set({ name: MEMBER_COOKIE, value: createMemberAccessToken(member.memberId), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" })
    response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
    return response
  } catch (error) {
    console.error("Member verification error", error)
    return NextResponse.json({ error: "Member verification is unavailable" }, { status: 500 })
  }
}

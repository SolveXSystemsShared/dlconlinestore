import { NextResponse } from "next/server"
import { getMemberAccess } from "@/lib/member-access"
import { lookupMember } from "@/lib/members"

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    // Re-checked on every page load, so a membership deactivated in CDASH loses
    // store access without waiting for the signed cookie to expire.
    const member = await lookupMember(access.memberId)
    if (!member.found || member.verdict !== "active") {
      return NextResponse.json({ error: "Active DLC member not found" }, { status: 401 })
    }
    return NextResponse.json({ member: { memberId: member.memberId, name: member.name } })
  } catch (error) {
    console.error("Member session error", error)
    return NextResponse.json({ error: "Member session unavailable" }, { status: 500 })
  }
}

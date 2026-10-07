import { NextResponse } from "next/server"
import { getMemberAccess } from "@/lib/member-access"
import { getSpecials } from "@/lib/specials"

/** Active in-store specials at the lounge, for the Specials page. */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  try {
    return NextResponse.json({ specials: await getSpecials() })
  } catch (error) {
    console.error("Specials error", error)
    return NextResponse.json({ error: "Could not load the in-store specials" }, { status: 500 })
  }
}

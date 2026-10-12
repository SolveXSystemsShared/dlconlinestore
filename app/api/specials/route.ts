import { NextResponse } from "next/server"
import { requireActiveMember } from "@/lib/member-session"
import { getSpecials } from "@/lib/specials"

/** Active in-store specials at the lounge, for the Specials page. */
export async function GET() {
  const gate = await requireActiveMember()
  if (!gate.ok) return gate.response
  const access = gate
  try {
    return NextResponse.json({ specials: await getSpecials() })
  } catch (error) {
    console.error("Specials error", error)
    return NextResponse.json({ error: "Could not load the in-store specials" }, { status: 500 })
  }
}

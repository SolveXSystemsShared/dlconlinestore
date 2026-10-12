import { NextResponse } from "next/server"
import { getLoungeInfo } from "@/lib/lounge"
import { requireActiveMember } from "@/lib/member-session"

/** Lounge packages, free access and console time, for the Packages page. */
export async function GET() {
  const gate = await requireActiveMember()
  if (!gate.ok) return gate.response
  const access = gate
  try {
    return NextResponse.json(await getLoungeInfo())
  } catch (error) {
    console.error("Lounge info error", error)
    return NextResponse.json({ error: "Could not load the lounge packages" }, { status: 500 })
  }
}

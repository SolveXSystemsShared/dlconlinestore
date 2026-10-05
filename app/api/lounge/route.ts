import { NextResponse } from "next/server"
import { getLoungeInfo } from "@/lib/lounge"
import { getMemberAccess } from "@/lib/member-access"

/** Lounge packages, free access and console time, for the Packages page. */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  try {
    return NextResponse.json(await getLoungeInfo())
  } catch (error) {
    console.error("Lounge info error", error)
    return NextResponse.json({ error: "Could not load the lounge packages" }, { status: 500 })
  }
}

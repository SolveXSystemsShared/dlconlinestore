import { NextResponse } from "next/server"
import { getMemberAccess } from "@/lib/member-access"
import { getCollectionPoint } from "@/lib/store-settings"

/** The store members collect from, for the bag. Members only, like the rest of the store. */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  return NextResponse.json({ collectionPoint: await getCollectionPoint() })
}

import { NextResponse } from "next/server"
import { requireActiveMember } from "@/lib/member-session"
import { getCollectionPoint } from "@/lib/store-settings"

/** The store members collect from, for the bag. Members only, like the rest of the store. */
export async function GET() {
  const gate = await requireActiveMember()
  if (!gate.ok) return gate.response
  const access = gate
  return NextResponse.json({ collectionPoint: await getCollectionPoint() })
}

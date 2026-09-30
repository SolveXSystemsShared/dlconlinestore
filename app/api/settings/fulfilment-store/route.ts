import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { lookupMember } from "@/lib/members"
import { clearFulfillmentStoreCache, getFulfillmentStoreId } from "@/lib/store-settings"

const input = z.object({ storeId: z.string().min(1).max(64) })

/**
 * Which store fulfils online orders — read and changed by directors.
 *
 * This was an environment variable, so moving online fulfilment between stores
 * meant a redeploy and directors could not do it themselves. It is a database
 * row now, and this is the control over it.
 *
 * The gate is the caller's CDASH role, resolved from the signed member cookie
 * through the same lookup the door uses. Only a director qualifies: the setting
 * decides which team's pending queue every online order lands in, and which
 * store's shelf the catalogue advertises.
 */
async function requireDirector() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return { ok: false as const, response: NextResponse.json({ error: "Sign in with your DLC Member ID first" }, { status: 401 }) }
  const member = await lookupMember(access.memberId)
  if (!member.found || member.source !== "staff" || (member.role || "").toLowerCase() !== "director") {
    return { ok: false as const, response: NextResponse.json({ error: "Only DLC directors can change online fulfilment" }, { status: 403 }) }
  }
  return { ok: true as const, member }
}

export async function GET() {
  const gate = await requireDirector()
  if (!gate.ok) return gate.response

  // Read-only against CDASH's store list, so the picker can never offer a store
  // that does not exist.
  const { data: stores, error } = await getSupabaseAdmin().from("stores").select("id, name").order("name")
  if (error) {
    console.error("Store list error", error)
    return NextResponse.json({ error: "Could not load stores" }, { status: 500 })
  }
  return NextResponse.json({ fulfillmentStoreId: await getFulfillmentStoreId(), stores: stores || [] })
}

export async function PUT(request: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.response
  const parsed = input.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Choose a store" }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: store } = await supabase.from("stores").select("id, name").eq("id", parsed.data.storeId).maybeSingle()
  if (!store) return NextResponse.json({ error: "That store does not exist" }, { status: 404 })

  const { error } = await supabase
    .from("online_store_settings")
    .upsert({ id: true, fulfillment_store_id: store.id, updated_by: gate.member.memberId }, { onConflict: "id" })
  if (error) {
    console.error("Fulfilment store update failed", error)
    return NextResponse.json({ error: "Could not save the fulfilment store" }, { status: 500 })
  }

  // The setting is cached for half a minute; a director who just changed it
  // should see the new answer immediately, not eventually.
  clearFulfillmentStoreCache()
  return NextResponse.json({ fulfillmentStoreId: store.id, storeName: store.name })
}

import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

/**
 * Rebuilds online_products from CDASH inventory.
 *
 * A database trigger on inventory_items already runs this whenever stock
 * moves, so this route exists for the cases the trigger cannot cover: a first
 * seed, a scheduled safety net, or a resync after the trigger was dropped.
 *
 * Auth: send CATALOG_SYNC_TOKEN as `x-sync-token` or `Authorization: Bearer`.
 * Fails closed when the variable is unset, so it can never sit open.
 */
function tokenMatches(request: NextRequest, expected: string) {
  const header = request.headers.get("x-sync-token")
  const auth = request.headers.get("authorization")
  const provided = (header || (auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : "") || "").trim()
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const expected = process.env.CATALOG_SYNC_TOKEN
  if (!expected) return NextResponse.json({ error: "Catalogue sync is not configured on the server" }, { status: 503 })
  if (!tokenMatches(request, expected)) return NextResponse.json({ error: "Invalid or missing sync token" }, { status: 401 })

  try {
    const { data, error } = await getSupabaseAdmin().rpc("sync_online_products")
    if (error) throw new Error(error.message)
    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ inserted: result?.inserted ?? 0, updated: result?.updated ?? 0 })
  } catch (error) {
    console.error("Catalogue sync error", error)
    return NextResponse.json({ error: "Catalogue sync failed" }, { status: 500 })
  }
}

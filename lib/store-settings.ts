import { getSupabaseAdmin } from "./supabase-admin"

/**
 * Which CDASH store fulfils online orders.
 *
 * This used to be DEFAULT_STORE_ID, an environment variable, which meant moving
 * online fulfilment between stores was a redeploy and directors could not do it
 * at all. It lives in `online_store_settings` now — one row, changed from the
 * dashboard — and the environment variable survives only as the fallback for an
 * environment that has not run the migration yet.
 *
 * It governs more than the order stamp: the catalogue, the stock the store is
 * willing to sell and the store new members are registered against all follow
 * the same answer, because a shopper must never be shown stock that the
 * fulfilling store cannot pick.
 */

const SETTINGS_TTL_MS = 30_000

let cached: { storeId: string | null; readAt: number } | null = null

/**
 * The fulfilment store id, or null if nobody has chosen one.
 *
 * Cached for half a minute. The setting changes about once a year; reading it
 * on every catalogue request would add a round trip to every page for nothing.
 * A director's change is live within the TTL.
 */
export async function getFulfillmentStoreId(): Promise<string | null> {
  if (cached && Date.now() - cached.readAt < SETTINGS_TTL_MS) return cached.storeId

  let storeId: string | null = null
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("online_store_settings")
      .select("fulfillment_store_id")
      .eq("id", true)
      .maybeSingle()
    if (error) throw error
    storeId = (data?.fulfillment_store_id as string | null) ?? null
  } catch (error) {
    // An unreadable settings row must not take the storefront down: fall back to
    // the environment and say so, rather than serving an unscoped catalogue.
    console.error("Fulfilment store setting could not be read; falling back to DEFAULT_STORE_ID", error)
    storeId = null
  }

  const resolved = storeId || process.env.DEFAULT_STORE_ID?.trim() || null
  cached = { storeId: resolved, readAt: Date.now() }
  return resolved
}

/** Drops the cache so a change made through the settings API is visible at once. */
export function clearFulfillmentStoreCache() {
  cached = null
}

/**
 * The fulfilment store, insisting there is one.
 *
 * Order creation cannot guess: an order stamped with the wrong store is picked
 * by staff who were not expecting it, and one stamped with no store appears in
 * nobody's pending queue at all.
 */
export async function requireFulfillmentStoreId(): Promise<string> {
  const storeId = await getFulfillmentStoreId()
  if (!storeId) throw new Error("No fulfilment store is configured for online orders")
  return storeId
}

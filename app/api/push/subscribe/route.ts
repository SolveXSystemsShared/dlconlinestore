import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"

// A browser's own push service address, and the two keys it handed back.
const subscription = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
})

const MAX_DEVICES = 10

/**
 * Turns updates on for this device. Scoped to the signed-in member from the
 * cookie, never to an id the caller sends, so nobody can subscribe a device to
 * someone else's exchange updates.
 */
export async function POST(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  const parsed = z.object({ subscription }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "That device could not be registered" }, { status: 400 })

  const { endpoint, keys } = parsed.data.subscription
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("store_push_subscriptions").upsert({
    endpoint,
    member_id: access.memberId,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" })
  if (error) {
    console.error("Push subscribe error", error)
    return NextResponse.json({ error: "Could not turn on updates just now" }, { status: 500 })
  }

  // Keep the newest devices; a member who reinstalls often should not pile up rows.
  const { data: rows } = await supabase.from("store_push_subscriptions").select("endpoint").eq("member_id", access.memberId).order("last_seen_at", { ascending: false })
  const stale = (rows || []).slice(MAX_DEVICES).map((row) => row.endpoint)
  if (stale.length) await supabase.from("store_push_subscriptions").delete().in("endpoint", stale)

  return NextResponse.json({ ok: true })
}

/** Turns updates off for this device. */
export async function DELETE(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "That device could not be found" }, { status: 400 })
  const { error } = await getSupabaseAdmin().from("store_push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("member_id", access.memberId)
  if (error) return NextResponse.json({ error: "Could not turn off updates just now" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { requireActiveMember } from "@/lib/member-session"
import { isPreviewMode } from "@/lib/preview"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { MEMBER_ID_COLUMN } from "@/lib/members-schema"

/**
 * The signed-in member's own referral code, for the Referrals page.
 *
 * CDASH generates the code when a member is created and keeps it in
 * members.referral_code; this only reads it. Staff accounts have no members
 * row, so they get null and the page says to ask the team.
 */
export async function GET() {
  const gate = await requireActiveMember()
  if (!gate.ok) return gate.response
  const access = gate
  if (isPreviewMode()) return NextResponse.json({ code: "K7RB4Q" })
  try {
    const { data, error } = await getSupabaseAdmin().from("members").select("referral_code").ilike(MEMBER_ID_COLUMN, access.memberId).maybeSingle()
    if (error) throw error
    return NextResponse.json({ code: (data?.referral_code as string | null) ?? null })
  } catch (error) {
    console.error("Referral code error", error)
    return NextResponse.json({ error: "Could not load your referral code" }, { status: 500 })
  }
}

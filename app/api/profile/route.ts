import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { MEMBER_ID_COLUMN } from "@/lib/members-schema"
import { getMemberProfile, logProfileUpdate } from "@/lib/profile"
import { parseSaMobile, phoneKey } from "@/lib/phone"
import { sendSms } from "@/lib/sms"

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const profile = await getMemberProfile(access.memberId)
    if (!profile) return NextResponse.json({ error: "Member not found" }, { status: 404 })
    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Profile load error", error)
    return NextResponse.json({ error: "Could not load your profile" }, { status: 500 })
  }
}

// Only the details a member may reasonably correct about themselves. Name, ID
// number and date of birth are identity, tied to the application they signed,
// and stay with the team.
const patchInput = z.object({
  email: z.string().trim().email().max(160).optional(),
  mobileNumber: z.string().trim().min(7).max(30).optional(),
  residentialAddress: z.string().trim().min(6).max(500).optional(),
  marketingOptIn: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })

  try {
    const parsed = patchInput.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the details you entered" }, { status: 400 })
    }
    const body = parsed.data
    if (Object.keys(body).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { data: current, error: currentError } = await supabase
      .from("members")
      .select(`id, ${MEMBER_ID_COLUMN}, email, mobile_number, residential_address, marketing_opt_in`)
      .ilike(MEMBER_ID_COLUMN, access.memberId)
      .maybeSingle()
    if (currentError) throw currentError
    // CDASH staff shopping on a users.member_number have no membership row.
    // Creating one here would invent a membership nobody applied for.
    if (!current) {
      return NextResponse.json({ error: "Your details are held on your staff account. Please ask the team to update them." }, { status: 409 })
    }
    const row = current as unknown as Record<string, string | boolean | null>

    const update: Record<string, string | boolean> = {}
    const changed: Record<string, { from: unknown; to: unknown }> = {}

    if (body.email !== undefined) {
      const email = body.email.toLowerCase()
      if (email !== row.email) {
        // Email is UNIQUE in CDASH. Catching it here gives the member a useful
        // sentence instead of a raw constraint violation.
        const { data: taken, error: takenError } = await supabase.from("members").select("id").eq("email", email).neq("id", row.id as string).limit(1)
        if (takenError) throw takenError
        if (taken?.length) return NextResponse.json({ error: "That email is already registered to another member." }, { status: 409 })
        update.email = email
        changed.email = { from: row.email, to: email }
      }
    }

    // The sign-in PIN is texted to this number, so a new one gets the same check
    // as registration: a real South African mobile, saved as +27… like CDASH
    // saves it. The form always sends the number, so one left as it was passes
    // untouched even if it predates these rules.
    if (body.mobileNumber !== undefined && body.mobileNumber !== row.mobile_number && !parseSaMobile(body.mobileNumber)) {
      return NextResponse.json({ error: "Enter a valid South African mobile number, like 082 123 4567." }, { status: 400 })
    }
    const mobile = body.mobileNumber === undefined || body.mobileNumber === row.mobile_number ? null : parseSaMobile(body.mobileNumber)!.stored
    if (mobile && phoneKey(mobile) !== phoneKey(row.mobile_number as string | null)) {
      // Compared by key, as registration does: older members carry both the
      // 082… and +27… forms, so an exact match would miss the other spelling.
      const key = phoneKey(mobile)
      const { data: sameEnding, error: takenError } = await supabase.from("members").select("id, mobile_number").ilike("mobile_number", `%${key.slice(-3)}%`).neq("id", row.id as string)
      if (takenError) throw takenError
      if ((sameEnding || []).some((other) => phoneKey(other.mobile_number as string | null) === key)) {
        return NextResponse.json({ error: "That phone number is already registered to another member." }, { status: 409 })
      }
      update.mobile_number = mobile
      changed.mobileNumber = { from: row.mobile_number, to: mobile }
    }

    if (body.residentialAddress !== undefined && body.residentialAddress !== row.residential_address) {
      update.residential_address = body.residentialAddress
      changed.residentialAddress = { from: row.residential_address, to: body.residentialAddress }
    }

    if (body.marketingOptIn !== undefined && body.marketingOptIn !== row.marketing_opt_in) {
      update.marketing_opt_in = body.marketingOptIn
      update.marketing_opt_in_at = new Date().toISOString()
      update.marketing_opt_in_source = "online_store"
      changed.marketingOptIn = { from: row.marketing_opt_in, to: body.marketingOptIn }
    }

    if (Object.keys(changed).length === 0) {
      const profile = await getMemberProfile(access.memberId)
      return NextResponse.json({ profile, unchanged: true })
    }

    // member_id is never touched: a CDASH trigger rejects any attempt to change
    // it, and changing a mobile number does not re-derive it.
    const { error } = await supabase.from("members").update(update).eq("id", row.id as string)
    if (error) throw error

    await logProfileUpdate(row.id as string, access.memberId, changed)
    // The sign-in PIN now goes to the new number. Tell the old one, so someone
    // who took over a signed-in browser cannot quietly keep the account.
    if (changed.mobileNumber && row.mobile_number) {
      await sendSms(row.mobile_number as string, "Your DLC sign-in number was just changed on the website. If this was not you, contact the DLC team straight away.")
        .catch((smsError) => console.error("Number change notice failed for", access.memberId, smsError))
    }
    const profile = await getMemberProfile(access.memberId)
    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Profile update error", error)
    return NextResponse.json({ error: "Could not save your details" }, { status: 500 })
  }
}

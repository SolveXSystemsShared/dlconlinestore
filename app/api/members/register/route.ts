import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { AGE_COOKIE, getMemberAccess } from "@/lib/member-access"
import { notifyStaff } from "@/lib/notify-staff"
import { isPreviewMode } from "@/lib/preview"
import { validateSaId } from "@/lib/sa-id"
import { clientKey, lockedFor, recordFailure } from "@/lib/rate-limit"
import { parseSaMobile, phoneKey } from "@/lib/phone"
import { maskMobile, sendSms } from "@/lib/sms"
import {
  ageInYears,
  MEMBER_ID_COLUMN,
  ONLINE_MARKETING_SOURCE,
  ONLINE_REGISTRATION_SOURCE,
  ONLINE_REGISTRATION_STATUS,
} from "@/lib/members-schema"
import { getFulfillmentStoreId } from "@/lib/store-settings"
import { AcceptanceNotRecorded, acceptanceInput, linkAcceptance, recordAcceptance, staleTermsMessage } from "@/lib/acceptance"

const input = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  // The sign-in PIN is texted to this number, so it must be a real South African
  // mobile — not just something that looks like a phone number.
  mobileNumber: z.string().trim().max(30).refine((value) => parseSaMobile(value) !== null, {
    message: "Enter a valid South African mobile number, like 082 123 4567. Your login PIN is sent to it by SMS.",
  }),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  idNumber: z.string().trim().max(40).optional().default(""),
  foreignPassport: z.string().trim().max(40).optional().default(""),
  residentialAddress: z.string().trim().min(6).max(500),
  digitalSignature: z.string().min(64).max(600_000),
  // Consent is recorded as an explicit true/false, never left NULL — CDASH
  // reads NULL as "never asked" and re-prompts at the exchange counter.
  marketingOptIn: z.boolean().optional().default(false),
  // Optional: the code of the member who referred this person.
  referralCode: z.string().trim().max(40).optional().default(""),
  ...acceptanceInput,
}).refine((value) => value.idNumber.length > 0 || value.foreignPassport.length > 0, {
  message: "An ID number or passport number is required",
  path: ["idNumber"],
})

/**
 * Says a detail is already registered WITHOUT saying to whom. CDASH's staff
 * screen names the member and their Member ID; on the public registration page
 * that would hand a stranger someone's name and the only thing needed to sign
 * in as them, just for typing in their phone number or email.
 */
function duplicateMessage(field: string) {
  return `This ${field} is already registered with DLC. If it's yours, enter your Member ID at the gate, or ask the team at the lounge to help.`
}

export async function POST(request: NextRequest) {
  try {
    // The 18+ confirmation still gates registration, exactly as it gates the store.
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })

    // Every attempt counts, not just failures: the duplicate checks below say
    // whether a phone, email or ID is already a member, so unlimited tries
    // would let a script test details against the member list.
    const client = `register:${clientKey(request)}`
    const wait = lockedFor(client)
    if (wait) return NextResponse.json({ error: `Too many registration attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}, or ask the team at the lounge.` }, { status: 429, headers: { "Retry-After": String(wait * 60) } })
    recordFailure(client)

    const parsed = input.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the details you entered" }, { status: 400 })
    }
    const body = parsed.data
    const stale = staleTermsMessage(body.termsVersion)
    if (stale) return NextResponse.json({ error: stale, termsOutdated: true }, { status: 409 })

    // Server-side age check — the client date picker is a convenience, not a control.
    const age = ageInYears(body.dateOfBirth)
    if (age < 0) return NextResponse.json({ error: "Enter a valid date of birth" }, { status: 400 })
    if (age < 18) return NextResponse.json({ error: "You must be 18 or older to register" }, { status: 403 })
    if (age > 120) return NextResponse.json({ error: "Enter a valid date of birth" }, { status: 400 })

    // Same validator CDASH runs, so the storefront can never create a member
    // CDASH's own form would have turned away.
    let idNumber = body.idNumber
    if (idNumber) {
      const result = validateSaId(idNumber)
      if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 })
      idNumber = result.normalized
    }

    // CDASH derives member_id from the last four digits of the mobile number
    // (trigger_members_generate_member_id). Fewer than four digits makes the
    // trigger raise, so catch it here and say something useful.
    // Saved as +27…, the way CDASH saves it, so the next lookup, SMS and PIN all
    // see one format. Validated by the schema above, so this cannot be null.
    const mobile = parseSaMobile(body.mobileNumber)!
    const mobileDigits = mobile.stored.replace(/\D/g, "")

    const signatureDate = new Date().toISOString().slice(0, 10)
    const email = body.email.toLowerCase()

    if (isPreviewMode()) {
      const memberNumber = `DLC-${mobileDigits.slice(-4)}-01`
      await notifyStaff({
        event: "member.registration.created",
        title: `New online registration: ${body.fullName}`,
        detail: { memberNumber, email, mobile: mobile.stored, source: ONLINE_REGISTRATION_SOURCE },
      })
      return NextResponse.json({ memberNumber, memberName: body.fullName, status: ONLINE_REGISTRATION_STATUS, smsSentTo: maskMobile(mobile.stored), preview: true }, { status: 201 })
    }

    const supabase = getSupabaseAdmin()

    // The same duplicate gates CDASH applies, and every clashing field is
    // reported together so the form can mark them all at once. Email is the
    // only one the database enforces with a unique index; the rest are checked
    // here so the storefront cannot quietly create a second record for someone
    // who is already a member. A mobile is compared by `phoneKey`, because
    // older members carry both the 082… and +27… forms of the same number.
    // Like CDASH, only the FIELD is named — never whose record it is.
    const clashes: Array<{ field: "email" | "mobileNumber" | "idNumber" | "foreignPassport"; message: string }> = []
    const exact = async (column: string, value: string) => {
      const { data: existing, error: existingError } = await supabase.from("members").select("id").eq(column, value).limit(1)
      // Fail fast rather than risk creating a duplicate member.
      if (existingError) throw existingError
      return Boolean(existing?.length)
    }
    if (await exact("email", email)) clashes.push({ field: "email", message: duplicateMessage("email address") })
    const key = phoneKey(mobile.stored)
    const { data: sameEnding, error: phoneError } = await supabase.from("members").select("mobile_number").ilike("mobile_number", `%${key.slice(-3)}%`)
    if (phoneError) throw phoneError
    if ((sameEnding || []).some((row) => phoneKey(row.mobile_number as string | null) === key)) clashes.push({ field: "mobileNumber", message: duplicateMessage("phone number") })
    if (idNumber && (await exact("id_number", idNumber))) clashes.push({ field: "idNumber", message: duplicateMessage("ID number") })
    if (body.foreignPassport && (await exact("foreign_passport", body.foreignPassport))) clashes.push({ field: "foreignPassport", message: duplicateMessage("passport number") })
    if (clashes.length) return NextResponse.json({ error: clashes[0].message, clashes }, { status: 409 })

    // A referral code must belong to a real member; a mistyped one is caught
    // now, while the person who gave it is still there, as CDASH does.
    let referredByCode: string | null = null
    if (body.referralCode) {
      const code = body.referralCode.toUpperCase().replace(/[\s-]/g, "")
      const { data: referrer, error: referrerError } = await supabase.from("members").select("id").eq("referral_code", code).maybeSingle()
      if (referrerError) throw referrerError
      if (!referrer) return NextResponse.json({ error: `Referral code "${code}" doesn't match any member. Leave it blank if you're not sure.`, clashes: [{ field: "referralCode", message: "" }] }, { status: 400 })
      referredByCode = code
    }

    // Evidence before the member exists: if the acceptance cannot be written,
    // no membership record is created. member_id is linked once CDASH issues it.
    const acceptanceId = await recordAcceptance(request, { context: "registration", memberId: null })

    // New members belong to whichever store fulfils online orders, so a
    // storefront registration lands with the team who will actually serve them.
    const onlineStoreId = await getFulfillmentStoreId()

    // member_id is deliberately omitted: the CDASH trigger generates it as
    // DLC-<last 4 of mobile>-<random 01-99> and guarantees uniqueness. Reading
    // it back is what tells the customer their real Member ID.
    const { data: created, error } = await supabase
      .from("members")
      .insert({
        full_name: body.fullName,
        email,
        mobile_number: mobile.stored,
        date_of_birth: body.dateOfBirth,
        id_number: idNumber || null,
        foreign_passport: body.foreignPassport || null,
        residential_address: body.residentialAddress,
        digital_signature: body.digitalSignature,
        signature_date: signatureDate,
        registered_by: ONLINE_REGISTRATION_SOURCE,
        store_id: onlineStoreId,
        status: ONLINE_REGISTRATION_STATUS,
        marketing_opt_in: body.marketingOptIn,
        marketing_opt_in_at: new Date().toISOString(),
        marketing_opt_in_source: ONLINE_MARKETING_SOURCE,
        referred_by_code: referredByCode,
      })
      .select(`id, full_name, ${MEMBER_ID_COLUMN}`)
      .single()
    if (error) throw error

    const row = created as unknown as Record<string, string | null>
    const memberNumber = row[MEMBER_ID_COLUMN] ?? ""
    await linkAcceptance(acceptanceId, { memberId: memberNumber || undefined })

    // CDASH logs every member.create to audit_logs; storefront registrations
    // write the same row so they appear in the CDASH audit trail rather than
    // looking like members who materialised from nowhere.
    const { error: auditError } = await supabase.from("audit_logs").insert({
      action: "member.create",
      entity_type: "member",
      entity_id: row.id,
      user_id: null,
      user_name: ONLINE_REGISTRATION_SOURCE,
      user_role: null,
      store_id: onlineStoreId,
      details: {
        memberId: memberNumber,
        fullName: body.fullName,
        mobileNumber: mobile.stored,
        registrationMethod: "online_store",
        registeredBy: ONLINE_REGISTRATION_SOURCE,
        marketingOptIn: body.marketingOptIn,
      },
    })
    // The member exists either way — never fail a registration over its log line.
    if (auditError) console.error("Member registration audit log failed", auditError)

    const notified = await notifyStaff({
      event: "member.registration.created",
      title: `New online registration: ${body.fullName}`,
      detail: { memberNumber, email, mobile: mobile.stored, source: ONLINE_REGISTRATION_SOURCE },
    })

    // Tell the new member their Member ID by SMS, as CDASH's own form does. It is
    // also the first proof the number works, which matters because the sign-in
    // PIN goes to it. A failed send never undoes a registration: the ID is on
    // screen too.
    let smsSent = false
    try {
      await sendSms(mobile.stored, `Welcome to DLC, ${body.fullName.split(/\s+/)[0]}! Your Member ID is ${memberNumber}. Keep it safe: to sign in on the website, enter it and we will text a login PIN to this number.`)
      smsSent = true
    } catch (smsError) {
      console.error("Welcome SMS failed for", memberNumber, smsError)
    }

    // Not signed in here: the member comes back to the gate, enters this Member
    // ID and gets a PIN by SMS. That PIN is what proves the number works and is
    // theirs, so registration alone never opens the member area.
    const response = NextResponse.json(
      { memberNumber, memberName: row.full_name ?? body.fullName, status: ONLINE_REGISTRATION_STATUS, smsSentTo: maskMobile(mobile.stored), smsSent, staffNotified: notified.delivered },
      { status: 201 },
    )
    if (memberNumber) {
      response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
    }
    return response
  } catch (error) {
    if (error instanceof AcceptanceNotRecorded) {
      return NextResponse.json({ error: "We could not record your acceptance of the terms, so your application was not submitted. Please try again shortly." }, { status: 503 })
    }
    console.error("Member registration error", error)
    return NextResponse.json({ error: "Registration is unavailable right now. Please try again shortly." }, { status: 500 })
  }
}

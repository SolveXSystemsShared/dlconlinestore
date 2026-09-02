import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { AGE_COOKIE, createMemberAccessToken, getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { notifyStaff } from "@/lib/notify-staff"
import { isPreviewMode } from "@/lib/preview"
import { validateSaId } from "@/lib/sa-id"
import {
  ageInYears,
  MEMBER_ID_COLUMN,
  ONLINE_MARKETING_SOURCE,
  ONLINE_REGISTRATION_SOURCE,
  ONLINE_REGISTRATION_STATUS,
} from "@/lib/members-schema"

const input = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  mobileNumber: z.string().trim().min(7).max(30),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  idNumber: z.string().trim().max(40).optional().default(""),
  foreignPassport: z.string().trim().max(40).optional().default(""),
  residentialAddress: z.string().trim().min(6).max(500),
  digitalSignature: z.string().min(64).max(600_000),
  // Consent is recorded as an explicit true/false, never left NULL — CDASH
  // reads NULL as "never asked" and re-prompts at the exchange counter.
  marketingOptIn: z.boolean().optional().default(false),
}).refine((value) => value.idNumber.length > 0 || value.foreignPassport.length > 0, {
  message: "An ID number or passport number is required",
  path: ["idNumber"],
})

/** Mirrors CDASH's duplicate wording so a member sees one consistent message. */
function duplicateMessage(field: string, name: string, memberId: string | null) {
  return `This ${field} is already registered to ${name} (Member #${memberId ?? "unknown"}). Please use a different ${field}.`
}

export async function POST(request: NextRequest) {
  try {
    // The 18+ confirmation still gates registration, exactly as it gates the store.
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })

    const parsed = input.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the details you entered" }, { status: 400 })
    }
    const body = parsed.data

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
    const mobileDigits = body.mobileNumber.replace(/\D/g, "")
    if (mobileDigits.length < 4) return NextResponse.json({ error: "Enter a valid mobile number" }, { status: 400 })

    const signatureDate = new Date().toISOString().slice(0, 10)
    const email = body.email.toLowerCase()

    if (isPreviewMode()) {
      const memberNumber = `DLC-${mobileDigits.slice(-4)}-01`
      await notifyStaff({
        event: "member.registration.created",
        title: `New online registration: ${body.fullName}`,
        detail: { memberNumber, email, mobile: body.mobileNumber, source: ONLINE_REGISTRATION_SOURCE },
      })
      return NextResponse.json({ memberNumber, status: ONLINE_REGISTRATION_STATUS, preview: true }, { status: 201 })
    }

    const supabase = getSupabaseAdmin()

    // The same duplicate gates CDASH applies. Email is the only one the database
    // enforces with a unique index; mobile, ID and passport are checked here so
    // the storefront cannot quietly create a second record for someone who is
    // already a member.
    const duplicateChecks: Array<{ column: string; value: string; field: string }> = [
      { column: "email", value: email, field: "email address" },
      { column: "mobile_number", value: body.mobileNumber, field: "phone number" },
    ]
    if (idNumber) duplicateChecks.push({ column: "id_number", value: idNumber, field: "ID number" })
    if (body.foreignPassport) duplicateChecks.push({ column: "foreign_passport", value: body.foreignPassport, field: "passport number" })

    for (const check of duplicateChecks) {
      const { data: existing, error: existingError } = await supabase
        .from("members")
        .select(`${MEMBER_ID_COLUMN}, full_name`)
        .eq(check.column, check.value)
        .limit(1)
      // Fail fast rather than risk creating a duplicate member.
      if (existingError) throw existingError
      const match = existing?.[0] as unknown as Record<string, string | null> | undefined
      if (match) {
        return NextResponse.json(
          { error: duplicateMessage(check.field, match.full_name ?? "an existing member", match[MEMBER_ID_COLUMN]) },
          { status: 409 },
        )
      }
    }

    // member_id is deliberately omitted: the CDASH trigger generates it as
    // DLC-<last 4 of mobile>-<random 01-99> and guarantees uniqueness. Reading
    // it back is what tells the customer their real Member ID.
    const { data: created, error } = await supabase
      .from("members")
      .insert({
        full_name: body.fullName,
        email,
        mobile_number: body.mobileNumber,
        date_of_birth: body.dateOfBirth,
        id_number: idNumber || null,
        foreign_passport: body.foreignPassport || null,
        residential_address: body.residentialAddress,
        digital_signature: body.digitalSignature,
        signature_date: signatureDate,
        registered_by: ONLINE_REGISTRATION_SOURCE,
        store_id: process.env.DEFAULT_STORE_ID || null,
        status: ONLINE_REGISTRATION_STATUS,
        marketing_opt_in: body.marketingOptIn,
        marketing_opt_in_at: new Date().toISOString(),
        marketing_opt_in_source: ONLINE_MARKETING_SOURCE,
      })
      .select(`id, full_name, ${MEMBER_ID_COLUMN}`)
      .single()
    if (error) throw error

    const row = created as unknown as Record<string, string | null>
    const memberNumber = row[MEMBER_ID_COLUMN] ?? ""

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
      store_id: process.env.DEFAULT_STORE_ID || null,
      details: {
        memberId: memberNumber,
        fullName: body.fullName,
        mobileNumber: body.mobileNumber,
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
      detail: { memberNumber, email, mobile: body.mobileNumber, source: ONLINE_REGISTRATION_SOURCE },
    })

    // Registration is the member check — signing them in here is what makes
    // "register and shop" one journey instead of sending them back to the gate
    // to retype the ID they were handed a second ago.
    const response = NextResponse.json(
      { memberNumber, memberName: row.full_name ?? body.fullName, status: ONLINE_REGISTRATION_STATUS, staffNotified: notified.delivered },
      { status: 201 },
    )
    if (memberNumber) {
      response.cookies.set({ name: MEMBER_COOKIE, value: createMemberAccessToken(memberNumber), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" })
      response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
    }
    return response
  } catch (error) {
    console.error("Member registration error", error)
    return NextResponse.json({ error: "Registration is unavailable right now. Please try again shortly." }, { status: 500 })
  }
}

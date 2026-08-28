import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { notifyStaff } from "@/lib/notify-staff"
import { isPreviewMode } from "@/lib/preview"
import {
  ageInYears,
  MEMBER_ID_COLUMN,
  ONLINE_REGISTRATION_SOURCE,
  PENDING_STATUS,
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
}).refine((value) => value.idNumber.length > 0 || value.foreignPassport.length > 0, {
  message: "An ID number or passport number is required",
  path: ["idNumber"],
})

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

    // CDASH derives member_id from the last four digits of the mobile number
    // (trigger_members_generate_member_id). Fewer than four digits makes the
    // trigger raise, so catch it here and say something useful.
    const mobileDigits = body.mobileNumber.replace(/\D/g, "")
    if (mobileDigits.length < 4) return NextResponse.json({ error: "Enter a valid mobile number" }, { status: 400 })

    const signatureDate = new Date().toISOString().slice(0, 10)

    if (isPreviewMode()) {
      const memberNumber = `DLC-${mobileDigits.slice(-4)}-01`
      await notifyStaff({
        event: "member.registration.pending",
        title: `New online registration awaiting approval: ${body.fullName}`,
        detail: { memberNumber, email: body.email, mobile: body.mobileNumber, source: ONLINE_REGISTRATION_SOURCE },
      })
      return NextResponse.json({ memberNumber, status: PENDING_STATUS, preview: true }, { status: 201 })
    }

    const supabase = getSupabaseAdmin()

    // Email is unique in CDASH — fail with a useful message instead of a raw constraint error.
    const { data: existing, error: existingError } = await supabase
      .from("members")
      .select("email")
      .eq("email", body.email.toLowerCase())
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return NextResponse.json({ error: "That email is already registered. Ask the team to resend your Member ID." }, { status: 409 })
    }

    // member_id is deliberately omitted: the CDASH trigger generates it as
    // DLC-<last 4 of mobile>-<random 01-99> and guarantees uniqueness. Reading
    // it back is what tells the customer their real Member ID.
    const { data: created, error } = await supabase
      .from("members")
      .insert({
        full_name: body.fullName,
        email: body.email.toLowerCase(),
        mobile_number: body.mobileNumber,
        date_of_birth: body.dateOfBirth,
        id_number: body.idNumber || null,
        foreign_passport: body.foreignPassport || null,
        residential_address: body.residentialAddress,
        digital_signature: body.digitalSignature,
        signature_date: signatureDate,
        registered_by: ONLINE_REGISTRATION_SOURCE,
        status: PENDING_STATUS,
      })
      .select(MEMBER_ID_COLUMN)
      .single()
    if (error) throw error

    const memberNumber = (created as unknown as Record<string, string | null> | null)?.[MEMBER_ID_COLUMN] ?? ""

    // Registration succeeds even if the notification does not — staff can still
    // see the pending row in CDASH.
    const notified = await notifyStaff({
      event: "member.registration.pending",
      title: `New online registration awaiting approval: ${body.fullName}`,
      detail: { memberNumber, email: body.email, mobile: body.mobileNumber, source: ONLINE_REGISTRATION_SOURCE },
    })

    return NextResponse.json({ memberNumber, status: PENDING_STATUS, staffNotified: notified.delivered }, { status: 201 })
  } catch (error) {
    console.error("Member registration error", error)
    return NextResponse.json({ error: "Registration is unavailable right now. Please try again shortly." }, { status: 500 })
  }
}

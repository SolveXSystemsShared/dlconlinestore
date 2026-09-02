import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { toSavedAddress } from "@/lib/profile"

export const addressInput = z.object({
  label: z.string().trim().max(40).optional().default(""),
  recipient: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().default(""),
  suburb: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
  isDefault: z.boolean().optional().default(false),
})

/** Empty text fields are stored as NULL so "not given" reads the same everywhere. */
export function addressColumns(body: z.infer<typeof addressInput>) {
  return {
    label: body.label || null,
    recipient: body.recipient,
    phone: body.phone,
    line1: body.line1,
    line2: body.line2 || null,
    suburb: body.suburb || null,
    city: body.city || null,
    postal_code: body.postalCode || null,
    notes: body.notes || null,
  }
}

const SELECT = "id, label, recipient, phone, line1, line2, suburb, city, postal_code, notes, is_default"

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  const { data, error } = await getSupabaseAdmin()
    .from("online_member_addresses")
    .select(SELECT)
    .eq("member_id", access.memberId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) {
    console.error("Address list error", error)
    return NextResponse.json({ error: "Could not load your addresses" }, { status: 500 })
  }
  return NextResponse.json({ addresses: (data || []).map(toSavedAddress) })
}

export async function POST(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const parsed = addressInput.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the address" }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { count } = await supabase
      .from("online_member_addresses")
      .select("id", { count: "exact", head: true })
      .eq("member_id", access.memberId)

    // The first address saved is the default whether or not they ticked it —
    // otherwise checkout has an address book and nothing selected.
    const isDefault = parsed.data.isDefault || (count ?? 0) === 0
    // Only one row may carry the default flag, so stand the old one down first.
    // Clearing before setting means a failure leaves no default rather than two.
    if (isDefault) {
      const { error: clearError } = await supabase
        .from("online_member_addresses")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("member_id", access.memberId)
        .eq("is_default", true)
      if (clearError) throw clearError
    }

    const { data, error } = await supabase
      .from("online_member_addresses")
      .insert({ member_id: access.memberId, ...addressColumns(parsed.data), is_default: isDefault })
      .select(SELECT)
      .single()
    if (error) throw error
    return NextResponse.json({ address: toSavedAddress(data) }, { status: 201 })
  } catch (error) {
    console.error("Address create error", error)
    return NextResponse.json({ error: "Could not save that address" }, { status: 500 })
  }
}

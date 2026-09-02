import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { toSavedAddress } from "@/lib/profile"
import { addressColumns, addressInput } from "../route"

const SELECT = "id, label, recipient, phone, line1, line2, suburb, city, postal_code, notes, is_default"

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const parsed = addressInput.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the address" }, { status: 400 })

    const supabase = getSupabaseAdmin()
    // Scoped by member_id as well as id, so an address can only ever be edited
    // by the person it belongs to.
    const { data: existing, error: existingError } = await supabase
      .from("online_member_addresses").select("id").eq("id", id).eq("member_id", access.memberId).maybeSingle()
    if (existingError) throw existingError
    if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 })

    if (parsed.data.isDefault) {
      const { error: clearError } = await supabase
        .from("online_member_addresses")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("member_id", access.memberId).eq("is_default", true).neq("id", id)
      if (clearError) throw clearError
    }

    const { data, error } = await supabase
      .from("online_member_addresses")
      .update({ ...addressColumns(parsed.data), is_default: parsed.data.isDefault, updated_at: new Date().toISOString() })
      .eq("id", id).eq("member_id", access.memberId)
      .select(SELECT).single()
    if (error) throw error
    return NextResponse.json({ address: toSavedAddress(data) })
  } catch (error) {
    console.error("Address update error", error)
    return NextResponse.json({ error: "Could not save that address" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_member_addresses")
    .delete().eq("id", id).eq("member_id", access.memberId)
    .select("id, is_default").maybeSingle()
  if (error) {
    console.error("Address delete error", error)
    return NextResponse.json({ error: "Could not remove that address" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Address not found" }, { status: 404 })

  // Deleting the default would leave the member with an address book and no
  // selection, so the next most recent one takes over.
  if (data.is_default) {
    const { data: next } = await supabase
      .from("online_member_addresses").select("id").eq("member_id", access.memberId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (next) await supabase.from("online_member_addresses").update({ is_default: true }).eq("id", next.id)
  }
  return NextResponse.json({ ok: true })
}

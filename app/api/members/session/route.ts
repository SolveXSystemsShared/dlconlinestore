import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { isPreviewMode, PREVIEW_MEMBER } from "@/lib/preview"

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  if (isPreviewMode()) return NextResponse.json({ member: PREVIEW_MEMBER })
  const { data: member, error } = await getSupabaseAdmin().from("members").select("member_id, full_name, status").eq("member_id", access.memberId).maybeSingle()
  if (error) return NextResponse.json({ error: "Member session unavailable" }, { status: 500 })
  if (!member || member.status !== "active") return NextResponse.json({ error: "Active DLC member not found" }, { status: 401 })
  return NextResponse.json({ member: { memberId: member.member_id, name: member.full_name } })
}

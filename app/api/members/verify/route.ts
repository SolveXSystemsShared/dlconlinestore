import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { normalizeMemberId } from "@/lib/format"
import { AGE_COOKIE, createMemberAccessToken, getMemberAccess, MEMBER_COOKIE } from "@/lib/member-access"
import { isPreviewMode, PREVIEW_MEMBER } from "@/lib/preview"

const input = z.object({ memberId: z.string().min(4).max(40) })

export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid DLC Member ID" }, { status: 400 })
    const member = isPreviewMode()
      ? { member_id: PREVIEW_MEMBER.memberId, full_name: PREVIEW_MEMBER.name, status: "active" as const }
      : await (async () => {
          const supabase = getSupabaseAdmin()
          const { data, error } = await supabase.from("members").select("member_id, full_name, status").eq("member_id", normalizeMemberId(parsed.data.memberId)).maybeSingle()
          if (error) throw error
          return data
        })()
    if (!member || member.status !== "active") return NextResponse.json({ error: "Active DLC member not found" }, { status: 404 })
    const response = NextResponse.json({ member: { memberId: member.member_id, name: member.full_name } })
    response.cookies.set({ name: MEMBER_COOKIE, value: createMemberAccessToken(member.member_id), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" })
    response.cookies.set({ name: AGE_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" })
    return response
  } catch (error) {
    console.error("Member verification error", error)
    return NextResponse.json({ error: "Member verification is unavailable" }, { status: 500 })
  }
}

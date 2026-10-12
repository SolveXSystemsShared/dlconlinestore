import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireActiveMember } from "@/lib/member-session"
import { lookupMember } from "@/lib/members"
import { notifyStaff } from "@/lib/notify-staff"
import { clientKey, lockedFor, recordFailure, type Limit } from "@/lib/rate-limit"
import { maskMobile } from "@/lib/sms"

// One call back per member every half hour, and a few per address so one
// device cannot ring the team for a string of accounts.
const PER_MEMBER: Limit = { windowMs: 30 * 60 * 1000, max: 1 }
const PER_CLIENT: Limit = { windowMs: 30 * 60 * 1000, max: 3 }

const input = z.object({
  question: z.string().trim().max(200, "Please keep your question to 200 characters").optional().default(""),
})

/**
 * A signed-in member asks the team to phone them, from Cloudy. The name and
 * number come from the membership record, never from the browser.
 */
export async function POST(request: NextRequest) {
  const gate = await requireActiveMember({ fresh: true })
  if (!gate.ok) return gate.response

  const memberKey = `callback:member:${gate.memberId}`
  const ipKey = `callback:ip:${clientKey(request)}`
  const wait = Math.max(lockedFor(memberKey, PER_MEMBER), lockedFor(ipKey, PER_CLIENT))
  if (wait) {
    return NextResponse.json(
      { error: `You have already asked for a call back. The team will be in touch, or you can ask again in ${wait} minute${wait === 1 ? "" : "s"}.` },
      { status: 429, headers: { "retry-after": String(wait * 60) } },
    )
  }

  const parsed = input.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check your question" }, { status: 400 })
  }

  try {
    const found = await lookupMember(gate.memberId)
    const mobile = found.found ? found.mobile?.trim() : ""
    if (!found.found || !mobile) {
      return NextResponse.json({ error: "There is no mobile number on your membership. Please ask the team to add one when you next visit." }, { status: 409 })
    }

    recordFailure(memberKey, PER_MEMBER)
    recordFailure(ipKey, PER_CLIENT)
    await notifyStaff({
      event: "member.callback.requested",
      title: `${found.name || found.memberId} asked for a call back`,
      detail: { memberId: found.memberId, name: found.name || null, mobile, question: parsed.data.question || null },
    })
    return NextResponse.json({ ok: true, mobile: maskMobile(mobile) })
  } catch (error) {
    console.error("Call back request failed", gate.memberId, error)
    return NextResponse.json({ error: "We could not send that just now. Please try again in a moment." }, { status: 500 })
  }
}

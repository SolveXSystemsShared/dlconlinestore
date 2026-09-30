import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getMemberAccess } from "@/lib/member-access"
import { lookupMember, memberLookupMessage } from "@/lib/members"
import { clientKey, lockedFor, recordFailure } from "@/lib/rate-limit"
import { CODE_TTL_MINUTES, issueSigninCode, RESEND_AFTER_SECONDS } from "@/lib/signin-code"
import { maskMobile, sendSms } from "@/lib/sms"

const input = z.object({ memberId: z.string().min(4).max(40) })

/**
 * Step one of signing in: a Member ID in, a PIN out by SMS.
 *
 * The PIN goes to the mobile number CDASH holds for the member, never to a
 * number typed here, and nothing about the member (not even their name) comes
 * back until the PIN is checked by /api/members/verify-code. No cookie is set
 * at this step.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed) return NextResponse.json({ error: "Age confirmation is required first" }, { status: 403 })
    const client = clientKey(request)
    const wait = Math.max(lockedFor(client), lockedFor(`sms:${client}`))
    if (wait) return NextResponse.json({ error: `Too many attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}, or ask the team at the lounge.` }, { status: 429, headers: { "Retry-After": String(wait * 60) } })

    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid DLC Member ID" }, { status: 400 })

    const member = await lookupMember(parsed.data.memberId)
    if (!member.found) {
      recordFailure(client)
      return NextResponse.json({ error: memberLookupMessage(member) }, { status: 404 })
    }
    // A pending or stopped membership exists but may not shop. 403 separates
    // "we know you, but not yet" from the 404 above.
    if (member.verdict !== "active") {
      recordFailure(client)
      return NextResponse.json({ error: memberLookupMessage(member) }, { status: 403 })
    }
    if (!member.mobile || member.mobile.replace(/\D/g, "").length < 9) {
      return NextResponse.json({ error: "We do not have a mobile number for your membership, so we cannot send your PIN. Please ask the team at the lounge to add it." }, { status: 409 })
    }

    const issued = await issueSigninCode(member.memberId, client)
    if (!issued.ok) {
      if (issued.reason === "cooldown") {
        return NextResponse.json({ error: `A PIN was just sent. You can ask for another in ${issued.retryAfter} seconds.`, retryAfter: issued.retryAfter }, { status: 429 })
      }
      return NextResponse.json({ error: "Too many PINs sent to this membership in the last hour. Please try again later, or ask the team at the lounge." }, { status: 429 })
    }

    recordFailure(`sms:${client}`)
    await sendSms(member.mobile, `Your Down Low Cannabis sign-in PIN is ${issued.code}. It expires in ${CODE_TTL_MINUTES} minutes. Never share it - the DLC team will never ask for it.`)

    return NextResponse.json({ step: "pin", sentTo: maskMobile(member.mobile), expiresInMinutes: CODE_TTL_MINUTES, resendAfter: RESEND_AFTER_SECONDS })
  } catch (error) {
    console.error("Member sign-in PIN error", error)
    return NextResponse.json({ error: "We could not send your PIN just now. Please try again in a moment." }, { status: 500 })
  }
}

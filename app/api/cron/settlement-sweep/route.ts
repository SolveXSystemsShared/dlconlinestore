import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { runSettlementSweep } from "@/lib/settlement-sweep"

/**
 * Runs the settlement sweep (lib/settlement-sweep.ts) on a schedule.
 *
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET` (see
 * vercel.json). Any other scheduler can call it the same way, as often as every
 * few minutes. Member traffic also runs the sweep, so the schedule is a safety
 * net for quiet hours, not the only thing keeping settlements moving.
 *
 * Fails closed when CRON_SECRET is unset.
 */
export const maxDuration = 60

function authorised(request: NextRequest, expected: string) {
  const auth = request.headers.get("authorization") || ""
  const provided = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : ""
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return NextResponse.json({ error: "The settlement sweep is not configured on the server" }, { status: 503 })
  if (!authorised(request, expected)) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 })

  try {
    return NextResponse.json(await runSettlementSweep())
  } catch (error) {
    console.error("Settlement sweep failed", error)
    return NextResponse.json({ error: "Settlement sweep failed" }, { status: 500 })
  }
}

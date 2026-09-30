import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getMemberAccess } from "@/lib/member-access"
import { getFulfillmentStoreId } from "@/lib/store-settings"
import { CdashError, fetchQuote } from "@/lib/cdash"
import { resolveOrderLines } from "@/lib/order-lines"

const input = z.object({
  dlcCreditsRequested: z.number().min(0).max(100000).optional().default(0),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive().max(100) })).min(1).max(50),
})

/**
 * What the basket costs, for the checkout screen.
 *
 * This replaces the total the browser used to add up for itself. Neither a
 * client-side sum nor the catalogue subtotal is real under §7: the membership
 * discount, the card-XOR-cash split and the 20% DLC Credit cap all land
 * server-side, and only CDASH knows a member's tier.
 *
 * The member comes from the signed access cookie, never from the request body —
 * otherwise anyone could price a basket against someone else's tier and read
 * their credit balance off the response.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Please provide a valid bag" }, { status: 400 })

    const resolved = await resolveOrderLines(parsed.data.items, await getFulfillmentStoreId())
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const quote = await fetchQuote({
      memberId: access.memberId,
      dlcCreditsRequested: parsed.data.dlcCreditsRequested,
      lines: resolved.lines.map((line) => ({ type: line.productType, grade: line.grade, quantity: line.quantity, value: line.lineTotal })),
    })

    // Passed through as CDASH returned it, including authoritative:false. The
    // screen shows both channels because §7 rule 2 gives one discount, matching
    // how the member pays, and online that is only known at the door.
    return NextResponse.json({ quote })
  } catch (error) {
    if (error instanceof CdashError) {
      console.error("CDASH quote failed", error.status, error.message)
      return NextResponse.json({ error: "We could not work out the credits for your bag just now. Please try again." }, { status: error.status >= 500 ? 502 : error.status })
    }
    console.error("Quote error", error)
    return NextResponse.json({ error: "We could not work out the credits for your bag just now. Please try again." }, { status: 500 })
  }
}

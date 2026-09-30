import { notFound } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { credits, exchangeStatus } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"
import { StoreFooter, StoreHeader } from "@/components/store-header"

export const dynamic = "force-dynamic"

/**
 * Exchange request confirmation.
 *
 * The figures here are the quote taken at checkout, not a charge. CDASH prices
 * the order from its own inventory when it settles, and the membership discount
 * follows how the member actually pays (§7 rule 2) — which is why both totals
 * are shown rather than one that would be wrong half the time.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) notFound()
  const supabase = getSupabaseAdmin()
  const { data: order } = await supabase
    .from("online_orders")
    .select("id, order_number, status, subtotal, delivery_fee, total, member_name, created_at, exchange_id")
    .eq("id", id)
    .eq("member_id", access.memberId)
    .maybeSingle()
  if (!order) notFound()

  const placed = new Date(order.created_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="sf">
      <StoreHeader />
      <main className="sf-main" id="main-content">
        <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/account">ACCOUNT</a><span>/</span><strong>EXCHANGE {order.order_number}</strong></nav>
        <section className="sf-hero">
          <div>
            <p className="sf-kicker">EXCHANGE REQUEST RECEIVED · {placed}</p>
            <h1 className="sf-title">We have<br />your request.</h1>
            <p className="sf-sub">Thanks, {order.member_name}. The DLC team have it now — they will confirm the credits and settle the exchange with you at hand-over.</p>
          </div>
          <div className="sf-hero-stats"><div className="sf-stat"><span>Exchange number</span><strong>{order.order_number}</strong></div></div>
        </section>
        <div className="sf-body sf-confirm">
          <section className="sf-panel" aria-labelledby="nextTitle">
            <div className="sf-panel-head"><h2 id="nextTitle">What happens next</h2></div>
            <div className="sf-steps">
              <div className="is-done"><b>✓</b><p style={{ margin: 0 }}><strong>Request sent</strong><span>Your bag is with the DLC team at the lounge.</span></p></div>
              <div><b>02</b><p style={{ margin: 0 }}><strong>The team confirms</strong><span>They check stock and confirm your total, usually by message on the number you gave.</span></p></div>
              <div><b>03</b><p style={{ margin: 0 }}><strong>Hand-over &amp; settlement</strong><span>Settle in cash or by card when you receive it. Settling in cash carries a slightly larger member discount.</span></p></div>
            </div>
          </section>
          <aside className="sf-panel" aria-labelledby="totalTitle">
            <div className="sf-panel-head"><h2 id="totalTitle">Estimate</h2><span className="sf-badge sf-badge--blue"><i />{exchangeStatus(String(order.status))}</span></div>
            <div className="sf-sumrow"><span>Subtotal</span><strong>{credits(Number(order.subtotal))}</strong></div>
            {Number(order.delivery_fee) > 0 && <div className="sf-sumrow"><span>Delivery</span><strong>{credits(Number(order.delivery_fee))}</strong></div>}
            <div className="sf-totals"><div className="sf-total" style={{ gridColumn: "1 / -1" }}><span>ESTIMATED TOTAL</span><strong>{credits(Number(order.total))}</strong></div></div>
            <p className="sf-fineprint">Members settling in cash receive a slightly larger discount than those settling by card. The team will confirm the exact credits at hand-over.</p>
            <div className="sf-actions" style={{ marginTop: 16 }}><a className="sf-cta" href="/index.html#experience">Continue browsing</a><a className="sf-ghost" href="/account">View my exchanges</a></div>
          </aside>
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}

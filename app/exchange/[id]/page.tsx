import { notFound } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { exchangeStatus } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { CollectionPointCard } from "@/components/collection-point"
import { getCollectionPoint } from "@/lib/store-settings"

export const dynamic = "force-dynamic"

/**
 * An exchange request: the confirmation straight after sending, and the detail
 * page from the member's history.
 *
 * Shows what was requested and where it stands — never credits or totals. The
 * credits are confirmed by the team and settled in CDASH at hand-over, so a
 * figure here could only ever be an out-of-date estimate.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) notFound()
  const supabase = getSupabaseAdmin()
  const [{ data: order }, collectionPoint] = await Promise.all([
    supabase
      .from("online_orders")
      .select("id, order_number, status, member_name, created_at, online_order_items(product_type, strain_name, grade, quantity)")
      .eq("id", id)
      .eq("member_id", access.memberId)
      .maybeSingle(),
    getCollectionPoint(),
  ])
  if (!order) notFound()

  type Line = { product_type: string; strain_name: string; grade: string | null; quantity: number }
  const lines = (order.online_order_items || []) as Line[]
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
            <p className="sf-sub">Thanks, {order.member_name}. The DLC team have it now. They will message you when it is ready to collect, and settle the exchange with you at hand-over.</p>
          </div>
          <div className="sf-hero-stats"><div className="sf-stat"><span>Exchange number</span><strong>{order.order_number}</strong></div></div>
        </section>
        <div className="sf-body sf-confirm">
          <section className="sf-panel" aria-labelledby="nextTitle">
            <div className="sf-panel-head"><h2 id="nextTitle">What happens next</h2></div>
            <div className="sf-steps">
              <div className="is-done"><b>✓</b><p style={{ margin: 0 }}><strong>Request sent</strong><span>Your bag is with the DLC team at the lounge.</span></p></div>
              <div><b>02</b><p style={{ margin: 0 }}><strong>Ready to collect</strong><span>The team checks stock, confirms the credits and messages you on the number you gave when it is ready.</span></p></div>
              <div><b>03</b><p style={{ margin: 0 }}><strong>Book your Uber</strong><span>Online requests are collection only. Once it is ready, book your own Uber to the lounge.</span></p></div>
              <div><b>04</b><p style={{ margin: 0 }}><strong>Hand-over &amp; settlement</strong><span>Quote exchange {order.order_number} and bring your ID. Settle in cash or by card — settling in cash carries a slightly larger member discount.</span></p></div>
            </div>
            <div style={{ marginTop: 16 }}><CollectionPointCard point={collectionPoint} /></div>
          </section>
          <aside className="sf-panel" aria-labelledby="itemsTitle">
            <div className="sf-panel-head"><h2 id="itemsTitle">You requested</h2><span className="sf-badge sf-badge--blue"><i />{exchangeStatus(String(order.status))}</span></div>
            {lines.length === 0
              ? <p className="sf-hint">The items for this request are held by the DLC team.</p>
              : lines.map((line, index) => <div className="sf-sumrow" key={index}><span>{line.strain_name}<br /><small style={{ color: "var(--sf-muted)" }}>{[line.product_type, line.grade].filter(Boolean).join(" · ")}</small></span><strong>× {Number(line.quantity)}</strong></div>)}
            <p className="sf-fineprint">The team confirms the credits for this exchange with you and settles it at hand-over when you collect. Settling in cash carries a slightly larger member discount than settling by card.</p>
            <div className="sf-actions" style={{ marginTop: 16 }}><a className="sf-cta" href="/index.html#experience">Continue browsing</a><a className="sf-ghost" href="/account">View my exchanges</a></div>
          </aside>
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}

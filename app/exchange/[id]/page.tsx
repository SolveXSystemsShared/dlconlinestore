import { notFound } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { credits, exchangeStatus } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { CollectionPointCard } from "@/components/collection-point"
import { SettlePanel } from "@/components/settle-panel"
import { getCollectionPoint } from "@/lib/store-settings"

export const dynamic = "force-dynamic"

/**
 * An exchange request: settlement straight after sending, the confirmation once
 * settled, and the detail page from the member's history.
 *
 * Every online request is settled by card through Paystack before the team
 * prepares it. Until then this page is where the member settles — and where
 * Paystack sends them back, with ?reference=…, to finish it.
 */
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reference?: string }> }) {
  const [{ id }, { reference }] = await Promise.all([params, searchParams])
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) notFound()
  const supabase = getSupabaseAdmin()
  const [{ data: order }, collectionPoint] = await Promise.all([
    supabase
      .from("online_orders")
      .select("id, order_number, status, member_name, created_at, total, paid_at, cancellation_reason, online_order_items(product_type, strain_name, grade, quantity)")
      .eq("id", id)
      .eq("member_id", access.memberId)
      .maybeSingle(),
    getCollectionPoint(),
  ])
  if (!order) notFound()

  type Line = { product_type: string; strain_name: string; grade: string | null; quantity: number }
  const lines = (order.online_order_items || []) as Line[]
  const when = (value: string) => new Date(value).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const status = String(order.status)
  const awaiting = status === "pending_payment"
  const settled = !awaiting && status !== "cancelled" && status !== "expired"
  const returned = status === "cancelled" && String(order.cancellation_reason || "").startsWith("Settlement refused")
  const total = Number(order.total) || 0

  const hero = awaiting
    ? { kicker: `EXCHANGE REQUEST · ${when(order.created_at)}`, title: <>Settle to<br />send it.</>, sub: `Thanks, ${order.member_name}. Settle by card to send your request to the DLC team. They start preparing it as soon as it is settled.` }
    : settled
      ? { kicker: `SETTLED · ${when(order.paid_at || order.created_at)}`, title: <>We have<br />your request.</>, sub: `Thanks, ${order.member_name}. Your exchange is settled and with the DLC team.` }
      : { kicker: `EXCHANGE REQUEST · ${exchangeStatus(status).toUpperCase()}`, title: <>Request<br />closed.</>, sub: returned ? "We could not complete this exchange, so your card settlement has been returned to your card. It can take a few working days to show. Please send a new request." : "This exchange request was closed. Send a new request from your bag whenever you are ready." }

  return (
    <div className="sf">
      <StoreHeader />
      <main className="sf-main" id="main-content">
        <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/account">ACCOUNT</a><span>/</span><strong>EXCHANGE {order.order_number}</strong></nav>
        <section className="sf-hero">
          <div>
            <p className="sf-kicker">{hero.kicker}</p>
            <h1 className="sf-title">{hero.title}</h1>
            <p className="sf-sub">{hero.sub}</p>
          </div>
          <div className="sf-hero-stats">
            <div className="sf-stat"><span>Exchange number</span><strong>{order.order_number}</strong></div>
            {total > 0 && <div className="sf-stat"><span>{settled ? "Settled" : "To settle"}</span><strong>{credits(total)}</strong></div>}
          </div>
        </section>
        <div className="sf-body sf-confirm">
          <section className="sf-panel" aria-labelledby="nextTitle">
            <div className="sf-panel-head"><h2 id="nextTitle">{awaiting ? "Settle by card" : "What happens next"}</h2></div>
            {awaiting && <div style={{ marginBottom: 20 }}><SettlePanel orderId={order.id} amountDue={total > 0 ? total : null} returnedReference={reference || null} /></div>}
            <div className="sf-steps">
              <div className={settled ? "is-done" : undefined}><b>{settled ? "✓" : "01"}</b><p style={{ margin: 0 }}><strong>Settled by card</strong><span>Settled online through Paystack. Nothing is settled at hand-over.</span></p></div>
              <div><b>02</b><p style={{ margin: 0 }}><strong>Ready to collect</strong><span>The team prepares your request and messages you on the number you gave when it is ready.</span></p></div>
              <div><b>03</b><p style={{ margin: 0 }}><strong>Book your Uber</strong><span>Online requests are collection only. Once it is ready, book your own Uber to the lounge.</span></p></div>
              <div><b>04</b><p style={{ margin: 0 }}><strong>Hand-over</strong><span>Quote exchange {order.order_number} and bring your ID.</span></p></div>
            </div>
            <div style={{ marginTop: 16 }}><CollectionPointCard point={collectionPoint} /></div>
          </section>
          <aside className="sf-panel" aria-labelledby="itemsTitle">
            <div className="sf-panel-head"><h2 id="itemsTitle">You requested</h2><span className="sf-badge sf-badge--blue"><i />{exchangeStatus(status)}</span></div>
            {lines.length === 0
              ? <p className="sf-hint">The items for this request are held by the DLC team.</p>
              : lines.map((line, index) => <div className="sf-sumrow" key={index}><span>{line.strain_name}<br /><small style={{ color: "var(--sf-muted)" }}>{[line.product_type, line.grade].filter(Boolean).join(" · ")}</small></span><strong>× {Number(line.quantity)}</strong></div>)}
            <p className="sf-fineprint">Online exchanges are settled by card at your member card discount. DLC Credits and the cash discount apply in the lounge.</p>
            <div className="sf-actions" style={{ marginTop: 16 }}><a className="sf-cta" href="/index.html?home=1">Continue browsing</a><a className="sf-ghost" href="/account">View my exchanges</a></div>
          </aside>
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}

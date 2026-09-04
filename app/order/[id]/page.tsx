import Link from "next/link"
import { notFound } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { credits } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"

export const dynamic = "force-dynamic"

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) notFound()
  const supabase = getSupabaseAdmin()
  const { data: order } = await supabase.from("online_orders").select("id, order_number, status, subtotal, delivery_fee, total, member_name, created_at").eq("id", id).eq("member_id", access.memberId).maybeSingle()
  if (!order) notFound()

  return <main className="shell"><header className="topbar"><Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link></header><section className="content success"><div className="eyebrow">Order received</div><h1>We have your order.</h1><p className="order-number">{order.order_number}</p><p>Thanks, {order.member_name}. Your order is currently <strong>{String(order.status).replaceAll("_", " ")}</strong>. The fulfilment team will confirm payment and collection or delivery details.</p><div className="card" style={{ margin: "28px auto", maxWidth: 420, textAlign: "left" }}><div className="summary-line"><span>Subtotal</span><strong>{credits(Number(order.subtotal))}</strong></div><div className="summary-line"><span>Delivery</span><strong>{credits(Number(order.delivery_fee))}</strong></div><div className="summary-line summary-total"><span>Total</span><strong>{credits(Number(order.total))}</strong></div></div><Link className="button" href="/">Continue browsing</Link></section></main>
}

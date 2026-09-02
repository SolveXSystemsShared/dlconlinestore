"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { formatMemberId, isCompleteMemberId, money, MEMBER_ID_PREFIX } from "@/lib/format"
import type { CartLine, CatalogProduct } from "@/lib/types"

type CheckoutItem = Pick<CatalogProduct, "id" | "name" | "productType" | "grade" | "price" | "availableQuantity"> & { quantity: number }

function CheckoutForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [cart, setCart] = useState<CheckoutItem[]>([])
  const [memberId, setMemberId] = useState(MEMBER_ID_PREFIX)
  const [member, setMember] = useState<{ memberId: string; name: string } | null>(null)
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const raw = params.get("cart")
    if (!raw) return
    try {
      const requested = JSON.parse(raw) as Array<{ id: string; quantity: number }>
      fetch("/api/catalog").then((response) => response.json()).then((data) => {
        const products = data.products as CatalogProduct[]
        setCart(requested.map((line) => {
          const product = products.find((item) => item.id === line.id)
          return product ? { ...product, quantity: Math.min(Math.max(Number(line.quantity) || 1, 1), product.availableQuantity) } : null
        }).filter(Boolean) as CheckoutItem[])
      })
    } catch { setMessage("Your cart could not be loaded. Please return to the store.") }
  }, [params])

  // The gate already verified this member, so checkout reads that session
  // instead of asking for the same Member ID a second time.
  useEffect(() => {
    let cancelled = false
    fetch("/api/members/session")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled || !data?.member) return
        setMember(data.member)
        setMemberId(data.member.memberId)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const updateQuantity = (id: string, quantity: number) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, Math.min(quantity, item.availableQuantity)) } : item))

  // The "DLC-" prefix is furniture, not editable text: keep the caret after it
  // and stop Backspace from eating into it.
  function caretToEnd(event: { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    requestAnimationFrame(() => {
      if ((input.selectionStart ?? 0) < MEMBER_ID_PREFIX.length) {
        input.setSelectionRange(input.value.length, input.value.length)
      }
    })
  }

  function keepPrefix(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const start = input.selectionStart ?? 0
    if (event.key === "Backspace" && start <= MEMBER_ID_PREFIX.length && start === (input.selectionEnd ?? 0)) {
      event.preventDefault()
    }
  }

  async function verifyMember() {
    setMessage("")
    setMember(null)
    const response = await fetch("/api/members/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId }) })
    const data = await response.json()
    if (!response.ok) return setMessage(data.error || "Member ID could not be verified")
    setMember(data.member)
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    if (!member) return setMessage("Verify your DLC Member ID first.")
    if (!cart.length) return setMessage("Add at least one product before checking out.")
    setBusy(true)
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: member.memberId, phone, deliveryAddress: address, customerNotes: notes, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not place order")
      router.push(`/order/${data.order.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not place order")
    } finally { setBusy(false) }
  }

  return (
    <main className="shell">
      <header className="topbar"><Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link><Link className="button secondary" href="/">Back to store</Link></header>
      <section className="content">
        <div className="section-heading"><div><h2>Checkout</h2><p>Use the Member ID already registered in CDASH.</p></div></div>
        <div className="checkout-layout">
          <form className="card" onSubmit={submitOrder}>
            <div className="notice">Your order will be reserved against live CDASH inventory. Payment confirmation is handled after the order is created.</div>
            {member
              ? <div className="field"><label htmlFor="memberId">DLC Member ID</label><input id="memberId" value={member.memberId} readOnly aria-describedby="memberVerified" /><p id="memberVerified" className="notice">Verified member: <strong>{member.name}</strong></p></div>
              : <div className="field"><label htmlFor="memberId">DLC Member ID</label><div style={{ display: "flex", gap: 8 }}><input id="memberId" inputMode="numeric" value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" required /><button type="button" className="button secondary" onClick={verifyMember} disabled={!isCompleteMemberId(memberId)}>Verify</button></div></div>}
            <div className="form-row"><div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="For order updates" required /></div><div className="field"><label htmlFor="address">Delivery / collection details</label><input id="address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address or collection note" required /></div></div>
            <div className="field"><label htmlFor="notes">Order notes <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the fulfilment team should know?" /></div>
            {message && <p className="error">{message}</p>}
            <button className="button" disabled={busy || !cart.length || !member} type="submit">{busy ? "Reserving order…" : "Place order"}</button>
          </form>
          <aside className="card"><h3>Your order</h3>{!cart.length && <p className="empty">Your cart is empty.</p>}{cart.map((item) => <div className="summary-line" key={item.id}><span>{item.name} × <input aria-label={`Quantity for ${item.name}`} style={{ width: 48, padding: 4 }} type="number" min={1} max={item.availableQuantity} value={item.quantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} /></span><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="summary-line summary-total"><span>Total</span><strong>{money(subtotal)}</strong></div></aside>
        </div>
      </section>
    </main>
  )
}

export default function CheckoutPage() {
  return <Suspense fallback={<main className="shell"><section className="content"><p className="empty">Loading checkout…</p></section></main>}><CheckoutForm /></Suspense>
}

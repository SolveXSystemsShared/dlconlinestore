"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatMemberId, isCompleteMemberId, credits, MEMBER_ID_PREFIX } from "@/lib/format"
import type { CatalogProduct, SavedAddress } from "@/lib/types"

/** One line of text for the order, from the parts the member filled in. */
function formatAddress(entry: SavedAddress) {
  return [entry.line1, entry.line2, entry.suburb, entry.city, entry.postalCode, entry.notes].filter(Boolean).join(", ")
}

type CheckoutItem = Pick<CatalogProduct, "id" | "name" | "productType" | "grade" | "price" | "availableQuantity"> & { quantity: number }

function CheckoutForm() {
  const router = useRouter()
  const [cart, setCart] = useState<CheckoutItem[]>([])
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [addressId, setAddressId] = useState("")
  const [memberId, setMemberId] = useState(MEMBER_ID_PREFIX)
  const [member, setMember] = useState<{ memberId: string; name: string } | null>(null)
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  // The tray is the member's saved one, already reconciled against live stock by
  // the API, so checkout never has to trust a number that came in on a URL.
  useEffect(() => {
    fetch("/api/cart")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return
        setCart(data.lines as CheckoutItem[])
        if (data.removed) setMessage(`${data.removed} item${data.removed === 1 ? " is" : "s are"} no longer available and ${data.removed === 1 ? "was" : "were"} removed from your Tray.`)
      })
      .catch(() => setMessage("Your Tray could not be loaded. Please return to the lounge."))
  }, [])

  // Saved addresses fill the delivery field in one tap. Typing a different one
  // stays possible — a member sending an order somewhere new should not have to
  // save it first.
  useEffect(() => {
    fetch("/api/profile/addresses")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.addresses?.length) return
        setAddresses(data.addresses)
        const preferred = (data.addresses as SavedAddress[]).find((entry) => entry.isDefault) ?? data.addresses[0]
        setAddressId(preferred.id)
        setAddress(formatAddress(preferred))
        if (!phone) setPhone(preferred.phone)
      })
      .catch(() => {})
  }, [])

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

  function chooseAddress(id: string) {
    setAddressId(id)
    const found = addresses.find((entry) => entry.id === id)
    if (!found) return
    setAddress(formatAddress(found))
    setPhone(found.phone)
  }

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const updateQuantity = async (id: string, quantity: number) => {
    const item = cart.find((line) => line.id === id)
    if (!item) return
    const next = Math.max(1, Math.min(quantity, item.availableQuantity))
    const previous = item.quantity
    if (next === previous) return
    setCart((current) => current.map((line) => line.id === id ? { ...line, quantity: next } : line))
    setMessage("")
    // Keep the saved tray in step, so leaving checkout does not lose the edit.
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, quantity: next }) })
      if (!response.ok) throw new Error("the tray refused the change")
    } catch {
      // Step this one line back. Letting the stepper stand would quote a
      // subtotal against a quantity the tray never accepted.
      setCart((current) => current.map((line) => line.id === id ? { ...line, quantity: previous } : line))
      setMessage(`${item.name} could not be updated. Your Tray still holds ${previous}.`)
    }
  }

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
      <header className="topbar"><Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link><Link className="button secondary" href="/">Back to the lounge</Link></header>
      <section className="content">
        <div className="section-heading"><div><h2>Checkout</h2><p>Use the Member ID the lounge already has for you.</p></div></div>
        <div className="checkout-layout">
          <form className="card" onSubmit={submitOrder}>
            <div className="notice">Your order will be reserved against live lounge stock. Payment confirmation is handled after the order is created.</div>
            {member
              ? <div className="field"><label htmlFor="memberId">DLC Member ID</label><input id="memberId" value={member.memberId} readOnly aria-describedby="memberVerified" /><p id="memberVerified" className="notice">Verified member: <strong>{member.name}</strong></p></div>
              : <div className="field"><label htmlFor="memberId">DLC Member ID</label><div style={{ display: "flex", gap: 8 }}><input id="memberId" inputMode="numeric" value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" required /><button type="button" className="button secondary" onClick={verifyMember} disabled={!isCompleteMemberId(memberId)}>Verify</button></div></div>}
            <div className="form-row"><div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="For order updates" required /></div><div className="field"><label htmlFor="address">Delivery / collection details</label>{addresses.length > 0 && <select className="address-picker" aria-label="Use a saved address" value={addressId} onChange={(event) => chooseAddress(event.target.value)}><option value="">Type a new address…</option>{addresses.map((entry) => <option key={entry.id} value={entry.id}>{entry.label || entry.recipient}{entry.isDefault ? " (default)" : ""}</option>)}</select>}<input id="address" value={address} onChange={(event) => { setAddress(event.target.value); setAddressId("") }} placeholder="Address or collection note" required /></div></div>
            <div className="field"><label htmlFor="notes">Order notes <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the fulfilment team should know?" /></div>
            {message && <p className="error">{message}</p>}
            <button className="button" disabled={busy || !cart.length || !member} type="submit">{busy ? "Reserving order…" : "Place order"}</button>
          </form>
          <aside className="card"><h3>Your order</h3>{!cart.length && <p className="empty">Your Tray is empty.</p>}{cart.map((item) => <div className="summary-line" key={item.id}><span>{item.name} × <input aria-label={`Quantity for ${item.name}`} style={{ width: 48, padding: 4 }} type="number" min={1} max={item.availableQuantity} value={item.quantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} /></span><strong>{credits(item.price * item.quantity)}</strong></div>)}<div className="summary-line summary-total"><span>Total</span><strong>{credits(subtotal)}</strong></div></aside>
        </div>
      </section>
    </main>
  )
}

export default function CheckoutPage() {
  return <Suspense fallback={<main className="shell"><section className="content"><p className="empty">Loading checkout…</p></section></main>}><CheckoutForm /></Suspense>
}

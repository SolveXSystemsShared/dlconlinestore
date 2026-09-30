"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { formatMemberId, isCompleteMemberId, credits, MEMBER_ID_PREFIX } from "@/lib/format"
import { imageFor, productUrl, shelfLabel } from "@/lib/storefront"
import { EXCHANGE_REQUEST_STATEMENT, TERMS_VERSION } from "@/lib/legal"
import { LegalStatement } from "@/components/legal-statement"
import { SkeletonPage } from "@/components/skeleton"
import { LoadingLine, SlowNotice, useSlowFlag } from "@/components/slow-notice"
import type { CatalogProduct, CheckoutQuote, SavedAddress } from "@/lib/types"

/** One line of text for the exchange request, from the parts the member filled in. */
function formatAddress(entry: SavedAddress) {
  return [entry.line1, entry.line2, entry.suburb, entry.city, entry.postalCode, entry.notes].filter(Boolean).join(", ")
}

type CheckoutItem = Pick<CatalogProduct, "id" | "name" | "productType" | "grade" | "price" | "availableQuantity" | "imageUrl"> & { quantity: number }

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
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoteError, setQuoteError] = useState("")
  const [creditSpend, setCreditSpend] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // The bag is the member's saved one, already reconciled against live stock by
  // the API, so checkout never has to trust a number that came in on a URL.
  useEffect(() => {
    fetch("/api/cart")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return
        setCart(data.lines as CheckoutItem[])
        if (data.removed) setMessage(`${data.removed} item${data.removed === 1 ? " is" : "s are"} no longer available and ${data.removed === 1 ? "was" : "were"} removed from your bag.`)
      })
      .catch(() => setMessage("Your bag could not be loaded. Please return to the store."))
      .finally(() => setLoaded(true))
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

  // The catalogue subtotal, shown only as the "before discount" line. It is not
  // the total and never was: under §7 the membership discount, the card-XOR-cash
  // split and the 20% DLC Credit cap all land server-side, and only CDASH knows
  // this member's tier. What is owed comes from /api/checkout/quote.
  const gross = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

  // Re-price whenever the basket or the credit request changes. The basket is
  // sent by product id and quantity only — prices come from our catalogue on the
  // server, so nothing the browser says can move a total.
  useEffect(() => {
    if (!cart.length) { setQuote(null); return }
    let cancelled = false
    const timer = setTimeout(() => {
      fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dlcCreditsRequested: creditSpend, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      })
        .then(async (response) => ({ ok: response.ok, data: await response.json() }))
        .then(({ ok, data }) => {
          if (cancelled) return
          if (!ok) { setQuote(null); return setQuoteError(data.error || "We could not work out the credits for your bag just now.") }
          setQuoteError("")
          setQuote(data.quote as CheckoutQuote)
        })
        .catch(() => { if (!cancelled) setQuoteError("We could not work out the credits for your bag just now.") })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [cart, creditSpend])

  // Never offer more credits than §7 would allow on this basket. The cap comes
  // from the cash channel — the smaller one — so a shopper cannot be quoted a
  // redemption the settlement would refuse.
  const creditCeiling = quote?.credits.maxOnThisBasket ?? 0
  useEffect(() => { if (creditSpend > creditCeiling) setCreditSpend(creditCeiling) }, [creditCeiling, creditSpend])
  const updateQuantity = (id: string, quantity: number) => {
    const item = cart.find((line) => line.id === id)
    if (!item) return
    const next = Math.max(1, Math.min(quantity, item.availableQuantity))
    setCart((current) => current.map((line) => line.id === id ? { ...line, quantity: next } : line))
    // Keep the saved bag in step, so leaving checkout does not lose the edit.
    fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, quantity: next }) }).catch(() => {})
  }

  // Zero is the API's "take it out of the bag".
  const removeLine = (id: string) => {
    setCart((current) => current.filter((line) => line.id !== id))
    fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, quantity: 0 }) }).catch(() => {})
  }

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const slowQuote = useSlowFlag(cart.length > 0 && !quote && !quoteError)

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
    if (!cart.length) return setMessage("Add at least one product to your bag first.")
    if (!accepted) return setMessage("Please accept the Terms & Conditions to send your request.")
    setBusy(true)
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: member.memberId, phone, deliveryAddress: address, customerNotes: notes, dlcCreditsRequested: creditSpend, acceptedTerms: accepted, termsVersion: TERMS_VERSION, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not send your exchange request")
      router.push(`/exchange/${data.order.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send your exchange request")
    } finally { setBusy(false) }
  }

  const summary = <aside className="sf-panel sf-summary" aria-labelledby="summaryTitle">
    <div className="sf-panel-head"><h2 id="summaryTitle">Summary</h2><span className="sf-step">{String(itemCount).padStart(2, "0")} {itemCount === 1 ? "ITEM" : "ITEMS"}</span></div>
    <div className="sf-sumrow"><span>Subtotal</span><strong>{credits(gross)}</strong></div>
    {quote && quote.card.memberDiscountAmount > 0 && <div className="sf-sumrow sf-sumrow--minus"><span>{quote.tier?.name || "Member"} discount</span><strong>&minus;{credits(quote.cash.memberDiscountAmount)} settling in cash<br />&minus;{credits(quote.card.memberDiscountAmount)} settling by card</strong></div>}
    {quote && quote.card.creditsApplied > 0 && <div className="sf-sumrow sf-sumrow--minus"><span>DLC Credits</span><strong>&minus;{credits(quote.card.creditsApplied)}</strong></div>}
    {quote && quote.card.deliveryFee > 0 && <div className="sf-sumrow"><span>Delivery</span><strong>{credits(quote.card.deliveryFee)}</strong></div>}

    {quote && quote.credits.balance > 0 && <div className="sf-credits">
      <label className="sf-label" htmlFor="credits">Use DLC Credits</label>
      <input id="credits" type="range" min={0} max={quote.credits.maxOnThisBasket} step={1} value={creditSpend} onChange={(event) => setCreditSpend(Math.max(0, Math.min(Number(event.target.value) || 0, quote.credits.maxOnThisBasket)))} aria-valuetext={credits(creditSpend)} />
      <div className="sf-credits-row"><span>Using <strong>{credits(creditSpend)}</strong></span><span>{credits(quote.credits.balance)} available · up to {credits(quote.credits.maxOnThisBasket)} here</span></div>
    </div>}

    {/* Both channels, because §7 rule 2 gives one discount and it matches how the member pays — which is only known at the door. */}
    {quote
      ? <div className="sf-totals">
          <div className="sf-total sf-total--cash"><span>SETTLING IN CASH</span><strong>{credits(quote.cash.amountDue)}</strong></div>
          <div className="sf-total"><span>SETTLING BY CARD</span><strong>{credits(quote.card.amountDue)}</strong></div>
        </div>
      : <div className="sf-totals"><div className="sf-total" style={{ gridColumn: "1 / -1" }}><span>TOTAL</span><strong>{quoteError || !cart.length ? "—" : <span className="sk sk-inline" aria-label="Calculating credits" />}</strong></div></div>}
    {quoteError && <p className="sf-error">{quoteError}</p>}
    <SlowNotice show={slowQuote} what="the credits for your bag" />
    {quote && quote.card.pointsEarned > 0 && <p className="sf-note sf-note--ok">Earns around <strong>{quote.card.pointsEarned} points</strong> once the exchange is settled.</p>}

    <label className="sf-check" style={{ marginTop: 4 }}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><LegalStatement text={EXCHANGE_REQUEST_STATEMENT} /></span></label>
    {message && <p className="sf-error" role="alert">{message}</p>}
    <button className="sf-cta sf-cta--block" form="checkoutForm" disabled={busy || !cart.length || !member || !quote || !accepted} type="submit">{busy ? "Sending request…" : <>Request exchange <span>→</span></>}</button>
    {!member && cart.length > 0 && <p className="sf-fineprint">Verify your Member ID to request the exchange.</p>}
    <div className="sf-trust">
      <div><b>01</b><span>Nothing is settled online. The DLC team confirms the credits and settles the exchange with you at hand-over.</span></div>
      <div><b>02</b><span>Settling in cash carries a slightly larger member discount than settling by card — whichever matches how you settle applies.</span></div>
    </div>
  </aside>

  return (
    <div className="sf">
      <StoreHeader bagCount={itemCount} current="bag" />
      <main className="sf-main" id="main-content">
        <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/index.html#experience">LOUNGE</a><span>/</span><strong>BAG &amp; REVIEW</strong></nav>
        <section className="sf-hero">
          <div>
            <p className="sf-kicker">DLC MEMBERS / REVIEW &amp; REQUEST</p>
            <h1 className="sf-title">Your<br />bag.</h1>
            <p className="sf-sub">Review your bag, tell us where it goes, and send it to the DLC team as an exchange request.</p>
          </div>
          {member && <div className="sf-hero-stats"><div className="sf-stat"><span>Member</span><strong>{member.name.split(" ")[0]}</strong></div><div className="sf-stat"><span>Items</span><strong>{String(itemCount).padStart(2, "0")}</strong></div></div>}
        </section>

        <div className="sf-body">
          {message && !cart.length && <p className="sf-error" role="alert">{message}</p>}
          {!loaded
            ? <><div className="sf-body"><LoadingLine context="bag" /></div><SkeletonPage label="Loading your bag" /></>
            : !cart.length
              ? <div className="sf-empty"><strong>Your bag is empty.</strong>Add something from the lounge — it will wait here for you.<div className="sf-actions"><a className="sf-cta" href="/strains.html?category=flower">Browse flower</a><a className="sf-ghost" href="/strains.html?category=more">Browse everything</a></div></div>
              : <div className="sf-checkout">
                  <form id="checkoutForm" onSubmit={submitOrder}>
                    <section className="sf-panel" aria-labelledby="bagTitle">
                      <div className="sf-panel-head"><h2 id="bagTitle">In your bag</h2><span className="sf-step">STEP 01</span></div>
                      <div className="sf-lines">
                        {cart.map((item) => {
                          const image = imageFor(item)
                          return <div className="sf-line" key={item.id}>
                            <a className="sf-thumb" href={productUrl(item)} aria-hidden="true" tabIndex={-1}>{image ? <img src={image} alt="" /> : <span>DLC</span>}</a>
                            <div className="sf-line-meta">
                              <small>{shelfLabel(item)}</small>
                              <a href={productUrl(item)}><h3>{item.name}</h3></a>
                              <div className="sf-line-tools">
                                <div className="sf-stepper" role="group" aria-label={`Quantity for ${item.name}`}>
                                  <button type="button" aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                                  <output aria-live="polite">{item.quantity}</output>
                                  <button type="button" aria-label="Increase quantity" disabled={item.quantity >= item.availableQuantity} onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                                </div>
                                <button type="button" className="sf-remove" onClick={() => removeLine(item.id)}>REMOVE</button>
                                {item.availableQuantity <= 3 && <span className="sf-badge sf-badge--warn"><i />Only {item.availableQuantity} left</span>}
                              </div>
                            </div>
                            <div className="sf-line-price">{credits(item.price * item.quantity)}{item.quantity > 1 && <small>{credits(item.price)} each</small>}</div>
                          </div>
                        })}
                      </div>
                    </section>

                    <section className="sf-panel" aria-labelledby="detailsTitle">
                      <div className="sf-panel-head"><h2 id="detailsTitle">Your details</h2><span className="sf-step">STEP 02</span></div>
                      {member
                        ? <div className="sf-member"><div><small>DLC MEMBER · {member.memberId}</small><strong>{member.name}</strong></div><span className="sf-badge sf-badge--good"><i />Verified</span></div>
                        : <div className="sf-field"><label htmlFor="memberId">DLC Member ID</label><div className="sf-inline"><input id="memberId" inputMode="numeric" value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" required /><button type="button" className="sf-ghost" onClick={verifyMember} disabled={!isCompleteMemberId(memberId)}>Verify</button></div></div>}
                      <div className="sf-field"><label htmlFor="phone">Mobile number <small>— for exchange updates</small></label><input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="082 000 0000" required /></div>
                    </section>

                    <section className="sf-panel" aria-labelledby="deliveryTitle">
                      <div className="sf-panel-head"><h2 id="deliveryTitle">Delivery</h2><span className="sf-step">STEP 03</span></div>
                      {addresses.length > 0 && <>
                        <p className="sf-label" id="savedAddresses">Saved addresses</p>
                        <div className="sf-choices" role="group" aria-labelledby="savedAddresses">
                          {addresses.map((entry) => <button type="button" key={entry.id} className="sf-choice" aria-pressed={addressId === entry.id} onClick={() => chooseAddress(entry.id)}>
                            <strong>{entry.label || entry.recipient}{entry.isDefault && <em className="sf-badge sf-badge--blue" style={{ fontStyle: "normal" }}>Default</em>}</strong>
                            <span>{formatAddress(entry)}</span>
                          </button>)}
                        </div>
                      </>}
                      <div className="sf-field"><label htmlFor="address">{addresses.length ? "Or type a delivery / collection note" : "Delivery / collection details"}</label><input id="address" value={address} onChange={(event) => { setAddress(event.target.value); setAddressId("") }} placeholder="Street address, or “I’ll collect at Midrand”" required /></div>
                      <div className="sf-field"><label htmlFor="notes">Notes for the team <small>— optional</small></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Gate code, best time to reach you, anything the team should know" /></div>
                      <p className="sf-hint">Manage saved addresses in <Link href="/account" style={{ color: "var(--sf-blue)", fontWeight: 900 }}>your account</Link>.</p>
                    </section>
                  </form>
                  {summary}
                </div>}
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="sf"><SkeletonPage label="Loading your bag" /></div>}><CheckoutForm /></Suspense>
}

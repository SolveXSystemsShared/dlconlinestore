"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { credits } from "@/lib/format"
import { imageFor, productUrl, shelfLabel } from "@/lib/storefront"
import { EXCHANGE_REQUEST_STATEMENT, TERMS_VERSION } from "@/lib/legal"
import { LegalStatement } from "@/components/legal-statement"
import { SkeletonPage } from "@/components/skeleton"
import { LoadingLine, SlowNotice, useSlowFlag } from "@/components/slow-notice"
import { CollectionPointCard } from "@/components/collection-point"
import type { CatalogProduct, CheckoutQuote, CollectionPoint } from "@/lib/types"

type CheckoutItem = Pick<CatalogProduct, "id" | "slug" | "name" | "productType" | "grade" | "price" | "availableQuantity" | "imageUrl"> & { quantity: number }

function CheckoutForm() {
  const router = useRouter()
  const [cart, setCart] = useState<CheckoutItem[]>([])
  const [collectionPoint, setCollectionPoint] = useState<CollectionPoint | null>(null)
  const [member, setMember] = useState<{ memberId: string; name: string } | null>(null)
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoteError, setQuoteError] = useState("")
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

  // Online requests are collection only — the member books their own Uber to
  // the fulfilment store — so there is no address to ask for, only where to go.
  useEffect(() => {
    fetch("/api/collection-point")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.collectionPoint) setCollectionPoint(data.collectionPoint) })
      .catch(() => {})
  }, [])

  // The team messages the member when the request is ready to collect, so start
  // from the mobile number on their membership. They can still change it.
  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.profile?.mobileNumber) setPhone((current) => current || data.profile.mobileNumber)
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
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // The catalogue subtotal, shown only as the "before discount" line. It is not
  // the total and never was: under §7 the membership discount, the card-XOR-cash
  // split and the 20% DLC Credit cap all land server-side, and only CDASH knows
  // this member's tier. What is owed comes from /api/checkout/quote.
  const gross = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

  // Re-price whenever the basket changes. The basket is sent by product id and
  // quantity only — prices come from our catalogue on the server, so nothing the
  // browser says can move a total. No DLC Credits: an online exchange settles
  // by card at the card rate, with no redemption (CDASH settles it that way).
  useEffect(() => {
    if (!cart.length) { setQuote(null); return }
    let cancelled = false
    const timer = setTimeout(() => {
      fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
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
  }, [cart])

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
        body: JSON.stringify({ memberId: member.memberId, phone, customerNotes: notes, acceptedTerms: accepted, termsVersion: TERMS_VERSION, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not send your exchange request")
      // Straight on to Paystack. If the checkout could not be opened, the
      // request's own page offers settlement again.
      if (data.settlement?.authorizationUrl) return window.location.assign(data.settlement.authorizationUrl)
      router.push(`/exchange/${data.order.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send your exchange request")
    }
    setBusy(false)
  }

  const summary = <aside className="sf-panel sf-summary" aria-labelledby="summaryTitle">
    <div className="sf-panel-head"><h2 id="summaryTitle">Summary</h2><span className="sf-step">{String(itemCount).padStart(2, "0")} {itemCount === 1 ? "ITEM" : "ITEMS"}</span></div>
    <div className="sf-sumrow"><span>Subtotal</span><strong>{credits(gross)}</strong></div>
    {quote && quote.card.memberDiscountAmount > 0 && <div className="sf-sumrow sf-sumrow--minus"><span>{quote.tier?.name || "Member"} card discount</span><strong>&minus;{credits(quote.card.memberDiscountAmount)}</strong></div>}
    {quote && quote.card.deliveryFee > 0 && <div className="sf-sumrow"><span>Online request fee</span><strong>{credits(quote.card.deliveryFee)}</strong></div>}

    {/* One figure: every online exchange is settled by card, so §7 rule 2 gives the card rate. */}
    {quote
      ? <div className="sf-totals"><div className="sf-total" style={{ gridColumn: "1 / -1" }}><span>TO SETTLE BY CARD</span><strong>{credits(quote.card.amountDue)}</strong></div></div>
      : <div className="sf-totals"><div className="sf-total" style={{ gridColumn: "1 / -1" }}><span>TOTAL</span><strong>{quoteError ? "Unavailable" : !cart.length ? credits(0) : <span className="sk sk-inline" aria-label="Calculating credits" />}</strong></div></div>}
    {quoteError && <p className="sf-error">{quoteError}</p>}
    <SlowNotice show={slowQuote} what="the credits for your bag" />
    {quote && quote.card.pointsEarned > 0 && <p className="sf-note sf-note--ok">Earns around <strong>{quote.card.pointsEarned} points</strong> once the exchange is settled.</p>}

    <label className="sf-check" style={{ marginTop: 4 }}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><LegalStatement text={EXCHANGE_REQUEST_STATEMENT} /></span></label>
    {message && <p className="sf-error" role="alert">{message}</p>}
    <button className="sf-cta sf-cta--block" form="checkoutForm" disabled={busy || !cart.length || !member || !quote || !accepted} type="submit">{busy ? "Opening secure settlement…" : <>Settle &amp; request exchange <span>→</span></>}</button>
    {!member && cart.length > 0 && <p className="sf-fineprint">Verify your Member ID to request the exchange.</p>}
    <div className="sf-trust">
      <div><b>01</b><span>You settle by card on Paystack&apos;s secure page. Your card details go to Paystack, never to DLC.</span></div>
      <div><b>02</b><span>The team prepares your request once it is settled. Nothing is settled at hand-over. DLC Credits and the cash discount apply in the lounge.</span></div>
    </div>
  </aside>

  return (
    <div className="sf">
      <StoreHeader bagCount={itemCount} current="bag" />
      <main className="sf-main" id="main-content">
        <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/index.html?home=1">LOUNGE</a><span>/</span><strong>BAG &amp; REVIEW</strong></nav>
        <section className="sf-hero">
          <div>
            <p className="sf-kicker">DLC MEMBERS / REVIEW &amp; REQUEST</p>
            <h1 className="sf-title">Your<br />bag.</h1>
            <p className="sf-sub">Review your bag, settle by card and send it to the DLC team as an exchange request. Collect it from the lounge when it is ready.</p>
          </div>
          {member && <div className="sf-hero-stats"><div className="sf-stat"><span>Member</span><strong>{member.name.split(" ")[0]}</strong></div><div className="sf-stat"><span>Items</span><strong>{String(itemCount).padStart(2, "0")}</strong></div></div>}
        </section>

        <div className="sf-body">
          {message && !cart.length && <p className="sf-error" role="alert">{message}</p>}
          {!loaded
            ? <><div className="sf-body"><LoadingLine context="bag" /></div><SkeletonPage label="Loading your bag" /></>
            : !cart.length
              ? <div className="sf-empty"><strong>Your bag is empty.</strong>Add something from the lounge and it will wait here for you.<div className="sf-actions"><a className="sf-cta" href="/strains.html?category=flower">Browse flower</a><a className="sf-ghost" href="/strains.html?category=more">Browse everything</a></div></div>
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
                        ? <div className="sf-member"><div><small>DLC MEMBER · {member.memberId}</small><strong>{member.name}</strong></div></div>
                        : <div className="sf-field"><p className="sf-note">Your member session has ended. Sign in again with your Member ID and the PIN we SMS you.</p><button type="button" className="sf-ghost" onClick={() => window.location.reload()}>Sign in again</button></div>}
                      <div className="sf-field"><label htmlFor="phone">Mobile number <small>(we let you know when it is ready to collect)</small></label><input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="082 000 0000" required /></div>
                    </section>

                    <section className="sf-panel" aria-labelledby="collectionTitle">
                      <div className="sf-panel-head"><h2 id="collectionTitle">Collection</h2><span className="sf-step">STEP 03</span></div>
                      <p className="sf-note">Online exchange requests are collection only. We do not deliver. Once we let you know your request is ready, book your own Uber to the lounge and collect it there. Bring your ID.</p>
                      <CollectionPointCard point={collectionPoint} />
                      <div className="sf-field"><label htmlFor="notes">Notes for the team <small>(optional)</small></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Roughly when you plan to collect, or anything the team should know" /></div>
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

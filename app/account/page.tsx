"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Pagination, usePagination } from "@/components/pagination"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { SkeletonPage } from "@/components/skeleton"
import { LoadingLine } from "@/components/slow-notice"
import { credits, exchangeStatus } from "@/lib/format"
import { imageFor, productUrl, shelfLabel } from "@/lib/storefront"
import type { CatalogProduct, MemberProfile, OrderSummary } from "@/lib/types"

type Tab = "profile" | "orders" | "saved"
type Period = "3m" | "6m" | "12m" | "all" | "custom"

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom dates" },
]

/** Today in South Africa, as YYYY-MM-DD for the date inputs. */
const saToday = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
type SavedItem = CatalogProduct & { inStock: boolean }

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "My details" },
  { id: "orders", label: "My exchanges" },
  { id: "saved", label: "Saved items" },
]

// An order history and a wishlist both grow without limit.
const ORDERS_PER_PAGE = 10
const SAVED_PER_PAGE = 12

export default function AccountPage() {
  const [tab, setTab] = useState<Tab>("profile")
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [bagCount, setBagCount] = useState<number | undefined>(undefined)
  const [period, setPeriod] = useState<Period>("3m")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [referralCode, setReferralCode] = useState("")
  const [codeCopied, setCodeCopied] = useState(false)

  // Keyed on length so removing the last item on a page steps back rather than
  // leaving an empty list behind.
  const orderPages = usePagination(orders, ORDERS_PER_PAGE, `orders-${orders.length}`)
  // Only what is on the shelf is shown. Out-of-stock items stay saved and
  // reappear here on their own once the lounge restocks them.
  const stockedItems = savedItems.filter((item) => item.inStock)
  const hiddenCount = savedItems.length - stockedItems.length
  const savedPages = usePagination(stockedItems, SAVED_PER_PAGE, `saved-${stockedItems.length}`)

  // Staff accounts have no referral code, so nothing is shown for them.
  useEffect(() => {
    fetch("/api/referral").then((r) => r.ok ? r.json() : null).then((data) => { if (data?.code) setReferralCode(data.code) }).catch(() => {})
  }, [])

  async function copyReferralCode() {
    try { await navigator.clipboard.writeText(referralCode); setCodeCopied(true); window.setTimeout(() => setCodeCopied(false), 2200) } catch { setCodeCopied(false) }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.ok ? r.json() : null),
      fetch("/api/wishlist").then((r) => r.ok ? r.json() : null),
    ])
      .then(([p, w]) => {
        if (p?.profile) setProfile(p.profile)
        if (w?.items) setSavedItems(w.items)
        if (!p?.profile) setError("We could not load your profile. Try reloading the page.")
      })
      .catch(() => setError("We could not load your account. Try reloading the page."))
      .finally(() => setLoading(false))
  }, [])

  // The history is fetched per period, only when the tab is open — nothing is
  // requested (or held in the page) that the member has not asked to see.
  const loadOrders = useCallback(async (which: Period, from = "", to = "") => {
    setOrdersLoading(true)
    setOrdersError("")
    try {
      const query = new URLSearchParams({ period: which, ...(which === "custom" ? { from, to } : {}) })
      const response = await fetch(`/api/orders?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load your exchanges")
      setOrders(data.orders)
    } catch (reason) {
      setOrders([])
      setOrdersError(reason instanceof Error ? reason.message : "Could not load your exchanges")
    } finally { setOrdersLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === "orders" && period !== "custom") loadOrders(period)
  }, [tab, period, loadOrders])

  // ?tab=exchanges (from an exchange page or an update notification) opens the history.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "exchanges") setTab("orders")
  }, [])

  // The team moves exchanges on in CDASH; coming back to the page shows where they are now.
  useEffect(() => {
    if (tab !== "orders" || period === "custom") return
    // Quietly: the list stays on screen and is only swapped when the new one arrives.
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      fetch(`/api/orders?period=${period}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((data) => { if (data?.orders) setOrders(data.orders) }).catch(() => {})
    }
    document.addEventListener("visibilitychange", refresh)
    return () => document.removeEventListener("visibilitychange", refresh)
  }, [tab, period, loadOrders])

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customFrom || !customTo) return setOrdersError("Choose a start and end date.")
    if (customFrom > customTo) return setOrdersError("The start date must be before the end date.")
    loadOrders("custom", customFrom, customTo)
  }

  // Signing out clears the HTTP-only member cookie on the server and the
  // hints and cached catalogue this browser kept, so the next person on a
  // shared device starts at the gate.
  async function signOut() {
    setSigningOut(true)
    try { await fetch("/api/members/signout", { method: "POST" }) } catch { /* the cookie expires on its own */ }
    try {
      localStorage.removeItem("dlc_member_verified_v1")
      localStorage.removeItem("dlc_recent_products_v1")
      sessionStorage.removeItem("dlc_catalog_cache_v1")
    } catch { /* storage unavailable */ }
    window.location.href = "/"
  }

  /** One place to say what happened, so a success never lingers next to a failure. */
  const report = useCallback((ok: string, bad = "") => { setNotice(ok); setError(bad) }, [])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") || ""),
          mobileNumber: String(form.get("mobileNumber") || ""),
          residentialAddress: String(form.get("residentialAddress") || ""),
          marketingOptIn: form.get("marketingOptIn") === "on",
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save your details")
      setProfile(data.profile)
      report(data.unchanged ? "Nothing had changed." : "Your details are saved.")
    } catch (reason) {
      report("", reason instanceof Error ? reason.message : "Could not save your details")
    } finally { setBusy(false) }
  }

  async function unsave(productId: string) {
    setSavedItems((current) => current.filter((item) => item.id !== productId))
    await fetch("/api/wishlist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) }).catch(() => {})
  }

  async function moveToBag(item: SavedItem) {
    setBusy(true)
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: item.id, quantity: 1 }) })
      if (!response.ok) throw new Error("That item could not be added")
      const data = await response.json()
      setBagCount((data.lines as Array<{ quantity: number }>).reduce((sum, line) => sum + line.quantity, 0))
      report(`${item.name} is in your bag.`)
    } catch (reason) {
      report("", reason instanceof Error ? reason.message : "That item could not be added")
    } finally { setBusy(false) }
  }

  const statusTone = (status: string) =>
    /cancel|reject|fail/.test(status) ? "bad" : /complete|deliver|paid|collected/.test(status) ? "good" : /pending|new|received/.test(status) ? "blue" : "warn"
  const firstName = (profile?.name || "Member").split(" ")[0]

  if (loading) return <div className="sf"><StoreHeader current="account" /><main className="sf-main"><section className="sf-hero"><div><p className="sf-kicker">DLC MEMBER</p><h1 className="sf-title">Your<br />account.</h1></div></section><div className="sf-body"><LoadingLine context="account" /></div><SkeletonPage label="Opening your account" layout="single" /></main></div>

  return <div className="sf">
    <StoreHeader bagCount={bagCount} current="account" />
    <main className="sf-main" id="main-content">
      <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/index.html?home=1">LOUNGE</a><span>/</span><strong>ACCOUNT</strong></nav>
      <section className="sf-hero">
        <div>
          <p className="sf-kicker">DLC MEMBER{profile?.source === "staff" ? ` · STAFF · ${profile.role ?? ""}` : ""}</p>
          <h1 className="sf-title">Hey,<br />{firstName}.</h1>
          <p className="sf-sub">Your membership details, where exchange requests go, your exchange history and what you have saved for later.</p>
        </div>
        <div className="sf-hero-stats">
          <div className="sf-stat"><span>Member ID</span><strong>{profile?.memberId ?? "…"}</strong></div>
          {profile?.memberSince && <div className="sf-stat"><span>Member since</span><strong>{new Date(profile.memberSince).getFullYear()}</strong></div>}
          <button type="button" className="sf-ghost sf-signout" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </div>
      </section>

      <div className="sf-body">
        <div className="sf-tabs" role="tablist" aria-label="Account sections">
          {TABS.map((entry) => (
            <button key={entry.id} id={`tab-${entry.id}`} role="tab" aria-selected={tab === entry.id} aria-controls={`panel-${entry.id}`} className="sf-tab" onClick={() => { setTab(entry.id); report("") }}>
              {entry.label}
              {entry.id === "saved" && stockedItems.length > 0 && <small>{stockedItems.length}</small>}
            </button>
          ))}
        </div>

        {notice && <p className="sf-note sf-note--ok" role="status">{notice}{notice.includes("in your bag") && <> <a href="/bag">Review your bag →</a></>}</p>}
        {error && <p className="sf-error" role="alert">{error}</p>}

        {tab === "profile" && <section className="sf-panel" role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">
          <div className="sf-panel-head"><h2>My details</h2>{profile?.editable && <span className="sf-badge sf-badge--good"><i />Saved to your membership</span>}</div>
          {profile?.editable ? <form onSubmit={saveProfile}>
            <div className="sf-details">
              <div className="sf-stat"><span>Name</span><strong style={{ fontSize: 16 }}>{profile.name}</strong></div>
              {profile.dateOfBirth && <div className="sf-stat"><span>Date of birth</span><strong style={{ fontSize: 16 }}>{new Date(profile.dateOfBirth).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</strong></div>}
              <div className="sf-stat"><span>Member ID</span><strong style={{ fontSize: 16 }}>{profile.memberId}</strong></div>
            </div>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" defaultValue={profile.email ?? ""} required maxLength={160} /></div>
              <div className="sf-field"><label htmlFor="mobileNumber">Mobile number</label><input id="mobileNumber" name="mobileNumber" type="tel" autoComplete="tel" defaultValue={profile.mobileNumber ?? ""} required minLength={7} maxLength={30} /></div>
            </div>
            <div className="sf-field"><label htmlFor="residentialAddress">Residential address</label><textarea id="residentialAddress" name="residentialAddress" defaultValue={profile.residentialAddress ?? ""} required minLength={6} maxLength={500} /></div>
            <label className="sf-check"><input type="checkbox" name="marketingOptIn" defaultChecked={profile.marketingOptIn === true} /><span>Keep me posted on DLC drops, specials and member news.</span></label>
            <p className="sf-hint">Your name, ID number and date of birth are on the membership application you signed, so the team updates those. Ask any staff member. Everything else saves to your membership record straight away.</p>
            <button className="sf-cta" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
          </form> : <>
            <p className="sf-note">You are signed in with a staff account, so your details are managed with the team rather than here.</p>
            <div className="sf-details"><div className="sf-stat"><span>Member ID</span><strong style={{ fontSize: 16 }}>{profile?.memberId}</strong></div><div className="sf-stat"><span>Role</span><strong style={{ fontSize: 16 }}>{profile?.role ?? "Staff"}</strong></div></div>
          </>}
        </section>}

        {tab === "profile" && referralCode && <section className="sf-panel" aria-labelledby="referralHead">
          <div className="sf-panel-head"><h2 id="referralHead">Refer a friend</h2></div>
          <p className="sf-hint">Share your code. When a friend registers with it and completes their first exchange, you earn points.</p>
          <div className="sf-refcode">
            <strong aria-label={`Your referral code is ${referralCode}`}>{referralCode}</strong>
            <button type="button" className="sf-ghost" onClick={copyReferralCode}>{codeCopied ? "Copied" : "Copy code"}</button>
            <a className="sf-ghost" href="/referrals.html">How referrals work</a>
          </div>
        </section>}

        {tab === "orders" && <section role="tabpanel" id="panel-orders" aria-labelledby="tab-orders">
          <div className="sf-periods" role="group" aria-label="Show exchanges from">
            {PERIODS.map((entry) => <button key={entry.id} type="button" className="sf-chip" aria-pressed={period === entry.id} onClick={() => { setPeriod(entry.id); setOrdersError(""); if (entry.id === "custom") { setOrders([]); if (!customTo) setCustomTo(saToday()) } }}>{entry.label}</button>)}
          </div>
          {period === "custom" && <form className="sf-panel sf-custom-period" onSubmit={applyCustom}>
            <div className="sf-field"><label htmlFor="h-from">From</label><input id="h-from" type="date" max={customTo || saToday()} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required /></div>
            <div className="sf-field"><label htmlFor="h-to">To</label><input id="h-to" type="date" min={customFrom || undefined} max={saToday()} value={customTo} onChange={(e) => setCustomTo(e.target.value)} required /></div>
            <button className="sf-cta" disabled={ordersLoading}>{ordersLoading ? "Loading…" : "Show exchanges"}</button>
          </form>}
          {ordersError && <p className="sf-error" role="alert">{ordersError}</p>}
          {ordersLoading
            ? <div className="sf-orders" aria-busy="true">{[0, 1, 2].map((key) => <div className="sf-order" key={key}><div style={{ flex: 1 }}><span className="sk sk-line" style={{ width: "30%", marginTop: 0 }} /><span className="sk sk-line" style={{ width: "60%" }} /></div></div>)}</div>
            : orders.length === 0
              ? <div className="sf-empty"><strong>No exchanges {period === "all" ? "yet" : "in this period"}.</strong>{period === "all" ? "When you send an exchange request, you can follow it here." : "Try a longer period, or choose custom dates."}<div className="sf-actions"><a className="sf-cta" href="/strains.html?category=flower">Start browsing</a></div></div>
              : <><div className="sf-orders">
                {orderPages.visible.map((order) => <Link className="sf-order" key={order.id} href={`/exchange/${order.id}`}>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <small>{new Date(order.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · <em>View →</em></small>
                    {order.items.length > 0 && <small className="sf-order-items">{order.items.slice(0, 3).map((item) => `${item.quantity} × ${item.name}`).join(", ")}{order.items.length > 3 ? ` +${order.items.length - 3} more` : ""}</small>}
                  </div>
                  <span className={`sf-badge sf-badge--${statusTone(order.status)}`}><i />{exchangeStatus(order.status)}</span>
                </Link>)}
              </div><Pagination page={orderPages.page} pageCount={orderPages.pageCount} total={orders.length} perPage={ORDERS_PER_PAGE} label="Exchanges" onChange={orderPages.setPage} /></>}
        </section>}

        {tab === "saved" && <section role="tabpanel" id="panel-saved" aria-labelledby="tab-saved">
          {hiddenCount > 0 && <p className="sf-note">{hiddenCount} saved {hiddenCount === 1 ? "item is" : "items are"} out of stock right now and hidden. {hiddenCount === 1 ? "It comes" : "They come"} back here as soon as the lounge restocks.</p>}
          {stockedItems.length === 0
            ? hiddenCount > 0 ? null : <div className="sf-empty"><strong>Nothing saved yet.</strong>Tap the heart on anything in the <Link href="/menu" style={{ color: "var(--sf-blue)" }}>full menu</Link> to keep it here.</div>
            : <><div className="sf-products">
              {savedPages.visible.map((item) => {
                const image = imageFor(item)
                return <article className="sf-product" key={item.id}>
                  <a className="sf-product-art" href={productUrl(item)} aria-label={`View ${item.name}`}>{image ? <img src={image} alt="" /> : <span>DLC</span>}</a>
                  <div className="sf-product-meta">
                    <small>{shelfLabel(item)}</small>
                    <h3>{item.name}</h3>
                    <span className="sf-price">{credits(item.price)}</span>
                    <div className="sf-actions">
                      <button type="button" className="sf-chip" disabled={busy} onClick={() => moveToBag(item)}>Add to bag</button>
                      <button type="button" className="sf-chip sf-chip--danger" onClick={() => unsave(item.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              })}
            </div><Pagination page={savedPages.page} pageCount={savedPages.pageCount} total={stockedItems.length} perPage={SAVED_PER_PAGE} label="Saved items" onChange={savedPages.setPage} /></>}
        </section>}
      </div>

      <section className="sf-band" aria-label="Keep browsing">
        <div><span>DOWN LOW CANNABIS</span><h2>Keep it<br />down low.</h2></div>
        <div><p>Back to the shelf: flower and prerolls by cultivation tier, the wellness range and everything else.</p>
          <div className="sf-actions"><a href="/strains.html?category=flower">FLOWER</a><a href="/strains.html?category=prerolls">PREROLLS</a><a href="/strains.html?category=wellness&tier=wellness">WELLNESS</a></div></div>
      </section>
    </main>
    <StoreFooter />
  </div>
}

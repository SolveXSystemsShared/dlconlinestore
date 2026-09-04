"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { MascotLoader } from "@/components/mascot-loader"
import { Pagination, usePagination } from "@/components/pagination"
import { credits } from "@/lib/format"
import { SignOutButton } from "@/components/sign-out-button"
import type { CatalogProduct, MemberProfile, OrderSummary, SavedAddress } from "@/lib/types"

type Tab = "profile" | "addresses" | "orders" | "saved"
type SavedItem = CatalogProduct & { inStock: boolean }

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "Details" },
  { id: "addresses", label: "Addresses" },
  { id: "orders", label: "Orders" },
  { id: "saved", label: "Favourites" },
]

// An order history and a wishlist both grow without limit; addresses do not.
const ORDERS_PER_PAGE = 10
const SAVED_PER_PAGE = 12

const EMPTY_ADDRESS = { id: "", label: "", recipient: "", phone: "", line1: "", line2: "", suburb: "", city: "", postalCode: "", notes: "", isDefault: false }
type AddressDraft = typeof EMPTY_ADDRESS

export default function AccountPage() {
  const [tab, setTab] = useState<Tab>("profile")
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<AddressDraft | null>(null)

  // Keyed on length so removing the last item on a page steps back rather than
  // leaving an empty list behind.
  const orderPages = usePagination(orders, ORDERS_PER_PAGE, `orders-${orders.length}`)
  const savedPages = usePagination(savedItems, SAVED_PER_PAGE, `saved-${savedItems.length}`)

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.ok ? r.json() : null),
      fetch("/api/profile/addresses").then((r) => r.ok ? r.json() : null),
      fetch("/api/orders").then((r) => r.ok ? r.json() : null),
      fetch("/api/wishlist").then((r) => r.ok ? r.json() : null),
    ])
      .then(([p, a, o, w]) => {
        if (p?.profile) setProfile(p.profile)
        if (a?.addresses) setAddresses(a.addresses)
        if (o?.orders) setOrders(o.orders)
        if (w?.items) setSavedItems(w.items)
        if (!p?.profile) setError("We could not load your profile. Try reloading the page.")
      })
      .catch(() => setError("We could not load your account. Try reloading the page."))
      .finally(() => setLoading(false))
  }, [])

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

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      const editing = Boolean(draft.id)
      const response = await fetch(editing ? `/api/profile/addresses/${draft.id}` : "/api/profile/addresses", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save that address")
      const list = await (await fetch("/api/profile/addresses")).json()
      setAddresses(list.addresses)
      setDraft(null)
      report(editing ? "Address updated." : "Address saved.")
    } catch (reason) {
      report("", reason instanceof Error ? reason.message : "Could not save that address")
    } finally { setBusy(false) }
  }

  async function removeAddress(id: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/profile/addresses/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Could not remove that address")
      const list = await (await fetch("/api/profile/addresses")).json()
      setAddresses(list.addresses)
      report("Address removed.")
    } catch (reason) {
      report("", reason instanceof Error ? reason.message : "Could not remove that address")
    } finally { setBusy(false) }
  }

  async function unsave(productId: string) {
    const previous = savedItems
    const removed = previous.find((item) => item.id === productId)
    if (!removed) return
    setSavedItems((current) => current.filter((item) => item.id !== productId))
    report("")
    try {
      const response = await fetch("/api/wishlist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) })
      if (!response.ok) throw new Error("the wishlist refused the removal")
    } catch {
      // Put it back in its original position, so a refused delete does not
      // quietly reorder the list the member is looking at.
      setSavedItems(previous)
      report("", `${removed.name} could not be removed from your Favourites.`)
    }
  }

  async function moveToTray(item: SavedItem) {
    setBusy(true)
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: item.id, quantity: 1 }) })
      if (!response.ok) throw new Error("That item could not be added")
      report(`${item.name} is in your Tray.`)
    } catch (reason) {
      report("", reason instanceof Error ? reason.message : "That item could not be added")
    } finally { setBusy(false) }
  }

  if (loading) return <main className="shell"><section className="content"><MascotLoader label="Opening your account" size="lg" /></section></main>

  return <main className="shell">
    <header className="topbar">
      <Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link>
      <div className="account-header-actions"><SignOutButton className="button secondary switch-button" /><Link className="button secondary" href="/">Back to the lounge</Link></div>
    </header>

    <section className="content account-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow dark-eyebrow">Your account</div>
          <h2>{profile?.name || "Member"}</h2>
        </div>
        <p>{profile?.memberId}{profile?.source === "staff" ? <><br />DLC {profile.role}</> : null}</p>
      </div>

      <div className="account-tabs" role="tablist">
        {TABS.map((entry) => (
          <button key={entry.id} role="tab" aria-selected={tab === entry.id} className={`chip ${tab === entry.id ? "chip-on" : ""}`} onClick={() => { setTab(entry.id); report("") }}>
            {entry.label}
            {entry.id === "orders" && orders.length > 0 && <b> {orders.length}</b>}
            {entry.id === "saved" && savedItems.length > 0 && <b> {savedItems.length}</b>}
          </button>
        ))}
      </div>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {tab === "profile" && <div className="card account-card">
        {profile?.editable ? <form onSubmit={saveProfile}>
          <p className="notice">These are your DLC membership details. Changes save straight to your membership record, so the team sees them right away.</p>
          <div className="form-row">
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" defaultValue={profile.email ?? ""} required maxLength={160} /></div>
            <div className="field"><label htmlFor="mobileNumber">Mobile number</label><input id="mobileNumber" name="mobileNumber" defaultValue={profile.mobileNumber ?? ""} required minLength={7} maxLength={30} /></div>
          </div>
          <div className="field"><label htmlFor="residentialAddress">Residential address</label><textarea id="residentialAddress" name="residentialAddress" defaultValue={profile.residentialAddress ?? ""} required minLength={6} maxLength={500} /></div>
          <label className="field-consent"><input type="checkbox" name="marketingOptIn" defaultChecked={profile.marketingOptIn === true} /><span>Keep me posted on DLC drops, specials and member news.</span></label>
          <p className="field-hint">Your name, ID number and date of birth are on the membership application you signed, so the team updates those. Ask any staff member.</p>
          <button className="button" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        </form> : <>
          <p className="notice">You are signed in on your staff record, so your details are managed with the team rather than here.</p>
          <div className="detail-list"><div><span>Member ID</span><strong>{profile?.memberId}</strong></div><div><span>Role</span><strong>{profile?.role ?? "—"}</strong></div></div>
        </>}
      </div>}

      {tab === "addresses" && <div className="account-card">
        <p className="notice">Where your orders go. Separate from the residential address on your membership, so you can send an order anywhere.</p>
        <div className="address-grid">
          {addresses.map((address) => <div className="card address-card" key={address.id}>
            <div className="address-head"><strong>{address.label || address.recipient}</strong>{address.isDefault && <span className="tag">Default</span>}</div>
            <p>{address.recipient}<br />{address.phone}<br />{address.line1}{address.line2 ? <>, {address.line2}</> : null}<br />{[address.suburb, address.city, address.postalCode].filter(Boolean).join(", ")}</p>
            {address.notes && <p className="field-hint">{address.notes}</p>}
            <div className="address-actions">
              <button type="button" className="chip" onClick={() => setDraft({ ...EMPTY_ADDRESS, ...address, label: address.label ?? "", line2: address.line2 ?? "", suburb: address.suburb ?? "", city: address.city ?? "", postalCode: address.postalCode ?? "", notes: address.notes ?? "" })}>Edit</button>
              <button type="button" className="chip" disabled={busy} onClick={() => removeAddress(address.id)}>Remove</button>
            </div>
          </div>)}
          {addresses.length === 0 && <p className="empty">No delivery addresses saved yet.</p>}
        </div>

        {draft ? <form className="card" onSubmit={saveAddress}>
          <h3>{draft.id ? "Edit address" : "New address"}</h3>
          <div className="form-row">
            <div className="field"><label htmlFor="a-label">Label</label><input id="a-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Home, work…" maxLength={40} /></div>
            <div className="field"><label htmlFor="a-recipient">Recipient</label><input id="a-recipient" value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} required minLength={2} maxLength={120} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="a-phone">Contact number</label><input id="a-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} required minLength={7} maxLength={30} /></div>
            <div className="field"><label htmlFor="a-postal">Postal code</label><input id="a-postal" value={draft.postalCode} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} maxLength={20} /></div>
          </div>
          <div className="field"><label htmlFor="a-line1">Street address</label><input id="a-line1" value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} required minLength={3} maxLength={200} /></div>
          <div className="form-row">
            <div className="field"><label htmlFor="a-suburb">Suburb</label><input id="a-suburb" value={draft.suburb} onChange={(e) => setDraft({ ...draft, suburb: e.target.value })} maxLength={120} /></div>
            <div className="field"><label htmlFor="a-city">City</label><input id="a-city" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} maxLength={120} /></div>
          </div>
          <div className="field"><label htmlFor="a-notes">Delivery notes <span className="field-hint">(optional)</span></label><input id="a-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Gate code, landmark…" maxLength={300} /></div>
          <label className="field-consent"><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /><span>Use this address by default at checkout.</span></label>
          <div className="address-actions">
            <button className="button" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
            <button type="button" className="button secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form> : <button type="button" className="button" onClick={() => setDraft({ ...EMPTY_ADDRESS })}>Add an address</button>}
      </div>}

      {tab === "orders" && <div className="account-card">
        {orders.length === 0 ? <p className="empty">You have not placed an order yet.</p> : <><div className="order-list">
          {orderPages.visible.map((order) => <Link className="card order-row" key={order.id} href={`/order/${order.id}`}>
            <div><strong>{order.orderNumber}</strong><span className="field-hint">{new Date(order.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}</span></div>
            <div className="order-row-end"><span className={`tag status-${order.status}`}>{order.status.replaceAll("_", " ")}</span><strong>{credits(order.total)}</strong></div>
          </Link>)}
        </div><Pagination page={orderPages.page} pageCount={orderPages.pageCount} total={orders.length} perPage={ORDERS_PER_PAGE} label="Orders" onChange={orderPages.setPage} /></>}
      </div>}

      {tab === "saved" && <div className="account-card">
        {savedItems.length === 0 ? <p className="empty">Nothing saved yet. Tap the heart on anything in the lounge.</p> : <><div className="catalog-grid product-grid">
          {savedPages.visible.map((item) => <article className="card product-card" key={item.id}>
            <div className="product-details">
              <div><div className="product-kicker">{item.grade || item.brand || item.productType}</div><h3>{item.name}</h3></div>
              <div className="product-bottom">
                <span className="price">{item.inStock ? credits(item.price) : "Out of stock"}</span>
                <div className="address-actions">
                  {item.inStock && <button type="button" className="chip" disabled={busy} onClick={() => moveToTray(item)}>Add to Tray</button>}
                  <button type="button" className="chip" onClick={() => unsave(item.id)}>Remove</button>
                </div>
              </div>
            </div>
          </article>)}
        </div><Pagination page={savedPages.page} pageCount={savedPages.pageCount} total={savedItems.length} perPage={SAVED_PER_PAGE} label="Favourites" onChange={savedPages.setPage} /></>}
      </div>}
    </section>
  </main>
}

"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Pagination, usePagination } from "@/components/pagination"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { credits, exchangeStatus } from "@/lib/format"
import { imageFor, productUrl, shelfLabel } from "@/lib/storefront"
import type { CatalogProduct, MemberProfile, OrderSummary, SavedAddress } from "@/lib/types"

type Tab = "profile" | "addresses" | "orders" | "saved"
type SavedItem = CatalogProduct & { inStock: boolean }

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "My details" },
  { id: "addresses", label: "Addresses" },
  { id: "orders", label: "My exchanges" },
  { id: "saved", label: "Saved items" },
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
  const [bagCount, setBagCount] = useState<number | undefined>(undefined)

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

  if (loading) return <div className="sf"><StoreHeader current="account" /><div className="sf-loading"><strong>Opening your account…</strong></div></div>

  return <div className="sf">
    <StoreHeader bagCount={bagCount} current="account" />
    <main className="sf-main" id="main-content">
      <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/index.html#experience">LOUNGE</a><span>/</span><strong>ACCOUNT</strong></nav>
      <section className="sf-hero">
        <div>
          <p className="sf-kicker">DLC MEMBER{profile?.source === "staff" ? ` · STAFF · ${profile.role ?? ""}` : ""}</p>
          <h1 className="sf-title">Hey,<br />{firstName}.</h1>
          <p className="sf-sub">Your membership details, where exchange requests go, your exchange history and what you have saved for later.</p>
        </div>
        <div className="sf-hero-stats">
          <div className="sf-stat"><span>Member ID</span><strong>{profile?.memberId ?? "—"}</strong></div>
          <div className="sf-stat"><span>Exchanges</span><strong>{String(orders.length).padStart(2, "0")}</strong></div>
          {profile?.memberSince && <div className="sf-stat"><span>Member since</span><strong>{new Date(profile.memberSince).getFullYear()}</strong></div>}
        </div>
      </section>

      <div className="sf-body">
        <div className="sf-tabs" role="tablist" aria-label="Account sections">
          {TABS.map((entry) => (
            <button key={entry.id} id={`tab-${entry.id}`} role="tab" aria-selected={tab === entry.id} aria-controls={`panel-${entry.id}`} className="sf-tab" onClick={() => { setTab(entry.id); report("") }}>
              {entry.label}
              {entry.id === "addresses" && addresses.length > 0 && <small>{addresses.length}</small>}
              {entry.id === "orders" && orders.length > 0 && <small>{orders.length}</small>}
              {entry.id === "saved" && savedItems.length > 0 && <small>{savedItems.length}</small>}
            </button>
          ))}
        </div>

        {notice && <p className="sf-note sf-note--ok" role="status">{notice}{notice.includes("in your bag") && <> <a href="/bag">Review your bag →</a></>}</p>}
        {error && <p className="sf-error" role="alert">{error}</p>}

        {tab === "profile" && <section className="sf-panel" role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">
          <div className="sf-panel-head"><h2>My details</h2>{profile?.editable && <span className="sf-badge sf-badge--good"><i />Synced with CDASH</span>}</div>
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
            <p className="sf-hint">Your name, ID number and date of birth are on the membership application you signed, so the team updates those — ask any staff member. Everything else saves straight to CDASH.</p>
            <button className="sf-cta" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
          </form> : <>
            <p className="sf-note">You are signed in on your CDASH staff record, so your details are managed with the team rather than here.</p>
            <div className="sf-details"><div className="sf-stat"><span>Member ID</span><strong style={{ fontSize: 16 }}>{profile?.memberId}</strong></div><div className="sf-stat"><span>Role</span><strong style={{ fontSize: 16 }}>{profile?.role ?? "—"}</strong></div></div>
          </>}
        </section>}

        {tab === "addresses" && <section role="tabpanel" id="panel-addresses" aria-labelledby="tab-addresses">
          <p className="sf-note">Where your exchange requests go. Separate from the residential address on your membership, so you can send a request anywhere.</p>
          {addresses.length > 0 ? <div className="sf-cards">
            {addresses.map((address) => <article className="sf-card" key={address.id}>
              <div className="sf-card-head"><strong>{address.label || address.recipient}</strong>{address.isDefault && <span className="sf-badge sf-badge--blue">Default</span>}</div>
              <p>{address.recipient} · {address.phone}<br />{address.line1}{address.line2 ? <>, {address.line2}</> : null}<br />{[address.suburb, address.city, address.postalCode].filter(Boolean).join(", ")}</p>
              {address.notes && <p className="sf-hint" style={{ margin: 0 }}>{address.notes}</p>}
              <div className="sf-actions">
                <button type="button" className="sf-chip" onClick={() => setDraft({ ...EMPTY_ADDRESS, ...address, label: address.label ?? "", line2: address.line2 ?? "", suburb: address.suburb ?? "", city: address.city ?? "", postalCode: address.postalCode ?? "", notes: address.notes ?? "" })}>Edit</button>
                <button type="button" className="sf-chip sf-chip--danger" disabled={busy} onClick={() => removeAddress(address.id)}>Remove</button>
              </div>
            </article>)}
          </div> : !draft && <div className="sf-empty" style={{ marginBottom: 16 }}><strong>No addresses yet.</strong>Save one and your bag fills it in for you.</div>}

          {draft ? <form className="sf-panel" onSubmit={saveAddress}>
            <div className="sf-panel-head"><h3>{draft.id ? "Edit address" : "New address"}</h3></div>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="a-label">Label</label><input id="a-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Home, work…" maxLength={40} /></div>
              <div className="sf-field"><label htmlFor="a-recipient">Recipient</label><input id="a-recipient" autoComplete="name" value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} required minLength={2} maxLength={120} /></div>
            </div>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="a-phone">Contact number</label><input id="a-phone" type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} required minLength={7} maxLength={30} /></div>
              <div className="sf-field"><label htmlFor="a-postal">Postal code</label><input id="a-postal" autoComplete="postal-code" value={draft.postalCode} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} maxLength={20} /></div>
            </div>
            <div className="sf-field"><label htmlFor="a-line1">Street address</label><input id="a-line1" autoComplete="address-line1" value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} required minLength={3} maxLength={200} /></div>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="a-suburb">Suburb</label><input id="a-suburb" value={draft.suburb} onChange={(e) => setDraft({ ...draft, suburb: e.target.value })} maxLength={120} /></div>
              <div className="sf-field"><label htmlFor="a-city">City</label><input id="a-city" autoComplete="address-level2" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} maxLength={120} /></div>
            </div>
            <div className="sf-field"><label htmlFor="a-notes">Delivery notes <small>— optional</small></label><input id="a-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Gate code, landmark…" maxLength={300} /></div>
            <label className="sf-check"><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /><span>Use this address by default for exchange requests.</span></label>
            <div className="sf-actions">
              <button className="sf-cta" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
              <button type="button" className="sf-ghost" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form> : <button type="button" className="sf-cta" onClick={() => setDraft({ ...EMPTY_ADDRESS })}>+ Add an address</button>}
        </section>}

        {tab === "orders" && <section role="tabpanel" id="panel-orders" aria-labelledby="tab-orders">
          {orders.length === 0
            ? <div className="sf-empty"><strong>No exchanges yet.</strong>When you send an exchange request, you can follow it here.<div className="sf-actions"><a className="sf-cta" href="/strains.html?category=flower">Start browsing</a></div></div>
            : <><div className="sf-orders">
              {orderPages.visible.map((order) => <Link className="sf-order" key={order.id} href={`/exchange/${order.id}`}>
                <div><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · <em>View →</em></small></div>
                <span className={`sf-badge sf-badge--${statusTone(order.status)}`}><i />{exchangeStatus(order.status)}</span>
                <span className="sf-order-total">{credits(order.total)}</span>
              </Link>)}
            </div><Pagination page={orderPages.page} pageCount={orderPages.pageCount} total={orders.length} perPage={ORDERS_PER_PAGE} label="Exchanges" onChange={orderPages.setPage} /></>}
        </section>}

        {tab === "saved" && <section role="tabpanel" id="panel-saved" aria-labelledby="tab-saved">
          {savedItems.length === 0
            ? <div className="sf-empty"><strong>Nothing saved yet.</strong>Tap the heart on anything in the <Link href="/menu" style={{ color: "var(--sf-blue)" }}>full menu</Link> to keep it here.</div>
            : <><div className="sf-products">
              {savedPages.visible.map((item) => {
                const image = imageFor(item)
                return <article className="sf-product" key={item.id}>
                  <a className="sf-product-art" href={productUrl(item)} aria-label={`View ${item.name}`}>{image ? <img src={image} alt="" /> : <span>DLC</span>}</a>
                  <div className="sf-product-meta">
                    <small>{shelfLabel(item)}</small>
                    <h3>{item.name}</h3>
                    <span className="sf-price">{item.inStock ? credits(item.price) : <span className="sf-badge sf-badge--bad"><i />Out of stock</span>}</span>
                    <div className="sf-actions">
                      {item.inStock && <button type="button" className="sf-chip" disabled={busy} onClick={() => moveToBag(item)}>Add to bag</button>}
                      <button type="button" className="sf-chip sf-chip--danger" onClick={() => unsave(item.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              })}
            </div><Pagination page={savedPages.page} pageCount={savedPages.pageCount} total={savedItems.length} perPage={SAVED_PER_PAGE} label="Saved items" onChange={savedPages.setPage} /></>}
        </section>}
      </div>

      <section className="sf-band" aria-label="Keep browsing">
        <div><span>DOWN LOW CANNABIS</span><h2>Keep it<br />down low.</h2></div>
        <div><p>Back to the shelf — flower and prerolls by cultivation tier, the wellness range, and everything else.</p>
          <div className="sf-actions"><a href="/strains.html?category=flower">FLOWER</a><a href="/strains.html?category=prerolls">PREROLLS</a><a href="/strains.html?category=wellness&tier=wellness">WELLNESS</a></div></div>
      </section>
    </main>
    <StoreFooter />
  </div>
}

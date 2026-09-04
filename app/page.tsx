"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Reveal } from "@/components/reveal"
import { MascotLoader } from "@/components/mascot-loader"
import { LoungePhoto } from "@/components/lounge-photo"
import { ProductIcon } from "@/components/product-icon"
import { Toasts, useToasts } from "@/components/toast"
import { SignOutButton } from "@/components/sign-out-button"
import { applyFilters, Filters, NO_FILTERS, StoreFilters } from "@/components/store-filters"
import { Pagination, usePagination } from "@/components/pagination"
import { credits } from "@/lib/format"
import type { CatalogProduct, CartLine } from "@/lib/types"

// Two full rows on a laptop, eight screens-worth on a phone. Small enough that
// the grid paints quickly on a slow connection, large enough to browse.
const PER_PAGE = 24

// Confirm the exact spelling with the lounge before this goes live.
const LOUNGE_ADDRESS = "1 Scale End, Unit B12, Midrand"

export default function StorePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [scrollY, setScrollY] = useState(0)
  const { toasts, push, dismiss } = useToasts()

  useEffect(() => {
    fetch("/api/catalog")
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not load the catalogue")
        setProducts(data.products)
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  // The tray and saved items live on the member, not the browser, so both come
  // back on a different device. Neither is worth an error message if it fails —
  // the lounge still works without them.
  useEffect(() => {
    fetch("/api/cart").then((r) => r.ok ? r.json() : null).then((d) => d && setCart(d.lines)).catch(() => {})
    fetch("/api/wishlist").then((r) => r.ok ? r.json() : null)
      .then((d) => d && setSaved(new Set((d.items as CatalogProduct[]).map((item) => item.id))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const trayCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const filtered = useMemo(() => applyFilters(products, filters, saved), [products, filters, saved])
  // Changing any filter starts again at page one, so a narrowed list never
  // opens on a page that no longer exists.
  const { page, setPage, pageCount, visible } = usePagination(
    filtered,
    PER_PAGE,
    `${filters.category}|${filters.line}|${filters.search}|${filters.favouritesOnly}`,
  )

  // The camera stepping back out of the lounge: the photo shrinks and softens
  // over the first screenful, letting the pale browse background come up around
  // it. A ratio rather than a pixel count, so it reads the same on any height.
  const pullBack = Math.min(scrollY / 620, 1)
  const heroStyle = {
    transform: `scale(${(1.14 - pullBack * 0.28).toFixed(4)})`,
    borderRadius: `${(pullBack * 34).toFixed(1)}px`,
    opacity: (1 - pullBack * 0.55).toFixed(3),
  }

  // Move the stepper first so the tray responds immediately, then let the
  // server's answer be the truth — it is the one that knows what is left.
  const addToTray = useCallback(async (product: CatalogProduct) => {
    const current = cart.find((item) => item.id === product.id)?.quantity ?? 0
    const next = Math.min(current + 1, product.availableQuantity)
    if (next === current) return
    setCart((lines) => {
      const found = lines.find((item) => item.id === product.id)
      return found
        ? lines.map((item) => item.id === product.id ? { ...item, quantity: next } : item)
        : [...lines, { ...product, quantity: next }]
    })
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id, quantity: next }) })
      if (!response.ok) throw new Error("the tray refused the line")
      setCart((await response.json()).lines)
      push(`${product.name} added to your Tray`)
    } catch {
      // The tray never took it. Put this one line back where it was rather than
      // leave the counter advertising stock the server is not holding. Only
      // this product is touched, so a save that succeeded alongside it stands.
      setCart((lines) => current === 0
        ? lines.filter((item) => item.id !== product.id)
        : lines.map((item) => item.id === product.id ? { ...item, quantity: current } : item))
      push(`${product.name} could not be added to your Tray`, "bad")
    }
  }, [cart, push])

  const toggleSaved = useCallback(async (product: CatalogProduct) => {
    const on = saved.has(product.id)
    setSaved((current) => {
      const next = new Set(current)
      if (on) next.delete(product.id); else next.add(product.id)
      return next
    })
    try {
      const response = await fetch("/api/wishlist", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id }) })
      if (!response.ok) throw new Error("the favourites list refused the change")
      push(on ? `${product.name} removed from Favourites` : `${product.name} saved to Favourites`)
    } catch {
      // Same posture as the tray: put the heart back the way the server has it.
      setSaved((current) => {
        const next = new Set(current)
        if (on) next.add(product.id); else next.delete(product.id)
        return next
      })
      push(`${product.name} could not be ${on ? "removed from" : "saved to"} Favourites`, "bad")
    }
  }, [saved, push])

  return <main className="shell lounge-page">
    <header className="topbar floating-nav">
      <Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link>
      <nav className="desktop-nav" aria-label="Lounge navigation"><a href="#browse">Browse</a><a href="#visit">Visit</a><Link href="/account">Account</Link></nav>
      <div className="topbar-actions">
        <Link className="account-pill" href="/account" aria-label="Your account"><span aria-hidden="true">☺</span><b>Account</b></Link>
        <Link className="cart-pill" href="/checkout"><span>Tray</span><b>{String(trayCount).padStart(2, "0")}</b></Link>
        <SignOutButton className="switch-pill" />
      </div>
    </header>

    {/* Section 2 — the lounge itself, full-bleed, pulling back as you scroll. */}
    <section className="hero hero-lounge">
      <div className="hero-photo-frame">
        <LoungePhoto
          className="hero-photo"
          style={heroStyle}
          src="/assets/lounge-hero.jpg"
          alt="Inside the DLC lounge"
          note="Lounge hero photograph"
        />
      </div>
      <div className="hero-lounge-copy" style={{ opacity: (1 - pullBack * 1.5).toFixed(3) }}>
        <Reveal><div className="eyebrow">DLC member lounge</div></Reveal>
        <Reveal delay={80}><h1>Walk in.<br /><em>Take your time.</em></h1></Reveal>
        <Reveal delay={160}><div className="hero-actions"><a className="button hero-button" href="#browse">Browse the lounge <span>↓</span></a><span className="hero-caption">18+ · registered members only</span></div></Reveal>
      </div>
    </section>

    <div className="ticker" aria-label="DLC lounge highlights"><div className="ticker-track"><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i></div></div>

    {/* Section 5 — the browse surface, on the pale ground the pull-back reveals. */}
    <section className="content browse-section" id="browse">
      <div className="drifting-marks" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((n) => <img key={n} className={`drift-mark drift-${n}`} src="/assets/dlc-logo-black.png" alt="" />)}
      </div>
      <Reveal className="section-heading shop-heading"><div><div className="eyebrow dark-eyebrow">The current drop</div><h2>Pick your mood.</h2></div><p>Live lounge stock, always current.</p></Reveal>
      {loading && <MascotLoader label="Loading the drop" size="lg" />}
      {error && <p className="error">{error}</p>}
      {!loading && !error && products.length === 0 && <p className="empty">There are no published products available right now.</p>}
      {!loading && !error && products.length > 0 && <StoreFilters products={products} filters={filters} onChange={setFilters} resultCount={filtered.length} savedCount={saved.size} />}
      {!loading && !error && products.length > 0 && filtered.length === 0 && (
        <p className="empty">{filters.favouritesOnly ? "Nothing saved to Favourites yet. Tap the heart on anything you like." : "Nothing matches those filters. Try clearing one."}</p>
      )}
      <div className="catalog-grid product-grid">
        {visible.map((product, index) => <Reveal key={product.id} delay={(index % 4) * 70}><article className="card product-card product-card-new">
          <div className="product-art product-art-icon"><span>{product.productType}</span>
            <ProductIcon category={product.productType} grade={product.grade} />
            <button type="button" className={`save-button ${saved.has(product.id) ? "save-on" : ""}`} aria-pressed={saved.has(product.id)} aria-label={saved.has(product.id) ? `Remove ${product.name} from Favourites` : `Save ${product.name} to Favourites`} onClick={() => toggleSaved(product)}>{saved.has(product.id) ? "♥" : "♡"}</button>
          </div>
          <div className="product-details"><div><div className="product-kicker">{product.grade || product.brand || "DLC selection"}</div><h3>{product.name}</h3></div><div className="product-bottom"><span className="price">{credits(product.price)}</span><button className="add-button" aria-label={`Add ${product.name} to your Tray`} onClick={() => addToTray(product)}>+</button></div></div>
        </article></Reveal>)}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={filtered.length}
        perPage={PER_PAGE}
        label="Products"
        onChange={(next) => {
          setPage(next)
          // Send them back to the top of the grid rather than leaving them
          // halfway down a page they have not seen.
          document.getElementById("browse")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      />
    </section>

    {/* Section 3 — the second lounge photo, shot at a different hour, with the
        visit prompt and the address. */}
    <section className="visit-section" id="visit">
      <LoungePhoto
        className="visit-photo"
        src="/assets/lounge-visit.jpg"
        alt="The DLC lounge later in the day"
        note="Second lounge photograph"
      />
      <div className="visit-overlay">
        <Reveal><h2>Don&rsquo;t miss your visit<br /><em>to our lounge.</em></h2></Reveal>
        <Reveal delay={100}><address className="visit-address">{LOUNGE_ADDRESS}</address></Reveal>
      </div>
    </section>

    {/* Section 4 — the existing "Good energy. Delivered." banner, reused as-is. */}
    <section className="banner-section" aria-label="Good energy, delivered">
      <div className="banner-inner">
        <div className="banner-copy">
          <Reveal><h2>Good energy.<br /><em>Delivered.</em></h2></Reveal>
          <Reveal delay={80}><p>Curated essentials for the DLC community, with live availability and member-first fulfilment from the lounge you know.</p></Reveal>
          <Reveal delay={160}><a className="button" href="#browse">Browse the lounge</a></Reveal>
        </div>
        <div className="banner-visual" aria-hidden="true">
          <div className="banner-orbit" />
          <div className="banner-spark spark-one">✦</div><div className="banner-spark spark-two">✦</div>
          <img src="/assets/dlc-mascot-3d.jpg" alt="" />
          <div className="hero-sticker">DLC<br /><small>Since day one</small></div>
        </div>
      </div>
    </section>

    <footer className="footer footer-new"><img src="/assets/dlc-logo-black.png" alt="DLC" /><span>18+ · registered DLC members only</span><span>© DLC Online</span></footer>

    <Toasts toasts={toasts} onDismiss={dismiss} />
  </main>
}

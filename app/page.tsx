"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Reveal } from "@/components/reveal"
import { MascotLoader } from "@/components/mascot-loader"
import { applyFilters, Filters, NO_FILTERS, StoreFilters } from "@/components/store-filters"
import { Pagination, usePagination } from "@/components/pagination"
import { money } from "@/lib/format"
import type { CatalogProduct, CartLine } from "@/lib/types"

const artClasses = ["art-lime", "art-sand", "art-blue", "art-berry"]
// Two full rows on a laptop, eight screens-worth on a phone. Small enough that
// the grid paints quickly on a slow connection, large enough to browse.
const PER_PAGE = 24

export default function StorePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    fetch("/api/catalog")
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not load catalogue")
        setProducts(data.products)
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  // The bag and saved items live on the member, not the browser, so both come
  // back on a different device. Neither is worth an error message if it fails —
  // the store still works without them.
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

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const filtered = useMemo(() => applyFilters(products, filters), [products, filters])
  // Changing any filter starts again at page one, so a narrowed list never
  // opens on a page that no longer exists.
  const { page, setPage, pageCount, visible } = usePagination(filtered, PER_PAGE, `${filters.category}|${filters.line}|${filters.search}`)

  // Move the stepper first so the bag responds immediately, then let the
  // server's answer be the truth — it is the one that knows what is left.
  const addToCart = useCallback(async (product: CatalogProduct) => {
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
      if (response.ok) setCart((await response.json()).lines)
    } catch { /* the optimistic line stands; the next load reconciles it */ }
  }, [cart])

  const toggleSaved = useCallback(async (product: CatalogProduct) => {
    const on = saved.has(product.id)
    setSaved((current) => {
      const next = new Set(current)
      if (on) next.delete(product.id); else next.add(product.id)
      return next
    })
    try {
      await fetch("/api/wishlist", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id }) })
    } catch { /* same posture as the bag */ }
  }, [saved])

  return <main className="shell store-page">
    <header className="topbar floating-nav">
      <Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link>
      <nav className="desktop-nav" aria-label="Store navigation"><a href="#shop">Shop</a><a href="#why-dlc">Why DLC</a><a href="#drops">Drops</a><Link href="/account">Account</Link></nav>
      <div className="topbar-actions">
        <Link className="account-pill" href="/account" aria-label="Your account"><span aria-hidden="true">☺</span><b>Account</b></Link>
        <Link className="cart-pill" href="/checkout"><span>Bag</span><b>{String(cartCount).padStart(2, "0")}</b></Link>
      </div>
    </header>

    <section className="hero hero-reworked">
      <div className="sky-puffs" aria-hidden="true"><span className="puff p1"><i /></span><span className="puff p2"><i /></span><span className="puff p3"><i /></span><span className="puff p4"><i /></span><span className="puff p5"><i /></span><span className="puff p6"><i /></span></div>
      <div className="hero-grain" />
      <div className="hero-inner hero-grid">
        <div className="hero-copy">
          <Reveal><div className="eyebrow">DLC member store · live from CDASH</div></Reveal>
          <Reveal delay={80}><h1>Good energy.<br /><em>Delivered.</em></h1></Reveal>
          <Reveal delay={160}><p>Curated essentials for the DLC community, with live availability and member-first fulfilment from the store you know.</p></Reveal>
          <Reveal delay={240}><div className="hero-actions"><a className="button hero-button" href="#shop">Explore the drop <span>↓</span></a><span className="hero-caption">18+ · registered members only</span></div></Reveal>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-spark spark-one">✦</div><div className="hero-spark spark-two">✦</div>
          <div className="mascot-pedestal" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.12, 70)}px, 0)` }}><img src="/assets/dlc-mascot-3d.jpg" alt="" /></div>
          <div className="hero-sticker">DLC<br /><small>Since day one</small></div>
        </div>
      </div>
      <div className="hero-wave" />
    </section>

    <div className="ticker" aria-label="DLC store highlights"><div className="ticker-track"><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i></div></div>

    <section className="content shop-section" id="shop">
      <Reveal className="section-heading shop-heading"><div><div className="eyebrow dark-eyebrow">The current drop</div><h2>Pick your mood.</h2></div><p>Live CDASH stock, always current.</p></Reveal>
      {loading && <MascotLoader label="Loading the drop" size="lg" />}
      {error && <p className="error">{error}</p>}
      {!loading && !error && products.length === 0 && <p className="empty">There are no published products available right now.</p>}
      {!loading && !error && products.length > 0 && <StoreFilters products={products} filters={filters} onChange={setFilters} resultCount={filtered.length} />}
      {!loading && !error && products.length > 0 && filtered.length === 0 && <p className="empty">Nothing matches those filters. Try clearing one.</p>}
      <div className="catalog-grid product-grid">
        {visible.map((product, index) => <Reveal key={product.id} delay={(index % 4) * 70}><article className="card product-card product-card-new">
          <div className={`product-art ${artClasses[index % artClasses.length]}`}><span>{product.productType}</span><div className="art-ring" /><div className="art-dot" />
            <button type="button" className={`save-button ${saved.has(product.id) ? "save-on" : ""}`} aria-pressed={saved.has(product.id)} aria-label={saved.has(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`} onClick={() => toggleSaved(product)}>{saved.has(product.id) ? "♥" : "♡"}</button>
          </div>
          <div className="product-details"><div><div className="product-kicker">{product.grade || product.brand || "DLC selection"}</div><h3>{product.name}</h3></div><div className="product-bottom"><span className="price">{money(product.price)}</span><button className="add-button" aria-label={`Add ${product.name}`} onClick={() => addToCart(product)}>+</button></div></div>
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
          document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      />
    </section>

    <section className="manifesto-section" id="why-dlc">
      <div className="manifesto-shape shape-left" /><div className="manifesto-shape shape-right" />
      <div className="content manifesto-grid"><Reveal><div className="manifesto-art"><div className="manifesto-circle"><span>✳</span></div><div className="manifesto-label">DLC<br /><small>community goods</small></div></div></Reveal><Reveal delay={100}><div className="manifesto-copy"><div className="eyebrow">Why it feels different</div><h2>Built around<br /><em>your ritual.</em></h2><p>From the first tap to fulfilment, the store moves with the same care as the lounge. No mystery stock. No stale menus. Just the right things, ready when you are.</p><div className="manifesto-points"><div><b>01</b><span>Live stock from CDASH</span></div><div><b>02</b><span>Member-only access</span></div><div><b>03</b><span>WhatsApp-ready updates</span></div></div></div></Reveal></div>
    </section>

    <section className="content drops-section" id="drops"><Reveal className="section-heading"><div><div className="eyebrow dark-eyebrow">Stay in the loop</div><h2>New drops,<br />same good energy.</h2></div><p>Save the store link in WhatsApp<br />for quick access next time.</p></Reveal><Reveal delay={100}><div className="drop-banner"><div><span className="drop-number">03</span><div className="eyebrow">One shared flow</div><h3>Web, WhatsApp<br />& CDASH.</h3><p>One member profile. One live inventory. One order trail.</p></div><img src="/assets/dlc-mascot.png" alt="DLC mascot" /></div></Reveal></section>

    <footer className="footer footer-new"><img src="/assets/dlc-logo-black.png" alt="DLC" /><span>18+ · registered DLC members only</span><span>© DLC Online</span></footer>
  </main>
}

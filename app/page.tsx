"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Reveal } from "@/components/reveal"
import { money } from "@/lib/format"
import type { CatalogProduct, CartLine } from "@/lib/types"

const artClasses = ["art-lime", "art-sand", "art-blue", "art-berry"]

export default function StorePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
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

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const addToCart = (product: CatalogProduct) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      if (!found) return [...current, { ...product, quantity: 1 }]
      return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.availableQuantity) } : item)
    })
  }

  return <main className="shell store-page">
    <header className="topbar floating-nav">
      <Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link>
      <nav className="desktop-nav" aria-label="Store navigation"><a href="#shop">Shop</a><a href="#why-dlc">Why DLC</a><a href="#drops">Drops</a></nav>
      <Link className="cart-pill" href={{ pathname: "/checkout", query: { cart: JSON.stringify(cart.map(({ id, quantity }) => ({ id, quantity }))) } }}><span>Bag</span><b>{String(cartCount).padStart(2, "0")}</b></Link>
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
          <div className="mascot-pedestal" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.12, 70)}px, 0)` }}><img src="/assets/dlc-mascot.png" alt="" /></div>
          <div className="hero-sticker">DLC<br /><small>Since day one</small></div>
        </div>
      </div>
      <div className="hero-wave" />
    </section>

    <div className="ticker" aria-label="DLC store highlights"><div className="ticker-track"><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i><span>MEMBER FIRST</span><i>✳</i><span>LIVE INVENTORY</span><i>✳</i><span>GOOD ENERGY</span><i>✳</i></div></div>

    <section className="content shop-section" id="shop">
      <Reveal className="section-heading shop-heading"><div><div className="eyebrow dark-eyebrow">The current drop</div><h2>Pick your mood.</h2></div><p>Live CDASH stock, always current.</p></Reveal>
      {loading && <div className="catalog-grid"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && products.length === 0 && <p className="empty">There are no published products available right now.</p>}
      <div className="catalog-grid product-grid">
        {products.map((product, index) => <Reveal key={product.id} delay={(index % 4) * 70}><article className="card product-card product-card-new">
          <div className={`product-art ${artClasses[index % artClasses.length]}`}><span>{product.productType}</span><div className="art-ring" /><div className="art-dot" /></div>
          <div className="product-details"><div><div className="product-kicker">{product.grade || "DLC selection"}</div><h3>{product.name}</h3></div><div className="product-bottom"><span className="price">{money(product.price)}</span><button className="add-button" aria-label={`Add ${product.name}`} onClick={() => addToCart(product)}>+</button></div></div>
        </article></Reveal>)}
      </div>
    </section>

    <section className="manifesto-section" id="why-dlc">
      <div className="manifesto-shape shape-left" /><div className="manifesto-shape shape-right" />
      <div className="content manifesto-grid"><Reveal><div className="manifesto-art"><div className="manifesto-circle"><span>✳</span></div><div className="manifesto-label">DLC<br /><small>community goods</small></div></div></Reveal><Reveal delay={100}><div className="manifesto-copy"><div className="eyebrow">Why it feels different</div><h2>Built around<br /><em>your ritual.</em></h2><p>From the first tap to fulfilment, the store moves with the same care as the lounge. No mystery stock. No stale menus. Just the right things, ready when you are.</p><div className="manifesto-points"><div><b>01</b><span>Live stock from CDASH</span></div><div><b>02</b><span>Member-only access</span></div><div><b>03</b><span>WhatsApp-ready updates</span></div></div></div></Reveal></div>
    </section>

    <section className="content drops-section" id="drops"><Reveal className="section-heading"><div><div className="eyebrow dark-eyebrow">Stay in the loop</div><h2>New drops,<br />same good energy.</h2></div><p>Save the store link in WhatsApp<br />for quick access next time.</p></Reveal><Reveal delay={100}><div className="drop-banner"><div><span className="drop-number">03</span><div className="eyebrow">One shared flow</div><h3>Web, WhatsApp<br />& CDASH.</h3><p>One member profile. One live inventory. One order trail.</p></div><img src="/assets/dlc-mascot.png" alt="DLC mascot" /></div></Reveal></section>

    <footer className="footer footer-new"><img src="/assets/dlc-logo-black.png" alt="DLC" /><span>18+ · registered DLC members only</span><span>© DLC Online</span></footer>
  </main>
}

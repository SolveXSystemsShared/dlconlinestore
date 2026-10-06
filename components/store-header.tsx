"use client"

import { useEffect, useState } from "react"

// Line icons matching the storefront header (public/common.js).
const iconProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false }
const BagIcon = () => <svg className="sf-icon" {...iconProps}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
const MenuIcon = () => <svg className="sf-icon" {...iconProps}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
const CloseIcon = () => <svg className="sf-icon" {...iconProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>

/**
 * The storefront's white header, for the React pages.
 *
 * Links are plain anchors on purpose: the lounge and collections are static
 * pages in public/, not Next routes, so they need a full navigation.
 * `bagCount` lets a page that already holds the bag (checkout) keep the pill
 * live as lines change; without it the header reads the saved bag itself.
 */
export function StoreHeader({ bagCount, current }: { bagCount?: number; current?: "account" | "bag" }) {
  const [fetched, setFetched] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (bagCount !== undefined) return
    fetch("/api/cart")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setFetched((data.lines as Array<{ quantity: number }>).reduce((sum, line) => sum + line.quantity, 0)))
      .catch(() => {})
  }, [bagCount])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [open])

  const count = bagCount ?? fetched ?? 0
  const links = <>
    <a href="/index.html?home=1">LOUNGE</a>
    <a href="/strains.html?category=flower">FLOWER</a>
    <a href="/strains.html?category=prerolls">PREROLLS</a>
    <a href="/strains.html?category=wellness&tier=wellness">WELLNESS</a>
    <a href="/strains.html?category=more">MORE</a>
    <a href="/packages.html">PACKAGES</a>
    <a href="/specials.html">SPECIALS</a>
    <a href="/account" aria-current={current === "account" ? "page" : undefined}>ACCOUNT</a>
  </>

  return <>
    <a className="sf-skip" href="#main-content">Skip to main content</a>
    <header className="sf-nav">
      <a className="sf-brand" href="/index.html?home=1" aria-label="Down Low Cannabis home">
        <img src="/assets/dlc-logo.svg" alt="Down Low Cannabis logo" width={52} height={52} />
      </a>
      <nav className="sf-nav-links" aria-label="Primary navigation">{links}</nav>
      <div className="sf-nav-actions">
        <a className="sf-icon-btn sf-bag-btn" href="/bag" data-label="Bag" aria-current={current === "bag" ? "page" : undefined} aria-label={`Your bag, ${count} ${count === 1 ? "item" : "items"}`}><BagIcon />{count > 0 && <b className="sf-badge-count">{count > 99 ? "99+" : count}</b>}</a>
        <span className="sf-pill sf-age">18+</span>
        <button type="button" className="sf-icon-btn sf-menu" data-label={open ? "Close" : "Menu"} aria-expanded={open} aria-controls="sfMobileNav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          <span className="sf-icon-swap sf-icon-swap--open"><MenuIcon /></span><span className="sf-icon-swap sf-icon-swap--close"><CloseIcon /></span>
        </button>
      </div>
    </header>
    <nav id="sfMobileNav" className="sf-mobile-nav" hidden={!open} aria-label="Mobile navigation" onClick={() => setOpen(false)}>{links}</nav>
  </>
}

/** Back to top — same behaviour as the storefront's (public/common.js). */
function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.2)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  return <button type="button" className={`sf-to-top ${visible ? "is-visible" : ""}`} aria-label="Back to top" onClick={toTop} tabIndex={visible ? 0 : -1}><span aria-hidden="true">↑</span></button>
}

export function StoreFooter() {
  return <>
  <BackToTop />
  <footer className="sf-footer">
    <div className="sf-footer-brand"><img src="/assets/dlc-logo.svg" alt="" width={52} height={52} /><span>DOWN LOW CANNABIS</span></div>
    <nav aria-label="Footer"><a href="/packages.html">PACKAGES</a><a href="/specials.html">SPECIALS</a><a href="/referrals.html">REFERRALS</a><a href="/privacy.html">PRIVACY</a><a href="/terms.html">TERMS</a><a href="/cookies.html">COOKIES</a><a href="#cookie-settings" data-cookie-settings>COOKIE SETTINGS</a></nav>
    <p>18+ · Halfway House, Midrand</p>
  </footer>
  </>
}

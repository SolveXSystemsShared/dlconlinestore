"use client"

import { useEffect } from "react"

/**
 * A short confetti shower the moment a card settlement is confirmed.
 *
 * The settle panel marks the exchange in session storage when Paystack's answer
 * comes back settled; the settled page then plays this once and clears the
 * mark, so a reload, a later visit or the account history never replays it.
 * Drawn on a canvas made here, with no outside script, and skipped entirely
 * for members who ask for reduced motion.
 */
const KEY = "dlc_settled_celebration"
const DURATION_MS = 3000
const COLOURS = ["#41a8fc", "#1a6ef0", "#ffffff", "#9fd3ff", "#2f9e5a", "#ffc94a"]

export function markSettledForCelebration(orderId: string) {
  try { sessionStorage.setItem(KEY, orderId) } catch {}
}

// Survives React's development double-run of effects, so the shower still plays once.
let armedFor: string | null = null

type Piece = { x: number; y: number; vx: number; vy: number; size: number; angle: number; spin: number; wobble: number; colour: string; shape: 0 | 1 | 2; delay: number }

export function SettledCelebration({ orderId }: { orderId: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === orderId) {
        sessionStorage.removeItem(KEY)
        armedFor = orderId
      }
    } catch {}
    if (armedFor !== orderId) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { armedFor = null; return }

    const canvas = document.createElement("canvas")
    canvas.className = "sf-confetti"
    canvas.setAttribute("aria-hidden", "true")
    document.body.appendChild(canvas)
    const context = canvas.getContext("2d")
    if (!context) { canvas.remove(); armedFor = null; return }

    const scale = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const count = width < 600 ? 110 : 180
    // Spread above the screen and staggered, so it keeps falling for the full three seconds.
    const pieces: Piece[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.6,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 2.2 + Math.random() * 2.8,
      size: 6 + Math.random() * 7,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.25,
      wobble: Math.random() * Math.PI * 2,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      shape: Math.random() < 0.12 ? 2 : Math.random() < 0.55 ? 0 : 1,
      delay: Math.random() * 900,
    }))
    // Clouds stay cloud coloured.
    for (const p of pieces) if (p.shape === 2) p.colour = Math.random() < 0.6 ? "#ffffff" : "#9fd3ff"

    // A small cloud, the DLC shape, for a few of the pieces.
    const cloud = (size: number) => {
      const r = size / 2
      context.beginPath()
      context.arc(-r * 0.7, r * 0.15, r * 0.55, 0, Math.PI * 2)
      context.arc(0, -r * 0.15, r * 0.75, 0, Math.PI * 2)
      context.arc(r * 0.75, r * 0.2, r * 0.5, 0, Math.PI * 2)
      context.rect(-r * 1.2, r * 0.1, r * 2.4, r * 0.6)
      context.fill()
    }

    let frame = 0
    let start = 0
    let last = 0
    const draw = (now: number) => {
      if (!start) { start = now; last = now }
      const elapsed = now - start
      const step = Math.min((now - last) / 16.7, 3)
      last = now
      context.clearRect(0, 0, width, height)
      // The last 700ms fade out, so the shower settles rather than stops.
      context.globalAlpha = elapsed > DURATION_MS - 700 ? Math.max((DURATION_MS - elapsed) / 700, 0) : 1
      for (const p of pieces) {
        if (elapsed < p.delay) continue
        p.wobble += 0.08 * step
        p.x += (p.vx + Math.sin(p.wobble) * 0.9) * step
        p.y += p.vy * step
        p.vy = Math.min(p.vy + 0.025 * step, 5.5)
        p.angle += p.spin * step
        if (p.y > height + 20) continue
        context.save()
        context.translate(p.x, p.y)
        context.rotate(p.angle)
        context.fillStyle = p.colour
        if (p.colour === "#ffffff") { context.shadowColor = "rgba(26,110,240,.35)"; context.shadowBlur = 3 }
        if (p.shape === 0) context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.wobble)) + 1)
        else if (p.shape === 1) { context.beginPath(); context.arc(0, 0, p.size / 3, 0, Math.PI * 2); context.fill() }
        else cloud(p.size * 1.6)
        context.restore()
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(draw)
      else finish()
    }
    const finish = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
      canvas.remove()
    }
    frame = requestAnimationFrame((now) => { draw(now); armedFor = null })

    return finish
  }, [orderId])

  return null
}

"use client"

import { useEffect, useState } from "react"

/** True once `active` has lasted longer than a fast connection would take. */
export function useSlowFlag(active: boolean, afterMs = 4000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) { setSlow(false); return }
    const timer = setTimeout(() => setSlow(true), afterMs)
    return () => clearTimeout(timer)
  }, [active, afterMs])
  return slow
}

export function SlowNotice({ show, what }: { show: boolean; what: string }) {
  return show ? <p className="sf-slow" role="status">Your connection seems slow. {what} is still loading…</p> : null
}

// Same three acts and lines as public/loading-lines.js — change both together.
const OPENERS: Record<string, string[]> = {
  bag: ["Unpacking your bag…", "Working out your credits…"],
  account: ["Opening your account…", "Dusting off your member card…"],
  exchange: ["Finding your exchange request…", "Checking in with the team…"],
}
const NETWORK = [
  "Your signal is taking the scenic route…",
  "Slow connection. We’re still coming, promise.",
  "The network’s moving at lounge pace today.",
]
const CHEEKY = [
  "Good things take time. So does this network.",
  "The mascot is stretching. Almost there…",
  "Still here? Legend. Nearly done.",
  "Rolling out the welcome mat…",
  "Checking the shelves twice, just for you…",
  "Taking it low and slow…",
  "Worth the wait. Mostly the network’s fault.",
]

/** A rotating line to keep a member company while a page loads. */
export function LoadingLine({ context }: { context: keyof typeof OPENERS }) {
  const openers = OPENERS[context]
  const [text, setText] = useState(openers[0])
  const [swapping, setSwapping] = useState(false)

  useEffect(() => {
    const started = Date.now()
    let opener = 0
    let network = 0
    let cheeky = Math.floor(Math.random() * CHEEKY.length)
    let swap: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      const elapsed = Date.now() - started
      const next = elapsed < 5000 && opener < openers.length - 1 ? openers[++opener]
        : elapsed >= 5000 && network < 1 ? NETWORK[(network++, Math.floor(Math.random() * NETWORK.length))]
        : CHEEKY[cheeky++ % CHEEKY.length]
      setSwapping(true)
      swap = setTimeout(() => { setText(next); setSwapping(false) }, 180)
    }, 2600)
    return () => { clearInterval(timer); if (swap) clearTimeout(swap) }
  }, [openers])

  return <p className={`sf-loading-line ${swapping ? "is-swapping" : ""}`} role="status" aria-live="polite">{text}</p>
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { credits } from "@/lib/format"

/**
 * Settling an exchange request by card, on its own page.
 *
 * Two jobs. When the member comes back from Paystack (?reference=…), finish the
 * settlement straight away rather than waiting for the webhook. Otherwise offer
 * the card settlement — first time, after an abandoned checkout, or after the
 * figure moved and the earlier one was returned.
 */
export function SettlePanel({ orderId, amountDue, returnedReference }: { orderId: string; amountDue: number | null; returnedReference: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(Boolean(returnedReference))
  const [message, setMessage] = useState("")
  const confirmed = useRef(false)

  useEffect(() => {
    if (!returnedReference || confirmed.current) return
    confirmed.current = true
    fetch(`/api/orders/${orderId}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", reference: returnedReference }),
    })
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!ok) return setMessage(data.error || "We could not confirm your settlement yet. Refresh this page in a minute.")
        if (data.outcome === "not_paid") return setMessage("Your card settlement was not completed. You can try again below.")
        // Settled or returned: the page itself now says which. Drop the
        // reference so a reload does not confirm a second time.
        router.replace(`/exchange/${orderId}`)
        router.refresh()
      })
      .catch(() => setMessage("We could not confirm your settlement yet. Refresh this page in a minute."))
      .finally(() => setConfirming(false))
  }, [orderId, returnedReference, router])

  async function settle() {
    setMessage("")
    setBusy(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "We could not open settlement just now.")
      window.location.assign(data.authorizationUrl)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not open settlement just now.")
      setBusy(false)
    }
  }

  if (confirming) return <p className="sf-note" role="status">Confirming your settlement…</p>

  return <div>
    {message && <p className="sf-error" role="alert">{message}</p>}
    <button type="button" className="sf-cta sf-cta--block" disabled={busy} onClick={settle}>
      {busy ? "Opening secure settlement…" : <>Settle {amountDue ? credits(amountDue) : ""} by card <span>→</span></>}
    </button>
    <p className="sf-fineprint">You settle on Paystack&apos;s secure page. Your card details go to Paystack, never to DLC.</p>
  </div>
}

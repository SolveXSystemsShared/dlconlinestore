"use client"

import { useState } from "react"

/**
 * Hands the lounge back to whoever is next.
 *
 * Drops the Member ID cookie and reloads, which puts the gate on its Member ID
 * step so a different member can sign in on the same device. A full navigation
 * rather than a router refresh, so no page keeps another member's tray or
 * favourites in memory after the switch.
 */
export function SignOutButton({ className = "", label = "Switch member" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await fetch("/api/members/session", { method: "DELETE" })
    } catch {
      // Even if the call failed the safest thing is still to reload and let the
      // gate re-check the cookie rather than leave them on a half-signed-out page.
    }
    window.location.assign("/")
  }

  return (
    <button type="button" className={className} disabled={busy} onClick={signOut} aria-label="Sign out and switch member">
      <span aria-hidden="true">⇄</span> <b>{busy ? "Signing out…" : label}</b>
    </button>
  )
}

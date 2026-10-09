"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Re-reads a server-rendered page while it is open, so an exchange the team
 * moves on in CDASH (preparing, ready to collect) shows without a reload.
 * Checks when the member comes back to the tab and every `everyMs` while it is
 * visible; renders nothing.
 */
export function LiveRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh() }
    const timer = window.setInterval(refresh, everyMs)
    document.addEventListener("visibilitychange", refresh)
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [router, everyMs])
  return null
}

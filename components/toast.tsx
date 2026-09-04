"use client"

import { useCallback, useRef, useState } from "react"

/**
 * Brief, non-blocking confirmations — "Added to your Tray" and its failure
 * counterpart. Nothing here traps focus or waits for a click: each note
 * announces itself politely and clears itself after a few seconds.
 */
export type Toast = { id: number; text: string; tone: "ok" | "bad" }

const LIFETIME_MS = 3200

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    timers.current.push(window.setTimeout(() => dismiss(id), LIFETIME_MS))
  }, [dismiss])

  return { toasts, push, dismiss }
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast-${toast.tone}`}
          onClick={() => onDismiss(toast.id)}
          aria-label={`${toast.text}. Dismiss`}
        >
          <span aria-hidden="true">{toast.tone === "ok" ? "✓" : "!"}</span>
          {toast.text}
        </button>
      ))}
    </div>
  )
}

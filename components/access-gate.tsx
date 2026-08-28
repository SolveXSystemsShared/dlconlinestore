"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { formatMemberId, isCompleteMemberId, MEMBER_ID_PREFIX } from "@/lib/format"
import { MascotLoader } from "@/components/mascot-loader"

type GateState = "age" | "member" | "allowed" | "blocked"

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Registration is for people who have no Member ID yet, so it must sit behind
  // the 18+ check but in front of the member check — otherwise the Register
  // link loops straight back to this gate.
  const isRegistration = pathname === "/register"
  const [state, setState] = useState<GateState>("age")
  const [memberId, setMemberId] = useState(MEMBER_ID_PREFIX)
  const [memberName, setMemberName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function confirmAge() {
    setBusy(true)
    setError("")
    try {
      const ageResponse = await fetch("/api/access/age", { method: "POST" })
      if (!ageResponse.ok) throw new Error("Age confirmation could not be recorded")
      if (isRegistration) { setState("member"); return }
      const sessionResponse = await fetch("/api/members/session")
      if (sessionResponse.ok) {
        const data = await sessionResponse.json()
        setMemberName(data.member.name)
        setState("allowed")
      } else {
        setState("member")
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again")
    } finally { setBusy(false) }
  }

  // The "DLC-" prefix is furniture, not editable text: keep the caret after it
  // and stop Backspace from eating into it.
  function caretToEnd(event: { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    requestAnimationFrame(() => {
      if ((input.selectionStart ?? 0) < MEMBER_ID_PREFIX.length) {
        input.setSelectionRange(input.value.length, input.value.length)
      }
    })
  }

  function keepPrefix(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const start = input.selectionStart ?? 0
    if (event.key === "Backspace" && start <= MEMBER_ID_PREFIX.length && start === (input.selectionEnd ?? 0)) {
      event.preventDefault()
    }
  }

  async function verifyMember(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/members/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Active DLC member not found")
      setMemberName(data.member.name)
      setState("allowed")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Member verification failed")
    } finally { setBusy(false) }
  }

  if (state === "allowed") return <>{children}</>
  if (isRegistration && state === "member") return <>{children}</>

  return <div className="gate-screen">
    {/* Greets on arrival, then picks up pulse rings while a request is in flight. */}
    <div className="gate-figure"><MascotLoader size="lg" rings={busy} label={busy ? "One moment" : ""} /></div>
    <div className="gate-card">
      <img className="gate-mark" src="/assets/dlc-logo-black.png" alt="DLC" />
      <div className="eyebrow">DLC member store</div>
      {state === "age" && <>
        <h1 className="gate-title">18+ only.</h1>
        <p>This store is for registered DLC members who are 18 years or older.</p>
        <div className="gate-actions"><button className="button" disabled={busy} onClick={confirmAge}>I am 18 or older</button><button className="gate-leave" onClick={() => setState("blocked")}>I am under 18</button></div>
      </>}
      {state === "blocked" && <>
        <h1 className="gate-title">Access unavailable.</h1>
        <p>You must be 18 or older to access the DLC Online Store.</p>
      </>}
      {state === "member" && <>
        <h1 className="gate-title">Members only.</h1>
        <p>Enter the active DLC Member ID already registered in CDASH to continue.</p>
        <form onSubmit={verifyMember}>
          <div className="field"><label htmlFor="gate-member-id">DLC Member ID</label><input id="gate-member-id" autoFocus inputMode="numeric" value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" required /></div>
          {error && <p className="gate-error">{error}</p>}
          <button className="button" disabled={busy || !isCompleteMemberId(memberId)}>{busy ? "Checking…" : "Enter store"}</button>
        </form>
        <p className="gate-register">No Member ID yet? <Link href="/register">Register</Link></p>
      </>}
      {state === "age" && error && <p className="gate-error">{error}</p>}
      {memberName && <p className="gate-welcome">Welcome, {memberName}.</p>}
    </div>
  </div>
}

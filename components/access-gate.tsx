"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { formatMemberId, isCompleteMemberId, MEMBER_ID_PREFIX } from "@/lib/format"

type GateState = "checking" | "age" | "member" | "allowed" | "blocked"

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Registration is for people who have no Member ID yet, so it must sit behind
  // the 18+ check but in front of the member check — otherwise the Register
  // link loops straight back to this gate.
  const isRegistration = pathname === "/register"
  // Starts at "checking", never at "age": the signed cookies survive reloads and
  // deep links, so an already-verified member must be let back in rather than
  // re-asked for a Member ID they have already entered.
  const [state, setState] = useState<GateState>("checking")
  const [memberId, setMemberId] = useState(MEMBER_ID_PREFIX)
  const [memberName, setMemberName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  /** Reads the signed cookies and returns the gate screen they entitle you to. */
  const restoreSession = useCallback(async (): Promise<GateState> => {
    const response = await fetch("/api/members/session")
    if (!response.ok) return "age"
    const data = await response.json()
    if (data.member) {
      setMemberName(data.member.name)
      return "allowed"
    }
    return data.ageConfirmed ? "member" : "age"
  }, [])

  useEffect(() => {
    let cancelled = false
    restoreSession()
      // A failed check must never lock a member out; fall back to the full gate.
      .catch(() => "age" as GateState)
      .then((next) => { if (!cancelled) setState(next) })
    return () => { cancelled = true }
  }, [restoreSession])

  async function confirmAge() {
    setBusy(true)
    setError("")
    try {
      const ageResponse = await fetch("/api/access/age", { method: "POST" })
      if (!ageResponse.ok) throw new Error("Age confirmation could not be recorded")
      if (isRegistration) { setState("member"); return }
      setState(await restoreSession())
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

  // Same look as the storefront's gate (public/age-gate.js), so a member who
  // lands on a React page first sees one consistent DLC entrance.
  return <div className="sfgate" role="dialog" aria-modal="true" aria-labelledby="sfgateTitle" data-state={state}>
    <div className="sfgate__noise" aria-hidden="true" />
    <div className="sfgate__panel">
      <img className="sfgate__logo" src="/assets/dlc-logo.svg" alt="Down Low Cannabis" />
      {state === "checking" && <>
        <p className="sfgate__eyebrow">DOWN LOW CANNABIS</p>
        <h1 id="sfgateTitle" className="sfgate__pulse">One<br />moment.</h1>
      </>}
      {state === "age" && <>
        <p className="sfgate__eyebrow">WELCOME TO DOWN LOW CANNABIS</p>
        <h1 id="sfgateTitle">Are you<br />18 or older?</h1>
        <p className="sfgate__copy">Please confirm that you are 18 years of age or older before entering the Down Low Cannabis website.</p>
        <div className="sfgate__actions">
          <button className="sfgate__btn sfgate__btn--yes" disabled={busy} onClick={confirmAge} autoFocus>YES, ENTER SITE</button>
          <button className="sfgate__btn" onClick={() => setState("blocked")}>NO, I’M UNDER 18</button>
        </div>
        {error && <p className="sfgate__error" role="alert">{error}</p>}
      </>}
      {state === "blocked" && <>
        <p className="sfgate__eyebrow">ACCESS RESTRICTED</p>
        <h1 id="sfgateTitle">You must be<br />18+ to enter.</h1>
        <p className="sfgate__copy">This website is restricted to adults aged 18 and older.</p>
      </>}
      {state === "member" && <form onSubmit={verifyMember}>
        <p className="sfgate__eyebrow">DLC MEMBERS ONLY</p>
        <h1 id="sfgateTitle">Enter your<br />Member ID.</h1>
        <p className="sfgate__copy">Use the active DLC Member ID registered at the lounge. Your bag, exchanges and member benefits follow it.</p>
        <label className="sfgate__field">
          <span>DLC MEMBER ID</span>
          <input id="gate-member-id" autoFocus inputMode="numeric" autoComplete="off" spellCheck={false} value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" aria-describedby={error ? "sfgateError" : undefined} required />
        </label>
        {error && <p className="sfgate__error" id="sfgateError" role="alert">{error}</p>}
        <div className="sfgate__actions"><button className="sfgate__btn sfgate__btn--yes" disabled={busy || !isCompleteMemberId(memberId)}>{busy ? "CHECKING…" : "ENTER"}</button></div>
        <p className="sfgate__legal">No Member ID yet? <Link href="/register">Register as a member</Link></p>
      </form>}
      {memberName && <p className="sfgate__copy">Welcome, {memberName}.</p>}
      {state !== "checking" && <p className="sfgate__legal">By entering, you confirm that you meet the minimum age requirement. <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/cookies.html">Cookies</a></p>}
    </div>
  </div>
}

"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { formatMemberId, isCompleteMemberId, MEMBER_ID_PREFIX } from "@/lib/format"

type GateState = "checking" | "age" | "member" | "pin" | "allowed" | "blocked"

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
  // Where the SMS PIN went, and when another may be asked for.
  const [sentTo, setSentTo] = useState("")
  const [pin, setPin] = useState("")
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (state !== "pin") return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state])

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

  /** Step one: a PIN by SMS to the number CDASH holds for the member. */
  async function requestPin(event?: FormEvent, resend = false) {
    event?.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/members/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId }) })
      const data = await response.json().catch(() => ({}))
      if (data.retryAfter) setResendAt(Date.now() + data.retryAfter * 1000)
      if (!response.ok) throw new Error(data.error || "We could not send your PIN")
      setSentTo(data.sentTo)
      setResendAt(Date.now() + (data.resendAfter || 60) * 1000)
      setPin("")
      setState("pin")
      if (resend) setNotice("New PIN sent.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send your PIN")
    } finally { setBusy(false) }
  }

  /** Step two: the PIN from the SMS. Only this sets the member cookie. */
  async function checkPin(value: string) {
    if (!/^\d{6}$/.test(value) || busy) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/members/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId, pin: value }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "That PIN did not work")
      setMemberName(data.member.name)
      setState("allowed")
    } catch (reason) {
      setPin("")
      setError(reason instanceof Error ? reason.message : "That PIN did not work")
    } finally { setBusy(false) }
  }

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000))

  if (state === "allowed") return <>{children}</>
  if (isRegistration && state === "member") return <>{children}</>

  // Same look as the storefront's gate (public/age-gate.js): light-blue sky,
  // the 3D mascot feathered into it, the form on a white card.
  const bubble = {
    checking: "One sec, just checking you in…",
    age: "Howzit! Quick check before we go in.",
    blocked: "Sorry, this one is for adults only.",
    member: "Welcome in. Pop your Member ID below.",
    pin: "Nearly there. Check your SMS for the PIN.",
    allowed: "",
  }[state]

  return <div className={`sfgate ${busy ? "is-busy" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sfgateTitle" data-state={state}>
    <div className="sfgate__sky" aria-hidden="true"><span /><span /><span /></div>
    <div className="sfgate__stage">
      <figure className="sfgate__mascot" aria-hidden="true">
        <p className="sfgate__bubble" key={state}>{bubble}</p>
        <img src="/assets/dlc-mascot-3d.jpg" alt="" width={506} height={760} decoding="async" />
        <span className="sfgate__shadow" />
      </figure>
      <div className="sfgate__card">
        <img className="sfgate__logo" src="/assets/dlc-logo.svg" alt="Down Low Cannabis" width={108} height={35} />
        {state === "checking" && <>
          <p className="sfgate__eyebrow">DOWN LOW CANNABIS</p>
          <h1 id="sfgateTitle">One<br />moment.</h1>
          <div className="sfgate__progress" role="progressbar" aria-label="Checking your session"><span /></div>
        </>}
        {state === "age" && <>
          <p className="sfgate__eyebrow">WELCOME TO DOWN LOW CANNABIS</p>
          <h1 id="sfgateTitle">Are you<br />18 or older?</h1>
          <p className="sfgate__copy">Please confirm that you are 18 years of age or older before entering the Down Low Cannabis website.</p>
          <div className="sfgate__actions">
            <button className="sfgate__btn sfgate__btn--yes" disabled={busy} onClick={confirmAge} autoFocus>{busy ? <><i className="sfgate__spinner" aria-hidden="true" />ENTERING…</> : "YES, ENTER SITE"}</button>
            <button className="sfgate__btn" disabled={busy} onClick={() => setState("blocked")}>NO, I’M UNDER 18</button>
          </div>
          {error && <p className="sfgate__error" role="alert">{error}</p>}
        </>}
        {state === "blocked" && <>
          <p className="sfgate__eyebrow">ACCESS RESTRICTED</p>
          <h1 id="sfgateTitle">You must be<br />18+ to enter.</h1>
          <p className="sfgate__copy">This website is restricted to adults aged 18 and older.</p>
        </>}
        {state === "member" && <form onSubmit={requestPin}>
          <p className="sfgate__eyebrow">DLC MEMBERS ONLY</p>
          <h1 id="sfgateTitle">Enter your<br />Member ID.</h1>
          <p className="sfgate__copy">Use the active DLC Member ID registered at the lounge. Your bag, exchanges and member benefits follow it.</p>
          <label className="sfgate__field">
            <span>DLC MEMBER ID</span>
            <input id="gate-member-id" autoFocus inputMode="numeric" autoComplete="off" spellCheck={false} value={memberId} onChange={(event) => setMemberId(formatMemberId(event.target.value))} onKeyDown={keepPrefix} onFocus={caretToEnd} onClick={caretToEnd} placeholder="DLC-1234-56" aria-describedby={error ? "sfgateError" : undefined} required />
          </label>
          {error && <p className="sfgate__error" id="sfgateError" role="alert">{error}</p>}
          <div className="sfgate__actions"><button className="sfgate__btn sfgate__btn--yes" disabled={busy || !isCompleteMemberId(memberId)}>{busy ? <><i className="sfgate__spinner" aria-hidden="true" />SENDING PIN…</> : "ENTER"}</button></div>
          <p className="sfgate__legal">No Member ID yet? <Link href="/register">Register as a member</Link></p>
        </form>}
        {state === "pin" && <form onSubmit={(event) => { event.preventDefault(); checkPin(pin) }}>
          <p className="sfgate__eyebrow">CHECK YOUR PHONE</p>
          <h1 id="sfgateTitle">Enter your<br />PIN.</h1>
          <p className="sfgate__copy">We sent a 6-digit PIN by SMS to the number on your membership, <strong>{sentTo}</strong>. It expires in 10 minutes.{notice && <> <em className="sfgate__sent">{notice}</em></>}</p>
          <label className="sfgate__field">
            <span>SMS PIN</span>
            <input className="sfgate__pin" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} spellCheck={false} placeholder="••••••" value={pin} aria-describedby={error ? "sfgateError" : undefined}
              onChange={(event) => { const next = event.target.value.replace(/\D/g, "").slice(0, 6); setPin(next); setError(""); if (next.length === 6) checkPin(next) }} />
          </label>
          {error && <p className="sfgate__error" id="sfgateError" role="alert">{error}</p>}
          <div className="sfgate__actions"><button className="sfgate__btn sfgate__btn--yes" disabled={busy || pin.length !== 6}>{busy ? <><i className="sfgate__spinner" aria-hidden="true" />SIGNING IN…</> : "SIGN IN"}</button></div>
          <p className="sfgate__legal">
            <button type="button" className="sfgate__link" disabled={busy || resendIn > 0} onClick={() => requestPin(undefined, true)}>Send a new PIN</button>{resendIn > 0 && ` in ${resendIn}s`}
            {" · "}<button type="button" className="sfgate__link" disabled={busy} onClick={() => { setError(""); setState("member") }}>Use a different Member ID</button>
          </p>
          <p className="sfgate__legal">Wrong number, or no phone with you? Ask the team at the lounge to update your membership.</p>
        </form>}
        {memberName && <p className="sfgate__copy">Welcome, {memberName}.</p>}
        {state !== "checking" && <p className="sfgate__legal">By entering, you confirm that you meet the minimum age requirement. <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/cookies.html">Cookies</a></p>}
      </div>
    </div>
  </div>
}

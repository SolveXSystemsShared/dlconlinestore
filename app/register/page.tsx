"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { SignaturePad } from "@/components/signature-pad"

type Submitted = { memberNumber: string; memberName: string; status: string }

export default function RegisterPage() {
  const [signature, setSignature] = useState("")
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Submitted | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")

    if (!signature) {
      setError("Please draw your signature before submitting.")
      return
    }

    const form = new FormData(event.currentTarget)
    const payload = {
      fullName: String(form.get("fullName") || ""),
      email: String(form.get("email") || ""),
      mobileNumber: String(form.get("mobileNumber") || ""),
      dateOfBirth: String(form.get("dateOfBirth") || ""),
      idNumber: String(form.get("idNumber") || ""),
      foreignPassport: String(form.get("foreignPassport") || ""),
      residentialAddress: String(form.get("residentialAddress") || ""),
      digitalSignature: signature,
      marketingOptIn,
    }

    setBusy(true)
    try {
      // The 18+ cookie is required by the API, so confirm it here for anyone
      // who reached /register directly.
      await fetch("/api/access/age", { method: "POST" })
      const response = await fetch("/api/members/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Registration could not be completed")
      setDone({ memberNumber: data.memberNumber, memberName: data.memberName ?? "", status: data.status })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration could not be completed")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return <main className="shell">
      <header className="topbar"><Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link></header>
      <section className="content success register-done">
        <div className="eyebrow">Welcome to DLC</div>
        <h1>You&apos;re a member.</h1>
        <p className="order-number">{done.memberNumber}</p>
        <p>This is your DLC Member ID, and it is <strong>active now</strong>. Save it — it is how you enter the store and how the team finds you at the counter. You&apos;re already signed in, so you can start shopping straight away.</p>
        <Link className="button" href="/">Start shopping</Link>
      </section>
    </main>
  }

  return <main className="shell">
    <header className="topbar">
      <Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link>
      <Link className="button secondary" href="/">Back to store</Link>
    </header>

    <section className="content register-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow dark-eyebrow">Become a member</div>
          <h2>Register.</h2>
        </div>
        <p>18+ only. Your Member ID is<br />issued the moment you submit.</p>
      </div>

      <form className="card register-card" onSubmit={submit}>
        <p className="notice">Everything here is required by DLC membership records. Submit and your Member ID is issued immediately — you can shop the same visit.</p>

        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} placeholder="As it appears on your ID" />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={160} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="mobileNumber">Mobile number</label>
            <input id="mobileNumber" name="mobileNumber" type="tel" autoComplete="tel" required minLength={7} maxLength={30} placeholder="For order updates" />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input id="dateOfBirth" name="dateOfBirth" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="idNumber">ID number</label>
            <input id="idNumber" name="idNumber" maxLength={40} placeholder="South African ID" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="foreignPassport">Passport number <span className="field-hint">(if you don&apos;t have an SA ID)</span></label>
          <input id="foreignPassport" name="foreignPassport" maxLength={40} placeholder="Passport number" />
        </div>

        <div className="field">
          <label htmlFor="residentialAddress">Residential address</label>
          <textarea id="residentialAddress" name="residentialAddress" required minLength={6} maxLength={500} placeholder="Street, suburb, city, postal code" />
        </div>

        <div className="field">
          <label>Digital signature</label>
          <SignaturePad onChange={setSignature} />
        </div>

        <label className="field-consent">
          <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} />
          <span>Keep me posted on DLC drops, specials and member news.</span>
        </label>

        {error && <p className="error">{error}</p>}

        <button className="button" disabled={busy}>{busy ? "Submitting…" : "Submit registration"}</button>
        <p className="register-fineprint">By submitting you confirm you are 18 or older and that these details are accurate.</p>
      </form>
    </section>
  </main>
}

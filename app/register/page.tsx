"use client"

import { FormEvent, useState } from "react"
import { SignaturePad } from "@/components/signature-pad"
import { StoreFooter, StoreHeader } from "@/components/store-header"
import { LegalStatement } from "@/components/legal-statement"
import { REGISTRATION_STATEMENT, TERMS_VERSION } from "@/lib/legal"

type Submitted = { memberNumber: string; memberName: string; status: string }

export default function RegisterPage() {
  const [signature, setSignature] = useState("")
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Submitted | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")

    if (!accepted) {
      setError("Please confirm you have read the Terms & Conditions and Privacy Policy.")
      return
    }

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
      acceptedTerms: accepted,
      termsVersion: TERMS_VERSION,
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
    return <div className="sf">
      <StoreHeader />
      <main className="sf-main" id="main-content">
        <section className="sf-hero">
          <div>
            <p className="sf-kicker">WELCOME TO DLC</p>
            <h1 className="sf-title">You&apos;re a<br />member.</h1>
            <p className="sf-sub">This is your DLC Member ID, and it is <strong>active now</strong>. Save it — it is how you enter the member area and how the team finds you at the counter. You&apos;re already signed in.</p>
          </div>
          <div className="sf-hero-stats"><div className="sf-stat"><span>Member ID</span><strong>{done.memberNumber}</strong></div></div>
        </section>
        <div className="sf-body"><div className="sf-actions"><a className="sf-cta" href="/index.html?home=1">Enter the lounge</a><a className="sf-ghost" href="/account">View my account</a></div></div>
      </main>
      <StoreFooter />
    </div>
  }

  return <div className="sf">
    <StoreHeader />
    <main className="sf-main" id="main-content">
      <nav className="sf-crumbs" aria-label="Breadcrumb"><a href="/index.html?home=1">LOUNGE</a><span>/</span><strong>BECOME A MEMBER</strong></nav>
      <section className="sf-hero">
        <div>
          <p className="sf-kicker">DLC MEMBERSHIP · 18+ ONLY</p>
          <h1 className="sf-title">Become a<br />member.</h1>
          <p className="sf-sub">DLC is a private members&apos; club. Complete your membership application below — your Member ID is issued the moment you submit.</p>
        </div>
      </section>

      <div className="sf-body sf-checkout">
        <form onSubmit={submit} noValidate={false}>
          <section className="sf-panel" aria-labelledby="aboutTitle">
            <div className="sf-panel-head"><h2 id="aboutTitle">About you</h2><span className="sf-step">STEP 01</span></div>
            <div className="sf-field"><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} placeholder="As it appears on your ID" /></div>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={160} placeholder="you@example.com" /></div>
              <div className="sf-field"><label htmlFor="mobileNumber">Mobile number</label><input id="mobileNumber" name="mobileNumber" type="tel" autoComplete="tel" required minLength={7} maxLength={30} placeholder="082 000 0000" /></div>
            </div>
            <div className="sf-field"><label htmlFor="residentialAddress">Residential address</label><textarea id="residentialAddress" name="residentialAddress" autoComplete="street-address" required minLength={6} maxLength={500} placeholder="Street, suburb, city, postal code" /></div>
          </section>

          <section className="sf-panel" aria-labelledby="idTitle">
            <div className="sf-panel-head"><h2 id="idTitle">Identity &amp; age</h2><span className="sf-step">STEP 02</span></div>
            <p className="sf-hint">Required to confirm you are 18 or older, as membership rules require. Your ID or passport number is stored securely on your membership record and used only for membership.</p>
            <div className="sf-row2">
              <div className="sf-field"><label htmlFor="dateOfBirth">Date of birth</label><input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" required /></div>
              <div className="sf-field"><label htmlFor="idNumber">SA ID number</label><input id="idNumber" name="idNumber" inputMode="numeric" maxLength={40} placeholder="13-digit South African ID" /></div>
            </div>
            <div className="sf-field"><label htmlFor="foreignPassport">Passport number <small>— only if you don&apos;t have an SA ID</small></label><input id="foreignPassport" name="foreignPassport" maxLength={40} placeholder="Passport number" /></div>
          </section>

          <section className="sf-panel" aria-labelledby="signTitle">
            <div className="sf-panel-head"><h2 id="signTitle">Sign &amp; agree</h2><span className="sf-step">STEP 03</span></div>
            <div className="sf-field"><span className="sf-label" id="signatureLabel">Digital signature</span><div aria-labelledby="signatureLabel"><SignaturePad onChange={setSignature} /></div></div>
            <label className="sf-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span><LegalStatement text={REGISTRATION_STATEMENT} /></span></label>
            <label className="sf-check"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} /><span><strong>Optional:</strong> keep me posted on DLC drops, specials and member news. You can opt out at any time from your account.</span></label>
            {error && <p className="sf-error" role="alert">{error}</p>}
            <button className="sf-cta sf-cta--block" disabled={busy || !accepted}>{busy ? "Submitting…" : <>Submit application <span>→</span></>}</button>
          </section>
        </form>

        <aside className="sf-panel sf-summary" aria-labelledby="whyTitle">
          <div className="sf-panel-head"><h2 id="whyTitle">Your information</h2></div>
          <div className="sf-trust">
            <div><b>01</b><span><strong>Why we ask.</strong> Membership records must show every member is 18+ and identifiable. We collect only what the membership application requires.</span></div>
            <div><b>02</b><span><strong>Who sees it.</strong> Authorised DLC staff, through the membership system. We never rent, trade or share it for anyone else's marketing.</span></div>
            <div><b>03</b><span><strong>Your rights.</strong> Under POPIA you can ask to see, correct or delete your information, and object to marketing at any time.</span></div>
          </div>
          <p className="sf-fineprint">Read the full <a href="/privacy.html" style={{ color: "var(--sf-blue)", fontWeight: 900 }}>Privacy Policy</a> for how long we keep information and how to contact our Information Officer.</p>
        </aside>
      </div>
    </main>
    <StoreFooter />
  </div>
}

"use client"

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { SignaturePad } from "@/components/signature-pad"
import { LegalStatement } from "@/components/legal-statement"
import { REGISTRATION_STATEMENT, TERMS_VERSION } from "@/lib/legal"
import { dateOfBirthFromSaId, validateSaId } from "@/lib/sa-id"
import { parseSaMobile } from "@/lib/phone"

type Field = "fullName" | "email" | "mobileNumber" | "residentialAddress" | "dateOfBirth" | "idNumber" | "foreignPassport" | "referralCode" | "signature" | "accepted"
type Errors = Partial<Record<Field, string>>
type Registered = { memberNumber: string; memberName: string; smsSentTo: string; smsSent: boolean }

const FIELD_ORDER: Field[] = ["fullName", "email", "mobileNumber", "residentialAddress", "dateOfBirth", "idNumber", "foreignPassport", "referralCode", "signature", "accepted"]
const FIELD_LABEL: Partial<Record<Field, string>> = { email: "email address", mobileNumber: "phone number", idNumber: "ID number", foreignPassport: "passport number", referralCode: "referral code" }

const toIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/**
 * A dialog over the page: focus moves into it, Tab stays inside it, and focus
 * goes back to where it was when it closes. Without `onClose` it can only be
 * left through its own buttons (Escape and the backdrop do nothing), which is
 * what the Member ID popup needs so nobody dismisses it before saving the ID.
 */
function Modal({ titleId, onClose, children }: { titleId: string; onClose?: () => void; children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = node.current
    if (!dialog) return
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], input, textarea, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"))
    ;(dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key !== "Tab") return
      const items = focusable()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])

  return <div className="sfreg__backdrop">
    <div className="sfreg__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={node}>{children}</div>
  </div>
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="sfreg__error" id={id} role="alert">{message}</p> : null
}

export default function RegisterPage() {
  const [values, setValues] = useState({ fullName: "", email: "", mobileNumber: "", residentialAddress: "", dateOfBirth: "", idNumber: "", foreignPassport: "", referralCode: "" })
  const [idType, setIdType] = useState<"sa_id" | "passport">("sa_id")
  const [signature, setSignature] = useState("")
  const [accepted, setAccepted] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [mobileTouched, setMobileTouched] = useState(false)
  const [serverError, setServerError] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Registered | null>(null)
  const [copied, setCopied] = useState(false)
  const [today] = useState(() => toIsoDate(new Date()))

  const mobile = parseSaMobile(values.mobileNumber)

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setServerError("")
  }

  function changeIdNumber(value: string) {
    set("idNumber", value.replace(/[^\d\s]/g, ""))
    // A valid ID carries the date of birth, so fill it in rather than ask twice.
    if (validateSaId(value).valid) {
      const born = dateOfBirthFromSaId(value)
      if (born) setValues((current) => ({ ...current, idNumber: value.replace(/[^\d\s]/g, ""), dateOfBirth: toIsoDate(born) }))
    }
  }

  function validate(): Errors {
    const problems: Errors = {}
    if (values.fullName.trim().length < 2) problems.fullName = "Enter your full name, as it appears on your ID."
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) problems.email = "Enter a valid email address."
    if (!mobile) problems.mobileNumber = "Enter a valid South African mobile number, like 082 123 4567. Your login PIN is sent to it by SMS."
    if (values.residentialAddress.trim().length < 6) problems.residentialAddress = "Enter your residential address."
    if (!values.dateOfBirth) problems.dateOfBirth = "Enter your date of birth."
    else {
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18)
      const born = new Date(`${values.dateOfBirth}T00:00:00`)
      if (Number.isNaN(born.getTime()) || born > new Date()) problems.dateOfBirth = "Enter a valid date of birth."
      else if (born > cutoff) problems.dateOfBirth = "You must be 18 or older to register."
    }
    if (idType === "sa_id") {
      const check = validateSaId(values.idNumber)
      if (!check.valid) problems.idNumber = check.error || "Enter a valid South African ID number."
    } else if (values.foreignPassport.trim().length < 4) problems.foreignPassport = "Enter your passport number."
    if (!signature) problems.signature = "Please draw your signature."
    if (!accepted) problems.accepted = "Please confirm you have read the Terms & Conditions and Privacy Policy."
    return problems
  }

  function focusFirst(problems: Errors) {
    const first = FIELD_ORDER.find((field) => problems[field])
    if (!first) return
    const target = first === "signature" ? document.getElementById("signatureArea") : first === "accepted" ? document.getElementById("accepted") : document.getElementById(first)
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true })
  }

  function review(event: FormEvent) {
    event.preventDefault()
    const problems = validate()
    setErrors(problems)
    setMobileTouched(true)
    if (Object.keys(problems).length) {
      setServerError("Please check the highlighted fields.")
      window.setTimeout(() => focusFirst(problems), 50)
      return
    }
    setServerError("")
    setReviewing(true)
  }

  async function register() {
    setBusy(true)
    try {
      // The 18+ cookie is required by the API, so confirm it here for anyone
      // who reached /register directly.
      await fetch("/api/access/age", { method: "POST" })
      const response = await fetch("/api/members/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          mobileNumber: values.mobileNumber,
          dateOfBirth: values.dateOfBirth,
          idNumber: idType === "sa_id" ? values.idNumber.replace(/\s/g, "") : "",
          foreignPassport: idType === "passport" ? values.foreignPassport.trim() : "",
          residentialAddress: values.residentialAddress.trim(),
          referralCode: values.referralCode.trim(),
          digitalSignature: signature,
          marketingOptIn,
          acceptedTerms: accepted,
          termsVersion: TERMS_VERSION,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setReviewing(false)
        const clashes: Array<{ field: Field; message: string }> = Array.isArray(data.clashes) ? data.clashes : []
        if (clashes.length) {
          // Mark every field the server flagged; the message names the field to change.
          const marked: Errors = {}
          clashes.forEach((clash) => { marked[clash.field] = clash.message || " " })
          setErrors(marked)
          const labels = clashes.map((clash) => FIELD_LABEL[clash.field]).filter(Boolean)
          setServerError(clashes.length > 1 || !data.error ? `Please change your ${labels.join(" and ")}.` : data.error)
          window.setTimeout(() => focusFirst(marked), 50)
        } else {
          setServerError(data.error || "Registration could not be completed. Please try again.")
        }
        return
      }
      setReviewing(false)
      setDone({ memberNumber: data.memberNumber, memberName: data.memberName ?? values.fullName, smsSentTo: data.smsSentTo ?? "", smsSent: data.smsSent !== false })
    } catch {
      setReviewing(false)
      setServerError("We could not reach the server. Please check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const closeReview = useCallback(() => { if (!busy) setReviewing(false) }, [busy])

  async function copyId() {
    if (!done) return
    try { await navigator.clipboard.writeText(done.memberNumber); setCopied(true); window.setTimeout(() => setCopied(false), 2200) } catch { setCopied(false) }
  }

  const mobileShown = mobile ? mobile.display : values.mobileNumber
  const invalid = (field: Field) => (errors[field] ? true : undefined)

  return <div className="sfreg">
    <div className="sfgate__sky" aria-hidden="true"><span /><span /><span /></div>

    <main className="sfreg__wrap" id="main-content">
      <div className="sfreg__card">
        <img className="sfreg__mascot" src="/assets/dlc-mascot.png" alt="" width={605} height={863} decoding="async" />
        <a href="/"><img className="sfgate__logo" src="/assets/dlc-logo.svg" alt="Down Low Cannabis — back to the lounge" width={108} height={35} /></a>
        <p className="sfgate__eyebrow">DLC MEMBERSHIP · 18+ ONLY</p>
        <h1>Become a<br />member.</h1>
        <p className="sfreg__lead">DLC is a private members&apos; club. It takes about 3 minutes, and your Member ID is issued the moment you submit. You only need to register once.</p>

        <div className="sfreg__notice" role="note">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
          <p><strong>Use a valid South African mobile number.</strong> Your Member ID is built from it, and every time you sign in we text a login PIN to it. If it&apos;s wrong, or not yours, you won&apos;t be able to sign in.</p>
        </div>

        <form onSubmit={review} noValidate>
          <section className="sfreg__section" aria-labelledby="aboutTitle">
            <h2 id="aboutTitle"><b>1</b>About you</h2>
            <div className="sfreg__field"><label htmlFor="fullName">Full name</label>
              <input id="fullName" autoComplete="name" maxLength={120} placeholder="As it appears on your ID" value={values.fullName} onChange={(e) => set("fullName", e.target.value)} aria-invalid={invalid("fullName")} aria-describedby={errors.fullName ? "fullNameError" : undefined} />
              <FieldError id="fullNameError" message={errors.fullName} /></div>
            <div className="sfreg__field"><label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" maxLength={160} placeholder="you@example.com" value={values.email} onChange={(e) => set("email", e.target.value)} aria-invalid={invalid("email")} aria-describedby={errors.email ? "emailError" : undefined} />
              <FieldError id="emailError" message={errors.email} /></div>
            <div className="sfreg__field"><label htmlFor="mobileNumber">South African mobile number</label>
              <input id="mobileNumber" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="082 123 4567" value={values.mobileNumber}
                onChange={(e) => set("mobileNumber", e.target.value.replace(/[^\d+\s()-]/g, ""))}
                onBlur={() => { setMobileTouched(true); if (mobile) set("mobileNumber", mobile.display) }}
                aria-invalid={invalid("mobileNumber") ?? (mobileTouched && values.mobileNumber && !mobile ? true : undefined)} aria-describedby="mobileHint" />
              {errors.mobileNumber
                ? <FieldError id="mobileHint" message={errors.mobileNumber} />
                : mobile
                  ? <p className="sfreg__hint sfreg__hint--ok" id="mobileHint">✓ Your login PIN will be texted to <strong>{mobile.display}</strong>.</p>
                  : <p className={`sfreg__hint${mobileTouched && values.mobileNumber ? " sfreg__hint--bad" : ""}`} id="mobileHint">{mobileTouched && values.mobileNumber ? "That doesn’t look like a South African mobile number — use 06, 07 or 08, like 082 123 4567." : "Starts with 06, 07 or 08 (or +27). We text your login PIN here."}</p>}
            </div>
            <div className="sfreg__field"><label htmlFor="residentialAddress">Residential address</label>
              <textarea id="residentialAddress" autoComplete="street-address" maxLength={500} placeholder="Street, suburb, city, postal code" value={values.residentialAddress} onChange={(e) => set("residentialAddress", e.target.value)} aria-invalid={invalid("residentialAddress")} aria-describedby={errors.residentialAddress ? "addressError" : undefined} />
              <FieldError id="addressError" message={errors.residentialAddress} /></div>
          </section>

          <section className="sfreg__section" aria-labelledby="idTitle">
            <h2 id="idTitle"><b>2</b>Identity &amp; age</h2>
            <p className="sfreg__hint">Required to confirm you are 18 or older, as membership rules require. It is stored securely on your membership record and used only for membership.</p>
            <div className="sfreg__seg" role="group" aria-label="Identity document">
              <button type="button" aria-pressed={idType === "sa_id"} onClick={() => setIdType("sa_id")}>SA ID number</button>
              <button type="button" aria-pressed={idType === "passport"} onClick={() => setIdType("passport")}>Passport</button>
            </div>
            {idType === "sa_id"
              ? <div className="sfreg__field"><label htmlFor="idNumber">SA ID number</label>
                  <input id="idNumber" inputMode="numeric" autoComplete="off" maxLength={17} placeholder="13-digit South African ID" value={values.idNumber} onChange={(e) => changeIdNumber(e.target.value)} aria-invalid={invalid("idNumber")} aria-describedby={errors.idNumber ? "idError" : undefined} />
                  <FieldError id="idError" message={errors.idNumber} /></div>
              : <div className="sfreg__field"><label htmlFor="foreignPassport">Passport number</label>
                  <input id="foreignPassport" autoComplete="off" maxLength={40} placeholder="Passport number" value={values.foreignPassport} onChange={(e) => set("foreignPassport", e.target.value)} aria-invalid={invalid("foreignPassport")} aria-describedby={errors.foreignPassport ? "passportError" : undefined} />
                  <FieldError id="passportError" message={errors.foreignPassport} /></div>}
            <div className="sfreg__field"><label htmlFor="dateOfBirth">Date of birth</label>
              <input id="dateOfBirth" type="date" autoComplete="bday" max={today} value={values.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} aria-invalid={invalid("dateOfBirth")} aria-describedby={errors.dateOfBirth ? "dobError" : idType === "sa_id" ? "dobHint" : undefined} />
              {errors.dateOfBirth ? <FieldError id="dobError" message={errors.dateOfBirth} /> : idType === "sa_id" ? <p className="sfreg__hint" id="dobHint">Filled in for you from a valid SA ID number.</p> : null}</div>
            <details className="sfreg__referral" open={Boolean(values.referralCode || errors.referralCode)}>
              <summary>Have a referral code? <small>(optional)</small></summary>
              <div className="sfreg__field"><label htmlFor="referralCode">Referral code</label>
                <input id="referralCode" autoComplete="off" autoCapitalize="characters" maxLength={40} placeholder="From the member who told you about DLC" value={values.referralCode} onChange={(e) => set("referralCode", e.target.value)} aria-invalid={invalid("referralCode")} aria-describedby={errors.referralCode?.trim() ? "referralError" : undefined} />
                <FieldError id="referralError" message={errors.referralCode?.trim() ? errors.referralCode : undefined} /></div>
            </details>
          </section>

          <section className="sfreg__section" aria-labelledby="signTitle">
            <h2 id="signTitle"><b>3</b>Sign &amp; agree</h2>
            <div className="sfreg__field" id="signatureArea"><span className="sfreg__label" id="signatureLabel">Digital signature</span>
              <div className={`sfreg__sign${errors.signature ? " is-bad" : ""}`} aria-labelledby="signatureLabel"><SignaturePad onChange={(value) => { setSignature(value); setErrors((current) => ({ ...current, signature: undefined })) }} /></div>
              <FieldError id="signatureError" message={errors.signature} /></div>
            <label className="sfreg__check"><input id="accepted" type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setErrors((current) => ({ ...current, accepted: undefined })) }} aria-invalid={invalid("accepted")} /><span><LegalStatement text={REGISTRATION_STATEMENT} /></span></label>
            <FieldError id="acceptedError" message={errors.accepted} />
            <label className="sfreg__check"><input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} /><span><strong>Optional:</strong> keep me posted on DLC drops, specials and member news. You can opt out at any time from your account.</span></label>
          </section>

          {serverError && <p className="sfreg__banner" role="alert">{serverError}</p>}
          <button className="sfgate__btn sfgate__btn--yes sfreg__submit" type="submit">REVIEW MY DETAILS <span aria-hidden="true">→</span></button>
          <p className="sfgate__legal">Already a member? <a href="/">Enter your Member ID</a> · <a href="/privacy.html">Privacy Policy</a></p>
        </form>
      </div>
    </main>

    {reviewing && <Modal titleId="reviewTitle" onClose={closeReview}>
      <p className="sfgate__eyebrow">ONE LAST CHECK</p>
      <h2 id="reviewTitle">Check your details.</h2>
      <div className="sfreg__phonecheck">
        <span>We&apos;ll text your login PIN to</span>
        <strong>{mobile?.display ?? mobileShown}</strong>
        <p>Make sure this number is correct and that it&apos;s yours. If it isn&apos;t, you won&apos;t be able to sign in.</p>
      </div>
      <dl className="sfreg__summary">
        <div><dt>Name</dt><dd>{values.fullName.trim()}</dd></div>
        <div><dt>Email</dt><dd>{values.email.trim()}</dd></div>
        <div><dt>{idType === "sa_id" ? "SA ID" : "Passport"}</dt><dd>{idType === "sa_id" ? values.idNumber.replace(/\s/g, "") : values.foreignPassport.trim()}</dd></div>
        <div><dt>Date of birth</dt><dd>{values.dateOfBirth}</dd></div>
      </dl>
      <div className="sfgate__actions">
        <button type="button" className="sfgate__btn sfgate__btn--yes" onClick={register} disabled={busy} data-autofocus>{busy ? <><i className="sfgate__spinner" aria-hidden="true" />REGISTERING…</> : "CONFIRM & REGISTER"}</button>
        <button type="button" className="sfgate__btn" onClick={closeReview} disabled={busy}>EDIT DETAILS</button>
      </div>
    </Modal>}

    {done && <Modal titleId="doneTitle">
      <p className="sfgate__eyebrow">WELCOME TO DLC</p>
      <h2 id="doneTitle">You&apos;re a member.</h2>
      <div className="sfreg__idcard">
        <img src="/assets/dlc-logo-white.png" alt="DLC" width={86} height={28} />
        <span>MEMBER ID</span>
        <strong aria-label={`Your Member ID is ${done.memberNumber}`}>{done.memberNumber}</strong>
        <em>{done.memberName}</em>
      </div>
      <p className="sfreg__shot"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></svg>Take a screenshot of this card now — you&apos;ll need your Member ID to sign in.</p>
      <ol className="sfreg__steps">
        <li>{done.smsSent ? <>We&apos;ve also texted your Member ID to <strong>{done.smsSentTo}</strong>.</> : <>We couldn&apos;t text your Member ID just now, so keep this screenshot safe.</>}</li>
        <li>Next, enter your Member ID on the sign-in screen.</li>
        <li>We&apos;ll text a login PIN to the same number. Enter it and you&apos;re in.</li>
      </ol>
      <div className="sfgate__actions">
        <button type="button" className="sfgate__btn sfgate__btn--yes" onClick={() => window.location.assign("/")} data-autofocus>CONTINUE TO SIGN IN <span aria-hidden="true">→</span></button>
        <button type="button" className="sfgate__btn" onClick={copyId}>{copied ? "COPIED ✓" : "COPY MEMBER ID"}</button>
      </div>
      <p className="sfreg__live" role="status">{copied ? "Member ID copied to the clipboard." : ""}</p>
    </Modal>}
  </div>
}

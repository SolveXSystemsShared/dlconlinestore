"use client"

import { useEffect } from "react"
import { ErrorScreen } from "@/components/error-screen"

/**
 * A page that crashed while rendering. The member sees a calm way back, never
 * the error itself; the digest is the only detail shown, so the team can match
 * it to the server log.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <ErrorScreen
    code={error.digest ? `SOMETHING WENT WRONG · REF ${error.digest}` : "SOMETHING WENT WRONG"}
    bubble="Oops, that didn’t load right."
    title={<>Bit of a<br />haze.</>}
    copy="This page hit a problem on our side. Nothing in your bag or exchanges has changed. Try again, or head back to the lounge."
  >
    <button type="button" className="sfgate__btn sfgate__btn--yes" onClick={reset}>TRY AGAIN</button>
    <a className="sfgate__btn" href="/">BACK TO THE LOUNGE</a>
  </ErrorScreen>
}

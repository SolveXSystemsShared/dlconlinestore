"use client"

import "./globals.css"
import "./storefront.css"
import { ErrorScreen } from "@/components/error-screen"

/** The whole app failed, layout included, so this page brings its own <html>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="en-ZA">
    <body>
      <ErrorScreen
        code={error.digest ? `SITE ERROR · REF ${error.digest}` : "SITE ERROR"}
        bubble="Give us a moment…"
        title={<>We’ll be<br />right back.</>}
        copy="The site hit a problem on our side. Nothing in your bag or exchanges has changed. Reload in a moment, or ask the team at the lounge."
      >
        <a className="sfgate__btn sfgate__btn--yes" href="/">RELOAD THE LOUNGE</a>
      </ErrorScreen>
    </body>
  </html>
}

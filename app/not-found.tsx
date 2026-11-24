import type { Metadata } from "next"
import { ErrorScreen } from "@/components/error-screen"

export const metadata: Metadata = { title: "Page not found | Down Low Cannabis", robots: { index: false } }

/**
 * The 404 for an unknown address. It sits outside the gate and is plain HTML,
 * so it shows its message at once, with or without JavaScript. It holds no
 * products, prices or member details; keep it that way.
 */
export default function NotFound() {
  return <ErrorScreen
    code="ERROR 404"
    bubble="Hmm… this one drifted off."
    title={<>Page not<br />found.</>}
    copy="The page you were looking for has moved, or the link is out of date."
    browse={false}
  >
    <a className="sfgate__btn sfgate__btn--yes" href="/strains.html">GO TO THE SHOP</a>
    <a className="sfgate__btn" href="/bag">YOUR BAG</a>
    <a className="sfgate__btn" href="/">BACK TO THE LOUNGE</a>
  </ErrorScreen>
}

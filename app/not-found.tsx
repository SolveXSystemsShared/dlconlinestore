import type { Metadata } from "next"
import { ErrorScreen } from "@/components/error-screen"

export const metadata: Metadata = { title: "Page not found | Down Low Cannabis", robots: { index: false } }

export default function NotFound() {
  return <ErrorScreen
    code="404 · PAGE NOT FOUND"
    bubble="Hmm… this one drifted off."
    title={<>Lost in<br />the clouds.</>}
    copy="The page you were looking for has moved, or the link is out of date. Head back to the lounge and pick up from there."
  >
    <a className="sfgate__btn sfgate__btn--yes" href="/">BACK TO THE LOUNGE</a>
  </ErrorScreen>
}

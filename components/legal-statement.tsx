import { Fragment } from "react"

const LINKS: Record<string, string> = {
  "Terms & Conditions": "/terms.html",
  "Privacy Policy": "/privacy.html",
}

/**
 * Renders an acceptance statement from lib/legal.ts with its document names as
 * links. The words stay exactly the ones the server stores as evidence — only
 * the presentation changes.
 */
export function LegalStatement({ text }: { text: string }) {
  const parts = text.split(/(Terms & Conditions|Privacy Policy)/)
  return <>{parts.map((part, index) => LINKS[part]
    ? <a key={index} href={LINKS[part]} target="_blank" rel="noopener" style={{ color: "var(--sf-blue)", fontWeight: 900 }}>{part}</a>
    : <Fragment key={index}>{part}</Fragment>)}</>
}

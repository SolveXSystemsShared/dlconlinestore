import type { ReactNode } from "react"

/**
 * The 404 and error pages, on the same sky, mascot and white card as the
 * member gate so a dead end still feels like DLC. Plain anchors, not <Link>:
 * the lounge and shop are the static pages in public/, and a full load is
 * the safest way out of a page that has just failed.
 */
export function ErrorScreen({ code, bubble, title, copy, children }: {
  code: string
  bubble: string
  title: ReactNode
  copy: ReactNode
  children?: ReactNode
}) {
  return <main className="sfgate sfgate--error" aria-labelledby="sfErrorTitle">
    <div className="sfgate__sky" aria-hidden="true"><span /><span /><span /></div>
    <div className="sfgate__stage">
      <figure className="sfgate__mascot" aria-hidden="true">
        <p className="sfgate__bubble">{bubble}</p>
        <img src="/assets/dlc-mascot-3d.jpg" alt="" width={506} height={760} decoding="async" />
        <span className="sfgate__shadow" />
      </figure>
      <div className="sfgate__card">
        <a href="/"><img className="sfgate__logo" src="/assets/dlc-logo.svg" alt="Back to the Down Low Cannabis lounge" width={108} height={35} /></a>
        <p className="sfgate__eyebrow">{code}</p>
        <h1 id="sfErrorTitle">{title}</h1>
        <p className="sfgate__copy">{copy}</p>
        <div className="sfgate__actions">
          {children}
          <a className="sfgate__btn" href="/strains.html">BROWSE ALL</a>
        </div>
        <p className="sfgate__legal">Need a hand? Ask the team at the lounge.</p>
      </div>
    </div>
  </main>
}

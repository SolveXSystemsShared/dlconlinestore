/**
 * Shimmering placeholders shaped like the content that is on its way, so a
 * slow connection shows the page's layout at once instead of a blank screen.
 */
export function SkeletonLines({ widths = ["40%", "90%", "70%"] }: { widths?: string[] }) {
  return <>{widths.map((width, index) => <span key={index} className="sk sk-line" style={{ width }} />)}</>
}

/** A panel with a heading bar and a few lines — stands in for any .sf-panel. */
export function SkeletonPanel({ rows = 3, media = false }: { rows?: number; media?: boolean }) {
  return <div className="sf-panel sk-panel" aria-hidden="true">
    <span className="sk sk-heading" />
    {Array.from({ length: rows }, (_, index) => <div className="sk-row" key={index}>
      {media && <span className="sk sk-thumb" />}
      <div className="sk-row-text"><SkeletonLines widths={["30%", "65%"]} /></div>
    </div>)}
  </div>
}

/** Whole-page placeholder for a storefront page that is still loading its data. */
export function SkeletonPage({ label, layout = "split" }: { label: string; layout?: "split" | "single" }) {
  return <div className="sf-body" role="status" aria-live="polite" aria-busy="true">
    <span className="sf-visually-hidden">{label}</span>
    <div className={layout === "split" ? "sf-checkout" : ""}>
      <div><SkeletonPanel rows={3} media /><SkeletonPanel rows={2} /></div>
      {layout === "split" && <SkeletonPanel rows={4} />}
    </div>
  </div>
}

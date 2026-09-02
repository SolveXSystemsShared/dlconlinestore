"use client"

import { useEffect, useMemo, useState } from "react"

/**
 * Slices a list into pages and keeps the page number honest.
 *
 * The page resets whenever the list identity changes — filtering the store down
 * to four items while sitting on page six would otherwise show an empty grid —
 * and clamps if the list shrinks under it.
 */
export function usePagination<T>(items: T[], perPage: number, resetKey: string) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / perPage))

  useEffect(() => { setPage(1) }, [resetKey])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const visible = useMemo(() => items.slice((page - 1) * perPage, page * perPage), [items, page, perPage])
  return { page, setPage, pageCount, visible }
}

/** Page numbers around the current one, with the ends always reachable. */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  const sorted = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
  const out: Array<number | "gap"> = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap")
    out.push(n)
  })
  return out
}

export function Pagination({
  page,
  pageCount,
  onChange,
  label = "results",
  total,
  perPage,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
  label?: string
  total: number
  perPage: number
}) {
  if (pageCount <= 1) return null
  const first = (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)

  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <span className="pagination-count">{first}–{last} of {total}</span>
      <div className="pagination-controls">
        <button type="button" className="page-btn" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
        {pageWindow(page, pageCount).map((entry, index) =>
          entry === "gap"
            // Purely decorative: the numbers either side are the real controls.
            ? <span className="page-gap" key={`gap-${index}`} aria-hidden="true">…</span>
            : <button
                type="button"
                key={entry}
                className={`page-btn ${entry === page ? "page-on" : ""}`}
                onClick={() => onChange(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
              >{entry}</button>,
        )}
        <button type="button" className="page-btn" onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="Next page">›</button>
      </div>
    </nav>
  )
}

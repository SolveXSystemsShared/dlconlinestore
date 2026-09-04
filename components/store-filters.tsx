"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ProductIcon } from "@/components/product-icon"
import type { CatalogProduct } from "@/lib/types"

export type Filters = { category: string; line: string; search: string; favouritesOnly: boolean }
export const NO_FILTERS: Filters = { category: "", line: "", search: "", favouritesOnly: false }

/**
 * CDASH overloads `grade`. For flower and pre-rolls it is a cultivation grade
 * (Indoor, Hydroponic); for vapes, edibles and papers it is the brand line
 * (Awaken, Jane's, OCB). The separate `brand` column is filled on barely a
 * fifth of stock, so "grade or brand" is one filter rather than two, and the
 * heading changes to match whichever the chosen category actually uses.
 */
const GRADE_CATEGORIES = new Set(["Buds/Flower", "Pre-rolls", "Moonsticks", "Shooters"])

// How many categories get their own tile before the rest fold into "More".
const TILES_BEFORE_MORE = 5
// A line has to appear on at least this many products to count as popular.
const POPULAR_COUNT = 6

export function lineOf(product: CatalogProduct) {
  return (product.grade || product.brand || "").trim()
}

export function applyFilters(products: CatalogProduct[], filters: Filters, saved?: Set<string>) {
  const search = filters.search.trim().toLowerCase()
  return products.filter((product) => {
    if (filters.favouritesOnly && !saved?.has(product.id)) return false
    if (filters.category && product.productType !== filters.category) return false
    if (filters.line && lineOf(product) !== filters.line) return false
    if (search && !product.name.toLowerCase().includes(search)) return false
    return true
  })
}

/** Alphabetical buckets, so ~35 brands arrive as a few short lists. */
function bucketOf(name: string) {
  const initial = name.trim()[0]?.toUpperCase() ?? "#"
  if (initial < "A" || initial > "Z") return "0–9"
  if (initial <= "F") return "A–F"
  if (initial <= "M") return "G–M"
  if (initial <= "S") return "N–S"
  return "T–Z"
}

export function StoreFilters({
  products,
  filters,
  onChange,
  resultCount,
  savedCount,
}: {
  products: CatalogProduct[]
  filters: Filters
  onChange: (next: Filters) => void
  resultCount: number
  savedCount: number
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [panelSearch, setPanelSearch] = useState("")
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["Popular"]))
  const panelRef = useRef<HTMLDivElement | null>(null)

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.productType).filter(Boolean))].sort(),
    [products],
  )

  // Lines are drawn from what is in the chosen category, so the panel never
  // offers a filter that would return nothing.
  const lines = useMemo(() => {
    const scope = filters.category ? products.filter((p) => p.productType === filters.category) : products
    const counts = new Map<string, number>()
    for (const product of scope) {
      const line = lineOf(product)
      if (line) counts.set(line, (counts.get(line) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  }, [products, filters.category])

  // A search inside the panel cuts across every group; without one, the lines
  // split into Popular plus alphabetical buckets that stay shut until asked for.
  const groups = useMemo(() => {
    const needle = panelSearch.trim().toLowerCase()
    const matching = needle ? lines.filter((line) => line.name.toLowerCase().includes(needle)) : lines
    if (needle) return [{ label: "Matches", items: matching }]

    const popular = matching.filter((line) => line.count >= POPULAR_COUNT).sort((a, b) => b.count - a.count)
    const popularNames = new Set(popular.map((line) => line.name))
    const rest = matching.filter((line) => !popularNames.has(line.name))
    const buckets = new Map<string, typeof lines>()
    for (const line of rest) {
      const bucket = bucketOf(line.name)
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), line])
    }
    return [
      ...(popular.length ? [{ label: "Popular", items: popular }] : []),
      ...[...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items })),
    ]
  }, [lines, panelSearch])

  const lineLabel = filters.category
    ? GRADE_CATEGORIES.has(filters.category) ? "Grade" : "Brand"
    : "Grade or brand"

  const active = Boolean(filters.category || filters.line || filters.search || filters.favouritesOnly)
  const visibleCategories = moreOpen ? categories : categories.slice(0, TILES_BEFORE_MORE)
  const hiddenCount = Math.max(0, categories.length - TILES_BEFORE_MORE)

  // A panel that covers the grid should close on Escape and on a click outside
  // it, the way any other dismissible layer does.
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPanelOpen(false) }
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setPanelOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick) }
  }, [panelOpen])

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })
  }

  return (
    <div className="browse-bar">
      <input
        className="browse-search"
        type="search"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder="Search by strain or product name…"
        aria-label="Search by strain or product name"
      />

      <div className="browse-cats">
        <span className="browse-label">Category <em>— tap an icon</em></span>
        <div className="cat-tiles">
          {visibleCategories.map((category) => {
            const on = filters.category === category
            return (
              <button
                key={category}
                type="button"
                className={`cat-tile ${on ? "cat-on" : ""}`}
                aria-pressed={on}
                // Changing category drops the line: an Edibles brand means
                // nothing once you are looking at Vapes.
                onClick={() => onChange({ ...filters, category: on ? "" : category, line: "" })}
              >
                <ProductIcon category={category} />
                <span>{category}</span>
              </button>
            )
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              className={`cat-tile cat-more ${moreOpen ? "cat-on" : ""}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span className="cat-more-mark" aria-hidden="true">{moreOpen ? "−" : `+${hiddenCount}`}</span>
              <span>{moreOpen ? "Less" : "More"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="browse-actions">
        <div className="filter-anchor" ref={panelRef}>
          <button
            type="button"
            className={`browse-button ${filters.line ? "browse-button-on" : ""}`}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            Filters ({lineLabel}){filters.line ? `: ${filters.line}` : ""}
          </button>

          {panelOpen && (
            <div className="filter-panel">
              <input
                className="filter-panel-search"
                type="search"
                value={panelSearch}
                onChange={(event) => setPanelSearch(event.target.value)}
                placeholder={`Search ${lineLabel.toLowerCase()}…`}
                aria-label={`Search ${lineLabel.toLowerCase()}`}
                autoFocus
              />
              <div className="filter-panel-scroll">
                <button
                  type="button"
                  className={`panel-option ${filters.line ? "" : "panel-option-on"}`}
                  onClick={() => { onChange({ ...filters, line: "" }); setPanelOpen(false) }}
                >
                  All {lineLabel.toLowerCase()}
                </button>
                {!groups.length && <p className="panel-empty">Nothing matches that.</p>}
                {groups.map((group) => {
                  const open = panelSearch.trim() ? true : openGroups.has(group.label)
                  return (
                    <div className="panel-group" key={group.label}>
                      <button
                        type="button"
                        className="panel-group-head"
                        aria-expanded={open}
                        onClick={() => toggleGroup(group.label)}
                      >
                        <span>{group.label}</span>
                        <em>{group.items.length}</em>
                        <i aria-hidden="true">{open ? "−" : "+"}</i>
                      </button>
                      {open && (
                        <div className="panel-group-body">
                          {group.items.map((line) => (
                            <button
                              key={line.name}
                              type="button"
                              className={`panel-option ${filters.line === line.name ? "panel-option-on" : ""}`}
                              onClick={() => {
                                onChange({ ...filters, line: filters.line === line.name ? "" : line.name })
                                setPanelOpen(false)
                              }}
                            >
                              {line.name} <em>{line.count}</em>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`browse-button browse-favourites ${filters.favouritesOnly ? "browse-button-on" : ""}`}
          aria-pressed={filters.favouritesOnly}
          onClick={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })}
        >
          <span aria-hidden="true">{filters.favouritesOnly ? "♥" : "♡"}</span>
          Favourites{savedCount ? ` (${savedCount})` : ""}
        </button>

        {active && (
          <button type="button" className="filter-clear" onClick={() => onChange(NO_FILTERS)}>Clear</button>
        )}
      </div>

      <p className="browse-note">
        {lines.length} {lineLabel.toLowerCase()} options tucked away · favourites saved across visits
        <span className="browse-count">{resultCount} {resultCount === 1 ? "item" : "items"}</span>
      </p>
    </div>
  )
}

"use client"

import { useMemo } from "react"
import type { CatalogProduct } from "@/lib/types"

export type Filters = { category: string; line: string; search: string }
export const NO_FILTERS: Filters = { category: "", line: "", search: "" }

/**
 * CDASH overloads `grade`. For flower and pre-rolls it is a cultivation grade
 * (Indoor, Hydroponic); for vapes, edibles and papers it is the brand line
 * (Awaken, Jane's, OCB). The separate `brand` column is filled on barely a
 * fifth of stock, so "grade or brand" is one filter rather than two, and the
 * heading changes to match whichever the chosen category actually uses.
 */
const GRADE_CATEGORIES = new Set(["Buds/Flower", "Pre-rolls", "Moonsticks", "Shooters"])

export function lineOf(product: CatalogProduct) {
  return (product.grade || product.brand || "").trim()
}

export function applyFilters(products: CatalogProduct[], filters: Filters) {
  const search = filters.search.trim().toLowerCase()
  return products.filter((product) => {
    if (filters.category && product.productType !== filters.category) return false
    if (filters.line && lineOf(product) !== filters.line) return false
    if (search && !product.name.toLowerCase().includes(search)) return false
    return true
  })
}

export function StoreFilters({
  products,
  filters,
  onChange,
  resultCount,
}: {
  products: CatalogProduct[]
  filters: Filters
  onChange: (next: Filters) => void
  resultCount: number
}) {
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.productType).filter(Boolean))].sort(),
    [products],
  )

  // Lines are drawn from what is in the chosen category, so the row never
  // offers a filter that would return nothing.
  const lines = useMemo(() => {
    const scope = filters.category ? products.filter((p) => p.productType === filters.category) : products
    return [...new Set(scope.map(lineOf).filter(Boolean))].sort()
  }, [products, filters.category])

  const lineLabel = filters.category
    ? GRADE_CATEGORIES.has(filters.category) ? "Grade" : "Brand"
    : "Grade or brand"

  const active = Boolean(filters.category || filters.line || filters.search)

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label">Category</span>
        <div className="filter-chips">
          <button type="button" className={`chip ${filters.category ? "" : "chip-on"}`} onClick={() => onChange({ ...filters, category: "", line: "" })}>All</button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`chip ${filters.category === category ? "chip-on" : ""}`}
              // Changing category drops the line: an Edibles brand means
              // nothing once you are looking at Vapes.
              onClick={() => onChange({ ...filters, category: filters.category === category ? "" : category, line: "" })}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {lines.length > 1 && (
        <div className="filter-row">
          <span className="filter-label">{lineLabel}</span>
          <div className="filter-chips">
            <button type="button" className={`chip ${filters.line ? "" : "chip-on"}`} onClick={() => onChange({ ...filters, line: "" })}>All</button>
            {lines.map((line) => (
              <button
                key={line}
                type="button"
                className={`chip ${filters.line === line ? "chip-on" : ""}`}
                onClick={() => onChange({ ...filters, line: filters.line === line ? "" : line })}
              >
                {line}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-row filter-row-search">
        <span className="filter-label">Strain</span>
        <input
          className="filter-search"
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder={filters.line ? `Search within ${filters.line}` : "Search by strain or product name"}
          aria-label="Search by strain or product name"
        />
        <span className="filter-count">{resultCount} {resultCount === 1 ? "item" : "items"}</span>
        {active && <button type="button" className="filter-clear" onClick={() => onChange(NO_FILTERS)}>Clear</button>}
      </div>
    </div>
  )
}

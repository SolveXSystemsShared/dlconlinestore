import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const path = vi.hoisted(() => ({ current: "/" }))

vi.mock("next/navigation", () => ({ usePathname: () => path.current }))
vi.mock("next/script", () => ({ default: () => null }))

const { default: StoreLayout } = await import("./layout")
const { default: RootLayout } = await import("../layout")
const rootNotFound = await import("../not-found")
const storeNotFound = await import("./not-found")

const APP = join(__dirname, "..")
const PAGE = createElement("main", { id: "the-page" }, "members only")

function files(name: RegExp, dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return files(name, full)
    return name.test(entry.name) ? [relative(APP, full)] : []
  })
}

describe("the gate", () => {
  beforeEach(() => { path.current = "/" })

  it.each(["/bag", "/account", "/register", "/exchange/x", "/settings/fulfilment"])("holds %s back until the visitor has been checked", (pathname) => {
    path.current = pathname
    const html = renderToStaticMarkup(createElement(StoreLayout, null, PAGE))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('data-state="checking"')
    expect(html).not.toContain("the-page")
    expect(html).not.toContain("members only")
  })

  it("covers every page there is", () => {
    const pages = files(/^page\.(tsx|ts|jsx|js|mdx)$/)
    expect(pages.length).toBeGreaterThanOrEqual(6)
    expect(pages.filter((page) => !page.startsWith("(store)/")), "put store pages in app/(store)").toEqual([])
    // No layout further in can take them out from under it, and no page in a
    // parallel slot or intercepted route can render beside it.
    expect(files(/^layout\.(tsx|ts|jsx|js)$/).sort()).toEqual(["(store)/layout.tsx", "layout.tsx"])
    expect(pages.filter((page) => /(^|\/)(@|\(\.)/.test(page))).toEqual([])
  })

  it("keeps a store page's own error and not-found screens behind it", () => {
    expect(files(/^(error|not-found)\.(tsx|ts|jsx|js)$/).sort()).toEqual(["(store)/error.tsx", "(store)/not-found.tsx", "not-found.tsx"])
    expect(storeNotFound.default).toBe(rootNotFound.default)
  })
})

describe("the 404", () => {
  const html = renderToStaticMarkup(createElement(RootLayout, null, createElement(rootNotFound.default)))

  it("says so in the server's HTML, without the gate", () => {
    expect(html).toContain("<h1 id=\"sfErrorTitle\">Page not<br/>found.</h1>")
    expect(html).toContain("The page you were looking for has moved, or the link is out of date.")
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain("checking you in")
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html.match(/<main/g)).toHaveLength(1)
  })

  it("links to the shop, the bag and the lounge", () => {
    for (const href of ["/strains.html", "/bag", "/"]) expect(html).toContain(`href="${href}"`)
  })

  it("is not indexed", () => {
    expect(rootNotFound.metadata).toMatchObject({ title: "Page not found | Down Low Cannabis", robots: { index: false } })
  })

  it("loads nothing that looks up the member, or covers the message", () => {
    for (const file of ["layout.tsx", "not-found.tsx"]) {
      const source = readFileSync(join(APP, file), "utf8")
      for (const name of ["next/script", "cloudy.js", "pwa.js", "cookies.js", "access-gate", "/api/", "member-", "use client"]) expect(source, `${file} ${name}`).not.toContain(name)
    }
  })
})

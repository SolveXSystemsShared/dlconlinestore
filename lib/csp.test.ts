import { readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { cspFor, normalisePath, publicFileSet, REACT_CSP, STRICT_CSP } from "./csp"

const APP = join(__dirname, "..", "app")
const FILES = publicFileSet(JSON.stringify(["/index.html", "/strains.html", "/product.html", "/store.js", "/assets/dlc-logo.svg"]))
const NO_LIST = publicFileSet(undefined)

/**
 * Every page route under app/, with a sample path for it: route groups and
 * parallel slots drop out, a dynamic segment becomes "x", and a catch-all
 * becomes "a/b".
 */
function appPages(dir = APP): Array<{ file: string; path: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // _folders are private and api/ holds route handlers, not pages.
      return entry.name.startsWith("_") || full === join(APP, "api") ? [] : appPages(full)
    }
    if (!/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) return []
    const segments = relative(APP, dir).split(sep).filter(Boolean)
      .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@"))
      .map((segment) => (/^\[\[?\.\.\./.test(segment) ? "a/b" : /^\[.*\]$/.test(segment) ? "x" : segment))
    return [{ file: relative(APP, full), path: "/" + segments.join("/") }]
  })
}

describe("the two policies", () => {
  it("differ only in script-src", () => {
    expect(STRICT_CSP).toContain("script-src 'self';")
    expect(REACT_CSP).toBe(STRICT_CSP.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"))
  })

  it("keep every directive", () => {
    expect(STRICT_CSP.split("; ")).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "manifest-src 'self'",
      "worker-src 'self'",
    ])
  })
})

describe("normalisePath", () => {
  it.each([
    ["/", "/"],
    ["//", "/"],
    ["/strains%2Ehtml", "/strains.html"],
    ["/%73trains.html", "/strains.html"],
    ["//strains.html", "/strains.html"],
    ["/strains.html/", "/strains.html"],
    ["/assets/../strains.html", "/strains.html"],
    ["/assets/%2e%2e/strains.html", "/strains.html"],
    ["/assets%2F..%2Fstrains.html", "/strains.html"],
    ["/assets%5C..%5Cstrains.html", "/strains.html"],
    ["/../../strains.html", "/strains.html"],
    ["/./strains.html", "/strains.html"],
    // Decoded once, as the server does: this names a file called "strains%2Ehtml".
    ["/strains%252Ehtml", "/strains%2Ehtml"],
  ])("reads %s as %s", (path, expected) => {
    expect(normalisePath(path)).toBe(expected)
  })

  it("gives up on a malformed encoding", () => {
    for (const path of ["/%E0%A4", "/%", "/strains%2", "/%zz"]) expect(normalisePath(path), path).toBeNull()
  })
})

describe("cspFor", () => {
  it.each([
    "/", "//", "/index.html", "/strains.html", "/strains%2Ehtml", "/strains%2ehtml", "/%73trains.html",
    "//strains.html", "/strains.html/", "/assets/../strains.html", "/assets/%2e%2e/strains.html",
    "/STRAINS.HTML", "/Strains%2EHtml", "/product.html", "/store.js", "/assets/dlc-logo.svg",
    "/%E0%A4", "/%", "/api", "/api/catalog", "/%61pi/catalog", "/api/nope",
  ])("is strict for %s", (path) => {
    expect(cspFor(path, FILES)).toBe(STRICT_CSP)
  })

  it.each([
    "/no-such-page", "/no-such.html", "/favicon.ico", "/strains%252Ehtml", "/strains.htmlx", "/strains", "/apiary",
    "/bag", "/bag/", "/account", "/register", "/exchange/x", "/settings/fulfilment",
  ])("is the React policy for %s", (path) => {
    expect(cspFor(path, FILES)).toBe(REACT_CSP)
  })

  it("lets the React policy reach every page under app/, with the list and without it", () => {
    const pages = appPages()
    expect(pages.map((page) => page.path)).toEqual(expect.arrayContaining(["/bag", "/account", "/register", "/exchange/x", "/settings/fulfilment"]))
    for (const files of [FILES, NO_LIST]) {
      const missing = pages.filter((page) => cspFor(page.path, files) !== REACT_CSP).map((page) => page.file)
      expect(missing, `add these pages to lib/csp.ts: ${missing.join(", ")}`).toEqual([])
    }
  })
})

describe("without the list of public files", () => {
  it("reads a missing, empty or broken list as empty", () => {
    for (const json of [undefined, "", "[]", "{}", "null", "not json", "[1, null]"]) expect(publicFileSet(json).size, String(json)).toBe(0)
  })

  it("is strict for everything that is not a known React page", () => {
    for (const path of ["/", "/strains.html", "/strains%2Ehtml", "/no-such-page", "/%E0%A4", "/api/catalog", "/exchange", "/settings", "/bagx"]) {
      expect(cspFor(path, NO_LIST), path).toBe(STRICT_CSP)
    }
    for (const path of ["/bag", "/account", "/register", "/menu", "/exchange/x", "/settings/fulfilment"]) {
      expect(cspFor(path, NO_LIST), path).toBe(REACT_CSP)
    }
  })
})

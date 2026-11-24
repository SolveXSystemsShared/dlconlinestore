/**
 * Which Content-Security-Policy a path gets. proxy.ts sends it.
 *
 * Every script on the storefront pages in public/ is a file, so they get
 * script-src 'self' alone and an injected inline script cannot run there. The
 * React pages, and Next's 404 page, still need 'unsafe-inline' for Next's
 * inline bootstrap scripts.
 *
 * This is decided here, on the decoded path, because the server decodes a path
 * before it picks a file: /strains%2Ehtml is /strains.html, and a rule written
 * against the raw path misses it.
 */

// Everything is locked to this site. Product photos may come from CDASH
// storage, hence https: for images. The site uses the system font stack, so no
// web fonts are loaded.
//
// No upgrade-insecure-requests: HSTS already keeps the site on HTTPS, and every
// fetch directive is 'self' or https:, so it added nothing — while WebKit
// applies it to http://localhost, which broke every script and style on a
// local production build.
const policy = (scriptSrc: string) => [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
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
].join("; ")

export const STRICT_CSP = policy("'self'")
export const REACT_CSP = policy("'self' 'unsafe-inline'")

/**
 * The React app's page routes. Only used when the list of public files is
 * missing, to keep those pages working while everything else is strict;
 * lib/csp.test.ts walks app/ and fails if a page is missing here.
 */
const REACT_PAGES = new Set(["/account", "/bag", "/menu", "/register"])
const REACT_PREFIXES = ["/exchange/", "/settings/"]

const isReactPage = (path: string) => REACT_PAGES.has(path) || REACT_PREFIXES.some((prefix) => path.startsWith(prefix))

/**
 * The path as the server will read it: decoded once, with `.` and `..`
 * resolved, repeated slashes collapsed and no trailing slash. Null when the
 * encoding is malformed.
 */
export function normalisePath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const segments: string[] = []
  for (const segment of decoded.split(/[/\\]/)) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") segments.pop()
    else segments.push(segment)
  }
  return "/" + segments.join("/")
}

// Compared without case: a host that serves files regardless of case must not
// hand /STRAINS.HTML the looser policy.
const fold = (path: string) => path.normalize("NFC").toLowerCase()

/** The public file list next.config.mjs built, as a set. Empty if it is missing or unreadable. */
export function publicFileSet(json: string | undefined): ReadonlySet<string> {
  try {
    const files: unknown = JSON.parse(json || "[]")
    if (!Array.isArray(files)) return new Set()
    return new Set(files.filter((file): file is string => typeof file === "string").map(fold))
  } catch {
    return new Set()
  }
}

/**
 * Strict for the lounge, every file in public/, the API, and any path that
 * cannot be read; the React policy for the rest, which is the React pages and
 * the 404. Without the list of public files nothing can be told apart from a
 * storefront page, so only the known React pages are let off the strict one.
 */
export function cspFor(pathname: string, publicFiles: ReadonlySet<string>): string {
  const path = normalisePath(pathname)
  if (path === null) return STRICT_CSP
  const folded = fold(path)
  if (folded === "/" || folded === "/api" || folded.startsWith("/api/")) return STRICT_CSP
  if (publicFiles.size === 0) return isReactPage(path) ? REACT_CSP : STRICT_CSP
  return publicFiles.has(folded) ? STRICT_CSP : REACT_CSP
}

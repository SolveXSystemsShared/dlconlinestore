import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "./proxy"

function post(path: string, headers: Record<string, string> = {}, method = "POST") {
  return new NextRequest(`http://localhost${path}`, { method, headers: { origin: "http://localhost", ...headers } })
}

/** NextResponse.next() marks the request as passed on rather than answered. */
const passedOn = (response: Response) => response.headers.get("x-middleware-next") === "1"

describe("proxy body size", () => {
  it("refuses a Content-Length over the limit", () => {
    expect(proxy(post("/api/cart", { "content-length": String(64 * 1024 + 1) })).status).toBe(413)
  })

  it("gives registration 1 MB", () => {
    expect(passedOn(proxy(post("/api/members/register", { "content-length": String(1024 * 1024) })))).toBe(true)
    expect(proxy(post("/api/members/register", { "content-length": String(1024 * 1024 + 1) })).status).toBe(413)
  })

  it("refuses a Content-Length that is not a whole number", () => {
    for (const value of ["abc", "1.5", "-1", "1e9", "10, 10"]) {
      expect(proxy(post("/api/cart", { "content-length": value })).status).toBe(400)
    }
  })

  it("lets a request without Content-Length through to the route", () => {
    expect(passedOn(proxy(post("/api/wishlist", {}, "DELETE")))).toBe(true)
    expect(passedOn(proxy(post("/api/cart")))).toBe(true)
  })
})

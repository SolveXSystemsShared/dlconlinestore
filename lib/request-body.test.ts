import { describe, expect, it } from "vitest"
import { MAX_BODY, MAX_REGISTRATION_BODY, MAX_WEBHOOK_BODY, readJsonBody, readTextBody } from "./request-body"

const encoder = new TextEncoder()

/**
 * A POST whose body arrives in chunks with no Content-Length, the way a chunked
 * upload or an HTTP/2 stream does. `pulled` counts the chunks actually read, so
 * a test can see the reader stopped early.
 */
function chunkedRequest(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false }
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) return controller.close()
      state.pulled++
      controller.enqueue(chunks[index++])
    },
    cancel() {
      state.cancelled = true
    },
  })
  const request = new Request("http://localhost/api/cart", { method: "POST", body, duplex: "half" } as RequestInit)
  expect(request.headers.get("content-length")).toBeNull()
  return { request, state }
}

/** A JSON body padded with spaces to exactly `size` bytes. */
function jsonOfSize(size: number) {
  const base = JSON.stringify({ productId: "abc", quantity: 1 })
  return base + " ".repeat(size - base.length)
}

describe("readJsonBody", () => {
  it("refuses a chunked stream over 64 KB with 413 and stops reading", async () => {
    const chunk = new Uint8Array(16 * 1024).fill(0x20)
    const { request, state } = chunkedRequest(Array.from({ length: 10 }, () => chunk))
    const result = await readJsonBody(request)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(413)
    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBeLessThan(10)
  })

  it("accepts a body of exactly 64 KB", async () => {
    const text = jsonOfSize(MAX_BODY)
    expect(encoder.encode(text).byteLength).toBe(MAX_BODY)
    const { request } = chunkedRequest([encoder.encode(text)])
    expect(await readJsonBody(request)).toEqual({ ok: true, data: { productId: "abc", quantity: 1 } })
  })

  it("refuses one byte over 64 KB", async () => {
    const { request } = chunkedRequest([encoder.encode(jsonOfSize(MAX_BODY + 1))])
    const result = await readJsonBody(request)
    expect(result.ok ? 200 : result.response.status).toBe(413)
  })

  it("refuses a declared Content-Length over the limit without reading", async () => {
    const request = new Request("http://localhost/api/cart", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_BODY + 1) },
    })
    const result = await readJsonBody(request)
    expect(result.ok ? 200 : result.response.status).toBe(413)
  })

  it("answers 400 for bad JSON", async () => {
    const request = new Request("http://localhost/api/cart", { method: "POST", body: "{not json" })
    const result = await readJsonBody(request)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(await result.response.json()).toEqual({ error: "That request could not be read" })
  })

  it("answers 400 for an empty body", async () => {
    const empty = new Request("http://localhost/api/cart", { method: "POST", body: "" })
    const none = new Request("http://localhost/api/cart", { method: "DELETE" })
    const blank = new Request("http://localhost/api/cart", { method: "POST", body: "   " })
    for (const request of [empty, none, blank]) {
      const result = await readJsonBody(request)
      expect(result.ok ? 200 : result.response.status).toBe(400)
    }
  })

  it("honours the registration limit", async () => {
    const atLimit = chunkedRequest([encoder.encode(jsonOfSize(MAX_REGISTRATION_BODY))])
    expect((await readJsonBody(atLimit.request, MAX_REGISTRATION_BODY)).ok).toBe(true)

    const over = chunkedRequest([encoder.encode(jsonOfSize(MAX_REGISTRATION_BODY + 1))])
    const result = await readJsonBody(over.request, MAX_REGISTRATION_BODY)
    expect(result.ok ? 200 : result.response.status).toBe(413)

    // The same 1 MB body is far over the default limit.
    const defaultLimit = chunkedRequest([encoder.encode(jsonOfSize(MAX_REGISTRATION_BODY))])
    const refused = await readJsonBody(defaultLimit.request)
    expect(refused.ok ? 200 : refused.response.status).toBe(413)
  })
})

describe("readTextBody", () => {
  it("returns the exact text under the webhook cap", async () => {
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "ref_123456" } })
    const request = new Request("http://localhost/api/webhooks/paystack", { method: "POST", body: raw })
    expect(await readTextBody(request)).toEqual({ ok: true, data: raw })
  })

  it("refuses a webhook body over 256 KB", async () => {
    expect(MAX_WEBHOOK_BODY).toBe(256 * 1024)
    const atCap = chunkedRequest([new Uint8Array(MAX_WEBHOOK_BODY).fill(0x20)])
    expect((await readTextBody(atCap.request)).ok).toBe(true)

    const chunk = new Uint8Array(64 * 1024).fill(0x20)
    const { request, state } = chunkedRequest(Array.from({ length: 5 }, () => chunk))
    const result = await readTextBody(request)
    expect(result.ok ? 200 : result.response.status).toBe(413)
    expect(state.cancelled).toBe(true)
  })
})

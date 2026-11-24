"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Store = { id: string; name: string }

/**
 * Director control for online fulfilment.
 *
 * Which store fulfils online orders decides three things at once: whose pending
 * queue every order lands in, which shelf the catalogue advertises, and which
 * store new online registrations are attached to. It used to be an environment
 * variable, which meant a redeploy — and not by a director.
 */
export default function FulfilmentSettingsPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selected, setSelected] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings/fulfilment-store")
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!ok) return setError(data.error || "Could not load this setting")
        setStores(data.stores as Store[])
        setSelected(data.fulfillmentStoreId || "")
      })
      .catch(() => setError("Could not load this setting"))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true); setMessage(""); setError("")
    try {
      const response = await fetch("/api/settings/fulfilment-store", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId: selected }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save")
      setMessage(`Online orders now go to ${data.storeName}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save")
    } finally { setSaving(false) }
  }

  return (
    <main className="shell">
      <header className="topbar"><Link className="brand-logo" href="/"><img src="/assets/dlc-logo-black.png" alt="DLC" /></Link><Link className="button secondary" href="/">Back to store</Link></header>
      <section className="content">
        <div className="section-heading"><div><h2>Online fulfilment</h2><p>The store that picks, packs and settles every online order.</p></div></div>
        <div className="card" style={{ maxWidth: 480 }}>
          {loading && <p className="empty">Loading…</p>}
          {!loading && !error && (
            <>
              <div className="field">
                <label htmlFor="store">Fulfilment store</label>
                <select id="store" value={selected} onChange={(event) => setSelected(event.target.value)}>
                  <option value="">Choose a store…</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <p className="notice">Changing this moves the pending queue, the catalogue and new online registrations to the store you pick. It takes effect within a minute.</p>
              <button className="button" onClick={save} disabled={saving || !selected}>{saving ? "Saving…" : "Save"}</button>
            </>
          )}
          {message && <p className="notice">{message}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </section>
    </main>
  )
}

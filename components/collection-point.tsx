import type { CollectionPoint } from "@/lib/types"

/**
 * Uber with the store as the drop-off. Uber's universal link opens the app
 * where it is installed and m.uber.com where it is not; the member picks the
 * ride and pays Uber themselves.
 */
export function uberToStore(point: CollectionPoint) {
  const params = new URLSearchParams({ action: "setPickup", pickup: "my_location", "dropoff[nickname]": point.name })
  if (point.address) params.set("dropoff[formatted_address]", point.address)
  return `https://m.uber.com/ul/?${params.toString()}`
}

export function mapsToStore(point: CollectionPoint) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([point.name, point.address].filter(Boolean).join(", "))}`
}

/** Where to collect, with one tap into Uber. Shared by the bag and the confirmation page. */
export function CollectionPointCard({ point }: { point: CollectionPoint | null }) {
  if (!point) return <p className="sf-note">Collect from the DLC lounge. The team will confirm the address with your exchange request.</p>
  return <div className="sf-member sf-collect">
    <div>
      <small>COLLECT FROM · {point.name}</small>
      <strong>{point.address || point.name}</strong>
      {point.phone && <small className="sf-collect-phone"><a href={`tel:${point.phone.replace(/\s+/g, "")}`} style={{ color: "inherit" }}>{point.phone}</a></small>}
    </div>
    <div className="sf-actions">
      <a className="sf-cta" href={uberToStore(point)} target="_blank" rel="noopener noreferrer">Open in Uber <span>→</span></a>
      <a className="sf-ghost" href={mapsToStore(point)} target="_blank" rel="noopener noreferrer">Map</a>
    </div>
  </div>
}

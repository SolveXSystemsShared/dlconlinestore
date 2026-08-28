/**
 * Mascot loading animation.
 *
 * The 3D mascot art has its blue backdrop baked in (no alpha), so the orb and
 * the artwork animate as a single object — moving the image inside a
 * differently-coloured container would expose the edge of that backdrop.
 * Depth comes from the classic trio instead: a bob, squash-and-stretch on the
 * landing, and a contact shadow that spreads as the orb rises.
 *
 * `rings` adds the expanding pulse rings. Leave it off to use the mascot as a
 * living greeter rather than a busy indicator.
 */
export function MascotLoader({
  label = "",
  size = "md",
  rings = true,
}: {
  label?: string
  size?: "sm" | "md" | "lg"
  rings?: boolean
}) {
  return (
    <div
      className={`mascot-loader mascot-loader-${size}`}
      role={rings ? "status" : undefined}
      aria-live={rings ? "polite" : undefined}
    >
      <div className="mascot-loader-stage">
        {rings && <>
          <span className="mascot-loader-ring" aria-hidden="true" />
          <span className="mascot-loader-ring ring-late" aria-hidden="true" />
        </>}
        <div className="mascot-loader-float">
          <div className="mascot-loader-orb">
            <img src="/assets/dlc-mascot-3d.jpg" alt="" />
          </div>
        </div>
        <span className="mascot-loader-shadow" aria-hidden="true" />
      </div>
      {label && <p className="mascot-loader-label">{label}</p>}
    </div>
  )
}

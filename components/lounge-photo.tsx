"use client"

import { useState } from "react"

/**
 * A photograph of the physical lounge.
 *
 * The final files are being shot separately, so until one lands at the given
 * path this renders a labelled placeholder rather than a broken image. Dropping
 * the photo into /public/assets under the same name is the whole handover — no
 * code change needed.
 */
export function LoungePhoto({
  src,
  alt,
  note,
  className = "",
  style,
}: {
  src: string
  alt: string
  note: string
  className?: string
  style?: React.CSSProperties
}) {
  const [missing, setMissing] = useState(false)

  if (missing) {
    return (
      <div className={`lounge-photo lounge-photo-pending ${className}`} style={style} role="img" aria-label={`${alt} — photograph pending`}>
        <span className="pending-mark" aria-hidden="true">◈</span>
        <b>{note}</b>
        <small>Drop the final file at <code>{src}</code></small>
      </div>
    )
  }

  return <img className={`lounge-photo ${className}`} style={style} src={src} alt={alt} onError={() => setMissing(true)} />
}

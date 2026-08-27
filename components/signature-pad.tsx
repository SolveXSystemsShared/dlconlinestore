"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Draw-to-sign canvas. Emits a PNG data URL, which is what CDASH stores in
 * members.digital_signature. Supports mouse and touch via pointer events.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // Ink is tracked in a ref as well as state: `end` runs in the same event
  // burst as `move`, so the state value it closes over can still be stale.
  // The ref is what decides whether the signature is emitted; the state only
  // drives the label and the Clear button.
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Size the backing store to the device pixel ratio so the line is not blurry.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.2
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#14202e"
  }, [])

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext("2d")
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const { x, y } = positionOf(event)
    context.beginPath()
    context.moveTo(x, y)
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext("2d")
    if (!context) return
    const { x, y } = positionOf(event)
    context.lineTo(x, y)
    context.stroke()
    if (!hasInkRef.current) {
      hasInkRef.current = true
      setHasInk(true)
    }
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas && hasInkRef.current) onChange(canvas.toDataURL("image/png"))
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    setHasInk(false)
    onChange("")
  }

  return <div className="signature-field">
    <canvas
      ref={canvasRef}
      className="signature-canvas"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
    />
    <div className="signature-actions">
      <span>{hasInk ? "Signed" : "Draw your signature above"}</span>
      <button type="button" className="signature-clear" onClick={clear} disabled={!hasInk}>Clear</button>
    </div>
  </div>
}

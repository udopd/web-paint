import { useEffect, useState } from 'react'

const MAX_CANVAS_PIXELS = 3_000_000

export default function CanvasSettings({ width, height, transparent, onApplySize, onToggleTransparency, onClose }) {
  const [draftWidth, setDraftWidth] = useState(width)
  const [draftHeight, setDraftHeight] = useState(height)
  const [sizeError, setSizeError] = useState('')

  useEffect(() => {
    setDraftWidth(width)
    setDraftHeight(height)
  }, [width, height])

  const applySize = (event) => {
    event.preventDefault()
    const nextWidth = Number(draftWidth)
    const nextHeight = Number(draftHeight)
    if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth < 64 || nextHeight < 64) {
      setSizeError('Dimensions must be whole numbers of at least 64 px.')
      return
    }
    if (nextWidth > 3000 || nextHeight > 3000 || nextWidth * nextHeight > MAX_CANVAS_PIXELS) {
      setSizeError('Maximum canvas area is 3 megapixels (3000 px per side).')
      return
    }
    setSizeError('')
    onApplySize(nextWidth, nextHeight)
    onClose()
  }

  return (
    <section className="theme-panel w-[min(18rem,calc(100vw-2rem))] rounded-xl border p-3 shadow-xl" aria-labelledby="canvas-settings-title">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 id="canvas-settings-title" className="theme-text text-xs font-semibold">Canvas settings</h4>
        <span className="theme-muted text-[10px]">{width} × {height}</span>
      </div>
      <form onSubmit={applySize}>
        <div className="grid grid-cols-2 gap-2">
          <label className="theme-muted text-[10px] font-medium">
            Width
            <span className="mt-1 flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--panel-subtle)] px-2">
              <input type="number" min="64" max="3000" value={draftWidth} onChange={(event) => setDraftWidth(event.target.value)} className="theme-text min-w-0 w-full bg-transparent py-1.5 text-xs outline-none" aria-label="Canvas width in pixels" />
              <span>px</span>
            </span>
          </label>
          <label className="theme-muted text-[10px] font-medium">
            Height
            <span className="mt-1 flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--panel-subtle)] px-2">
              <input type="number" min="64" max="3000" value={draftHeight} onChange={(event) => setDraftHeight(event.target.value)} className="theme-text min-w-0 w-full bg-transparent py-1.5 text-xs outline-none" aria-label="Canvas height in pixels" />
              <span>px</span>
            </span>
          </label>
        </div>
        {sizeError && <p className="mt-1.5 text-[10px] text-rose-500" role="alert">{sizeError}</p>}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <label className="theme-muted flex cursor-pointer items-center gap-2 text-[11px]">
            <input type="checkbox" checked={transparent} onChange={onToggleTransparency} className="accent-indigo-600" />
            Transparent background
          </label>
          <button type="submit" className="site-cta px-2.5 py-1.5 text-[10px] font-semibold transition">Apply</button>
        </div>
      </form>
    </section>
  )
}

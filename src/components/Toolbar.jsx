import {
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  RectangleHorizontal,
  Type,
} from 'lucide-react'
import { PALETTE, TOOLS } from '../constants.js'

const ICONS = {
  brush: Pencil,
  eraser: Eraser,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  line: Minus,
  fill: PaintBucket,
  picker: MousePointer2,
  text: Type,
}

export default function Toolbar({ tool, onToolChange, color, onColorChange, brushSize, onBrushSizeChange, textSize, onTextSizeChange }) {
  return (
    <aside className="theme-panel flex shrink-0 flex-col gap-3 rounded-xl border p-2.5 shadow-sm sm:p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.map((item) => {
            const Icon = ICONS[item.id]
            const active = tool === item.id
            return (
              <button
                key={item.id}
                type="button"
                title={`${item.label} (${item.shortcut})`}
                aria-label={`${item.label} tool`}
                aria-pressed={active}
                onClick={() => onToolChange(item.id)}
                className={`tool-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            )
          })}
        </div>
        <span className="theme-muted hidden whitespace-nowrap text-[10px] xl:inline">{TOOLS.find((item) => item.id === tool)?.label}</span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5 lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        {tool === 'text' ? (
          <div className="flex items-center gap-2">
            <label htmlFor="text-size" className="theme-muted whitespace-nowrap text-[11px] font-medium">Text size</label>
            <input
              id="text-size"
              type="range"
              min="8"
              max="96"
              value={textSize}
              onChange={(event) => onTextSizeChange(Number(event.target.value))}
              className="w-[88px] accent-indigo-600 sm:w-[112px]"
              aria-label="Text size"
            />
            <span className="theme-muted w-7 text-right font-mono text-[10px] tabular-nums">{textSize}px</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label htmlFor="brush-size" className="theme-muted whitespace-nowrap text-[11px] font-medium">Size</label>
            <input
              id="brush-size"
              type="range"
              min="1"
              max="50"
              value={brushSize}
              onChange={(event) => onBrushSizeChange(Number(event.target.value))}
              className="w-[88px] accent-indigo-600 sm:w-[112px]"
              aria-label="Brush size"
            />
            <span className="theme-muted w-7 text-right font-mono text-[10px] tabular-nums">{brushSize}px</span>
          </div>
        )}

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="theme-muted mr-0.5 text-[11px] font-medium">Color</span>
          <div className="flex max-w-[min(70vw,420px)] flex-wrap items-center gap-1">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Select ${swatch}`}
                aria-pressed={color.toLowerCase() === swatch}
                onClick={() => onColorChange(swatch)}
                className={`h-[17px] w-[17px] shrink-0 rounded-full border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${color.toLowerCase() === swatch ? 'border-indigo-600 ring-2 ring-indigo-300 ring-offset-1' : 'border-black/10'}`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <label className="custom-color-picker relative ml-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border" style={{ backgroundColor: color }} title="Choose a custom color">
            <input
              type="color"
              value={color}
              onChange={(event) => onColorChange(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choose custom color"
            />
          </label>
        </div>
      </div>
    </aside>
  )
}

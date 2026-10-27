import {
  ChevronDown,
  Eraser,
  Italic,
  Bold,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  SquareDashed,
  Type,
  Undo2,
} from 'lucide-react'
import { PALETTE, TOOLS } from '../constants.js'

const ICONS = {
  selection: SquareDashed,
  brush: Pencil,
  eraser: Eraser,
  fill: PaintBucket,
  picker: Pipette,
  text: Type,
}

const SHAPE_TOOLS = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
]

export default function Toolbar({
  tool, onToolChange, color, onColorChange, brushSize, onBrushSizeChange,
  fillMode, onFillModeChange, gradientColor, onGradientColorChange, gradientDirection, onGradientDirectionChange,
  textSize, onTextSizeChange, textFont, onTextFontChange, textBold, onTextBoldChange, textItalic, onTextItalicChange,
  textAlign, onTextAlignChange, canUndo, canRedo, onUndo, onRedo, brushSizeId = 'brush-size',
}) {
  const expandedControls = tool === 'fill' || tool === 'text'
  return (
    <aside className={`theme-panel flex shrink-0 flex-col gap-3 rounded-xl border p-2.5 shadow-sm sm:p-3 ${expandedControls ? 'lg:flex-col lg:items-stretch' : 'lg:flex-row lg:items-center lg:justify-between lg:gap-4'}`}>
      <div className={`flex min-w-0 items-center gap-1.5 ${expandedControls ? 'lg:flex-none' : 'lg:flex-1'}`}>
        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.filter((item) => !SHAPE_TOOLS.some((shape) => shape.id === item.id)).map((item) => {
            const Icon = ICONS[item.id]
            const active = tool === item.id
            return (
              <button
                key={item.id}
                type="button"
                title={`${item.label} (${item.shortcut})`}
                aria-label={`${item.label} tool, shortcut ${item.shortcut}`}
                aria-pressed={active}
                onClick={() => onToolChange(item.id)}
                className={`tool-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            )
          })}
          <label className="shape-tool-select-wrap">
            <select
              className={`shape-tool-select ${SHAPE_TOOLS.some((shape) => shape.id === tool) ? 'shape-tool-select-active' : ''}`}
              aria-label="Shape tools"
              title="Shape tools (U)"
              value={SHAPE_TOOLS.some((shape) => shape.id === tool) ? tool : ''}
              onChange={(event) => { if (event.target.value) onToolChange(event.target.value) }}
            >
              <option value="">Shapes</option>
              {SHAPE_TOOLS.map((shape) => <option key={shape.id} value={shape.id}>{shape.label}</option>)}
            </select>
            <ChevronDown size={12} aria-hidden="true" />
          </label>
        </div>
        <span className="theme-muted hidden whitespace-nowrap text-[10px] xl:inline">{TOOLS.find((item) => item.id === tool)?.label ?? SHAPE_TOOLS.find((item) => item.id === tool)?.label}</span>
        <div className="theme-action-group ml-auto flex shrink-0 items-center rounded-lg border p-0.5">
          <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="header-icon-button disabled:cursor-not-allowed disabled:opacity-35"><Undo2 size={16} /></button>
          <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo" className="header-icon-button disabled:cursor-not-allowed disabled:opacity-35"><Redo2 size={16} /></button>
        </div>
      </div>

      <div className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5 ${expandedControls ? 'lg:ml-0 lg:justify-start lg:border-l-0 lg:border-t lg:pl-0 lg:pt-2.5' : 'lg:ml-auto lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0'}`}>
        {tool === 'fill' && <div className="tool-settings-group flex flex-wrap items-center gap-2">
          <label className="theme-muted flex items-center gap-1.5 text-[11px]">
            Fill
            <select className="tool-setting-select" value={fillMode} onChange={(event) => onFillModeChange(event.target.value)} aria-label="Fill type">
              <option value="solid">Solid</option>
              <option value="gradient">Gradient</option>
            </select>
          </label>
          {fillMode === 'gradient' && <>
            <label className="tool-gradient-color" title="Gradient end color">
              <span className="theme-muted text-[10px]">To</span>
              <input type="color" value={gradientColor} onChange={(event) => onGradientColorChange(event.target.value)} aria-label="Gradient end color" />
            </label>
            <select className="tool-setting-select" value={gradientDirection} onChange={(event) => onGradientDirectionChange(event.target.value)} aria-label="Gradient direction">
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="diagonal">Diagonal</option>
            </select>
          </>}
        </div>}
        {tool === 'text' && <div className="tool-settings-group flex flex-wrap items-center gap-2">
          <select className="tool-setting-select" value={textFont} onChange={(event) => onTextFontChange(event.target.value)} aria-label="Text font">
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Courier New">Monospace</option>
            <option value="Verdana">Verdana</option>
          </select>
          <label className="theme-muted flex items-center gap-1 text-[11px]">Size
            <input className="tool-text-size" type="number" min="8" max="160" value={textSize} onChange={(event) => onTextSizeChange(Math.max(8, Math.min(160, Number(event.target.value) || 8)))} aria-label="Text size" />
          </label>
          <button type="button" onClick={() => onTextBoldChange(!textBold)} aria-label="Bold text" aria-pressed={textBold} className={`tool-format-button ${textBold ? 'tool-format-button-active' : ''}`}><Bold size={14} /></button>
          <button type="button" onClick={() => onTextItalicChange(!textItalic)} aria-label="Italic text" aria-pressed={textItalic} className={`tool-format-button ${textItalic ? 'tool-format-button-active' : ''}`}><Italic size={14} /></button>
          <select className="tool-setting-select" value={textAlign} onChange={(event) => onTextAlignChange(event.target.value)} aria-label="Text alignment">
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>}
        <div className="flex items-center gap-2">
            <label htmlFor={brushSizeId} title="Shift + mouse wheel over canvas" className="theme-muted whitespace-nowrap text-[11px] font-medium">Size</label>
            <input
              id={brushSizeId}
              type="range"
              min="1"
              max="50"
              value={brushSize}
              onChange={(event) => onBrushSizeChange(Number(event.target.value))}
              className="w-[88px] accent-indigo-600 sm:w-[112px]"
              aria-label="Brush size"
              title="Use Shift + mouse wheel over the canvas to change size"
            />
            <span className="theme-muted w-7 text-right font-mono text-[10px] tabular-nums">{brushSize}px</span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="theme-muted mr-0.5 text-[11px] font-medium">Color</span>
          <div className="color-palette-swatches flex max-w-[min(70vw,420px)] flex-wrap items-center gap-1">
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

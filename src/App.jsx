import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Cloud,
  Download,
  FileImage,
  LoaderCircle,
  Moon,
  Pencil,
  Redo2,
  Sun,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_ARTWORK_TITLE,
  STORAGE_KEY,
  TITLE_STORAGE_KEY,
} from './constants.js'

function readSavedProject() {
  let saved = null
  let storedTitle = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw)
  } catch {}
  try {
    storedTitle = localStorage.getItem(TITLE_STORAGE_KEY)
  } catch {}

  return {
    dataUrl: saved?.version === 1 && typeof saved.dataUrl === 'string' ? saved.dataUrl : null,
    title: (storedTitle || (typeof saved?.title === 'string' ? saved.title : DEFAULT_ARTWORK_TITLE)).slice(0, 80),
  }
}

function formatSavedTime(date) {
  if (!date) return 'Changes save automatically'
  return `Saved ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`
}

export default function App() {
  const canvasRef = useRef(null)
  const titleInputRef = useRef(null)
  const saveRevisionRef = useRef(0)
  const skipSaveRevisionRef = useRef(null)
  const [savedProject] = useState(readSavedProject)
  const initialArtwork = savedProject.dataUrl
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('canvas-paint-studio:theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const [tool, setTool] = useState('brush')
  const [color, setColor] = useState('#4f46e5')
  const [brushSize, setBrushSize] = useState(8)
  const [textSize, setTextSize] = useState(32)
  const [artworkName, setArtworkName] = useState(savedProject.title)
  const artworkNameRef = useRef(artworkName)
  artworkNameRef.current = artworkName
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(savedProject.title)
  const [textDialog, setTextDialog] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [saveStatus, setSaveStatus] = useState('ready')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [saveRevision, setSaveRevision] = useState(0)
  const [canvasReady, setCanvasReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [hasArtwork, setHasArtwork] = useState(Boolean(initialArtwork))

  useEffect(() => {
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('canvas-paint-studio:theme', theme)
    } catch {
      // Theme still works for this session when storage is unavailable.
    }
  }, [theme])

  const handleContentChange = useCallback(() => {
    setHasArtwork(true)
    setSaveStatus('saving')
    const nextRevision = saveRevisionRef.current + 1
    saveRevisionRef.current = nextRevision
    setSaveRevision(nextRevision)
  }, [])

  const handleHistoryChange = useCallback(({ canUndo: undo, canRedo: redo }) => {
    setCanUndo(undo)
    setCanRedo(redo)
  }, [])

  const handleTextRequest = useCallback((placement) => {
    setTextDraft('')
    setTextDialog(placement)
  }, [])

  const handleTextSubmit = (event) => {
    event.preventDefault()
    if (!textDialog || !textDraft.trim()) return
    canvasRef.current?.addText({ ...textDialog, text: textDraft.trim() })
    setTextDialog(null)
    setTextDraft('')
  }

  const startTitleEdit = () => {
    setTitleDraft(artworkName)
    setIsEditingTitle(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const cancelTitleEdit = () => {
    setTitleDraft(artworkName)
    setIsEditingTitle(false)
  }

  const saveTitle = (event) => {
    event.preventDefault()
    const nextTitle = titleDraft.trim().slice(0, 80) || DEFAULT_ARTWORK_TITLE
    setArtworkName(nextTitle)
    setIsEditingTitle(false)
    try {
      localStorage.setItem(TITLE_STORAGE_KEY, nextTitle)
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved?.version === 1 && typeof saved.dataUrl === 'string') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, title: nextTitle }))
        }
      }
    } catch {
      setSaveStatus('error')
    }
  }

  const handleReady = useCallback(({ restored }) => {
    setCanvasReady(true)
    if (restored) {
      setSaveStatus('saved')
      setLastSavedAt(new Date())
    } else if (initialArtwork) {
      setHasArtwork(false)
      setSaveStatus('error')
    }
  }, [initialArtwork])

  useEffect(() => {
    if (!canvasReady || saveRevision === 0) return undefined

    const timeoutId = window.setTimeout(() => {
      if (skipSaveRevisionRef.current === saveRevision) {
        skipSaveRevisionRef.current = null
        try {
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(TITLE_STORAGE_KEY)
          setSaveStatus('ready')
        } catch {
          setSaveStatus('error')
        }
        return
      }

      try {
        const dataUrl = canvasRef.current?.getDataUrl()
        if (!dataUrl) throw new Error('Canvas image is unavailable')
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          dataUrl,
          title: artworkName,
          savedAt: Date.now(),
        }))
        localStorage.setItem(TITLE_STORAGE_KEY, artworkName)
        setLastSavedAt(new Date())
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [artworkName, canvasReady, saveRevision])

  useEffect(() => {
    const flushSave = () => {
      if (!saveRevisionRef.current) return
      try {
        if (skipSaveRevisionRef.current === saveRevisionRef.current) {
          localStorage.removeItem(STORAGE_KEY)
          return
        }
        const dataUrl = canvasRef.current?.getDataUrl()
        if (dataUrl) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            dataUrl,
            title: artworkNameRef.current,
            savedAt: Date.now(),
          }))
          localStorage.setItem(TITLE_STORAGE_KEY, artworkNameRef.current)
        }
      } catch {
        setSaveStatus('error')
      }
    }

    window.addEventListener('pagehide', flushSave)
    return () => window.removeEventListener('pagehide', flushSave)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const editing = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (editing) return
      if (textDialog) {
        if (event.key === 'Escape') setTextDialog(null)
        return
      }
      if (clearDialogOpen) {
        if (event.key === 'Escape') setClearDialogOpen(false)
        return
      }

      const key = event.key.toLowerCase()
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) canvasRef.current?.redo()
        else canvasRef.current?.undo()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        canvasRef.current?.redo()
        return
      }

      const shortcutTools = { b: 'brush', e: 'eraser', r: 'rectangle', o: 'ellipse', l: 'line', g: 'fill', i: 'picker', t: 'text' }
      if (!modifier && shortcutTools[key]) setTool(shortcutTools[key])
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearDialogOpen, textDialog])

  const handleClear = () => {
    skipSaveRevisionRef.current = saveRevisionRef.current + 1
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TITLE_STORAGE_KEY)
    } catch {
      setSaveStatus('error')
    }
    canvasRef.current?.clear()
    setHasArtwork(false)
    artworkNameRef.current = DEFAULT_ARTWORK_TITLE
    setArtworkName(DEFAULT_ARTWORK_TITLE)
    setTitleDraft(DEFAULT_ARTWORK_TITLE)
    setIsEditingTitle(false)
    setLastSavedAt(null)
    setClearDialogOpen(false)
    setSaveStatus('ready')
  }

  const handleExport = () => {
    const dataUrl = canvasRef.current?.getDataUrl()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    const safeName = artworkName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'canvas-artwork'
    link.download = `${safeName}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const status = {
    ready: { icon: Cloud, text: 'Auto-save is on', tone: 'text-slate-500' },
    saving: { icon: LoaderCircle, text: 'Saving your canvas…', tone: 'text-indigo-600' },
    saved: { icon: Check, text: formatSavedTime(lastSavedAt), tone: 'text-emerald-600' },
    error: { icon: Cloud, text: 'Could not save on this device', tone: 'text-amber-600' },
  }[saveStatus]
  const StatusIcon = status.icon

  return (
    <main data-theme={theme} className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="theme-header z-20 shrink-0 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"><FileImage size={17} /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="theme-text truncate text-sm font-semibold tracking-tight">Canvas</h1>
                <span className="theme-muted hidden text-xs sm:inline">Paint studio</span>
              </div>
              <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${status.tone}`} aria-live="polite">
                <StatusIcon size={12} className={saveStatus === 'saving' ? 'animate-spin' : ''} />
                <span>{status.text}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="theme-action-group mr-1 hidden items-center rounded-lg border p-0.5 sm:flex">
              <button type="button" onClick={() => canvasRef.current?.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="header-icon-button" ><Undo2 size={17} /></button>
              <button type="button" onClick={() => canvasRef.current?.redo()} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo" className="header-icon-button"><Redo2 size={17} /></button>
            </div>
            <button
              type="button"
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              className="header-icon-button"
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button type="button" onClick={() => setClearDialogOpen(true)} disabled={!canvasReady} className="header-secondary-button disabled:cursor-not-allowed disabled:opacity-50" aria-label="Clear canvas"><Trash2 size={16} /><span className="hidden md:inline">Clear</span></button>
            <button type="button" onClick={handleExport} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 sm:px-4"><Download size={16} /><span>Export PNG</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-8">
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            textSize={textSize}
            onTextSizeChange={setTextSize}
          />

          <section className="theme-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border p-2 shadow-sm sm:p-3" aria-label="Canvas workspace">
            <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-2 sm:px-2">
              <div className="min-w-0 flex-1">
                {isEditingTitle ? (
                  <form onSubmit={saveTitle} className="flex max-w-sm items-center gap-1.5">
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Escape') cancelTitleEdit() }}
                      maxLength={80}
                      aria-label="Artwork name"
                      className="theme-text min-w-0 flex-1 border-b border-indigo-400 bg-transparent py-1 text-xs font-medium outline-none"
                    />
                    <button type="submit" className="theme-muted rounded p-1 hover:text-emerald-600" aria-label="Save artwork name" title="Save name"><Check size={14} /></button>
                    <button type="button" onClick={cancelTitleEdit} className="theme-muted rounded p-1 hover:text-rose-600" aria-label="Cancel rename" title="Cancel"><X size={14} /></button>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className="theme-text truncate text-xs font-medium">{artworkName}</h3>
                    <button type="button" onClick={startTitleEdit} className="theme-muted rounded p-1 transition hover:text-indigo-600" aria-label="Rename artwork" title="Rename artwork"><Pencil size={12} /></button>
                  </div>
                )}
              </div>
              <div className="theme-muted flex shrink-0 items-center gap-2 text-[10px]">
                <span className="hidden sm:inline">{CANVAS_WIDTH} × {CANVAS_HEIGHT}</span>
                {hasArtwork && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Edited</span>}
              </div>
            </div>

            <div className="canvas-workspace flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border p-2 sm:p-3">
              <Canvas
                ref={canvasRef}
                tool={tool}
                color={color}
                brushSize={brushSize}
                textSize={textSize}
                initialArtwork={initialArtwork}
                onContentChange={handleContentChange}
                onHistoryChange={handleHistoryChange}
                onColorPick={setColor}
                onTextRequest={handleTextRequest}
                onReady={handleReady}
              />
            </div>
          </section>
      </div>

      {textDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTextDialog(null) }}>
          <form onSubmit={handleTextSubmit} className="theme-panel w-full max-w-md rounded-2xl border p-5 shadow-2xl shadow-slate-950/20 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="text-dialog-title">
            <h2 id="text-dialog-title" className="theme-text text-base font-semibold tracking-tight">Add text</h2>
            <p className="theme-muted mt-1 text-xs">Text will be placed where you clicked on the canvas.</p>
            <textarea
              autoFocus
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setTextDialog(null) }}
              rows={4}
              maxLength={1000}
              placeholder="Type your text…"
              aria-label="Text to add to the canvas"
              className="theme-text mt-4 w-full resize-y rounded-lg border border-[var(--app-border)] bg-[var(--panel-subtle)] px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
            <div className="theme-muted mt-2 flex items-center justify-between text-[11px]">
              <span>{textSize}px · {color}</span>
              <span>{textDraft.length}/1000</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTextDialog(null)} className="theme-muted h-9 rounded-lg px-3 text-sm font-medium transition hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={!textDraft.trim()} className="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Add to canvas</button>
            </div>
          </form>
        </div>
      )}

      {clearDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearDialogOpen(false) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description" className="theme-panel w-full max-w-sm rounded-2xl border p-6 shadow-2xl shadow-slate-950/20">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 size={18} /></div>
              <button type="button" onClick={() => setClearDialogOpen(false)} aria-label="Close dialog" className="clear-dialog-close rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={17} /></button>
            </div>
            <h2 id="clear-title" className="theme-text text-lg font-bold tracking-tight">Clear this canvas?</h2>
            <p id="clear-description" className="theme-muted mt-2 text-sm leading-relaxed">This will remove your artwork and its saved copy from this device. You can’t undo this action.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setClearDialogOpen(false)} className="theme-muted h-10 rounded-xl px-4 text-sm font-semibold transition hover:bg-slate-100">Cancel</button>
              <button type="button" autoFocus onClick={handleClear} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2">Clear canvas</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

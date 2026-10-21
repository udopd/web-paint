import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_HISTORY } from '../constants.js'
import { drawShape, floodFill, sampleColor } from '../lib/canvas.js'

const Canvas = forwardRef(function Canvas({
  tool,
  color,
  brushSize,
  textSize,
  initialArtwork,
  onContentChange,
  onHistoryChange,
  onColorPick,
  onTextRequest,
  onReady,
}, ref) {
  const canvasRef = useRef(null)
  const previewRef = useRef(null)
  const brushCursorRef = useRef(null)
  const hoverEventRef = useRef(null)
  const contextRef = useRef(null)
  const previewContextRef = useRef(null)
  const pixelRatioRef = useRef(1)
  const configRef = useRef({ tool, color, brushSize, textSize })
  const historyRef = useRef({ entries: [], index: -1 })
  const pointerRef = useRef({ active: false, tool: null, start: null, last: null })
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  configRef.current = { tool, color, brushSize, textSize }

  const notifyHistory = () => {
    const { entries, index } = historyRef.current
    onHistoryChange?.({ canUndo: index > 0, canRedo: index < entries.length - 1 })
  }

  const takeSnapshot = () => {
    const canvas = canvasRef.current
    const ctx = contextRef.current
    if (!canvas || !ctx) return

    const { entries, index } = historyRef.current
    const nextEntries = entries.slice(0, index + 1)
    nextEntries.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (nextEntries.length > MAX_HISTORY) nextEntries.shift()
    historyRef.current = { entries: nextEntries, index: nextEntries.length - 1 }
    notifyHistory()
    onContentChange?.()
  }

  const resetHistory = () => {
    const canvas = canvasRef.current
    const ctx = contextRef.current
    if (!canvas || !ctx) return
    historyRef.current = {
      entries: [ctx.getImageData(0, 0, canvas.width, canvas.height)],
      index: 0,
    }
    notifyHistory()
    onContentChange?.()
  }

  const clearPreview = () => {
    const preview = previewRef.current
    const ctx = previewContextRef.current
    if (preview && ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const preview = previewRef.current
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    pixelRatioRef.current = ratio

    for (const layer of [canvas, preview]) {
      layer.width = Math.round(CANVAS_WIDTH * ratio)
      layer.height = Math.round(CANVAS_HEIGHT * ratio)
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const previewCtx = preview.getContext('2d')
    ctx.scale(ratio, ratio)
    previewCtx.scale(ratio, ratio)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    contextRef.current = ctx
    previewContextRef.current = previewCtx

    const finishInit = (restored) => {
      historyRef.current = {
        entries: [ctx.getImageData(0, 0, canvas.width, canvas.height)],
        index: 0,
      }
      notifyHistory()
      onReady?.({ restored })
    }

    if (initialArtwork) {
      const image = new Image()
      image.onload = () => {
        ctx.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        finishInit(true)
      }
      image.onerror = () => finishInit(false)
      image.src = initialArtwork
    } else {
      finishInit(false)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    undo() {
      const history = historyRef.current
      if (history.index <= 0) return
      history.index -= 1
      contextRef.current.putImageData(history.entries[history.index], 0, 0)
      clearPreview()
      notifyHistory()
      onContentChange?.()
    },
    redo() {
      const history = historyRef.current
      if (history.index >= history.entries.length - 1) return
      history.index += 1
      contextRef.current.putImageData(history.entries[history.index], 0, 0)
      clearPreview()
      notifyHistory()
      onContentChange?.()
    },
    clear() {
      const ctx = contextRef.current
      if (!ctx) return
      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.restore()
      clearPreview()
      resetHistory()
    },
    getDataUrl() {
      return canvasRef.current?.toDataURL('image/png') ?? null
    },
    addText({ text, x, y, color: textColor, fontSize }) {
      const ctx = contextRef.current
      const lines = String(text).split(/\r?\n/)
      if (!ctx || lines.every((line) => !line.trim())) return

      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = textColor
      ctx.textBaseline = 'top'
      ctx.font = `${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`

      const lineHeight = fontSize * 1.2
      const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width))
      const textX = Math.max(0, Math.min(x, CANVAS_WIDTH - Math.min(widestLine, CANVAS_WIDTH)))
      const textY = Math.max(0, Math.min(y, CANVAS_HEIGHT - Math.min(lines.length * lineHeight, CANVAS_HEIGHT)))
      const maxWidth = Math.max(1, CANVAS_WIDTH - textX)
      lines.forEach((line, index) => {
        if (line) ctx.fillText(line, textX, textY + index * lineHeight, maxWidth)
      })

      ctx.restore()
      takeSnapshot()
    },
  }), [])

  const pointFromEvent = (event) => {
    const bounds = previewRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT,
    }
  }

  const hideBrushCursor = () => {
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none'
  }

  const syncBrushCursor = (event) => {
    hoverEventRef.current = {
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    const cursor = brushCursorRef.current
    const surface = previewRef.current
    if (!cursor || !surface || pointerRef.current.tool === 'pan' || event.pointerType === 'touch' || (tool !== 'brush' && tool !== 'eraser')) {
      hideBrushCursor()
      return
    }

    const bounds = surface.getBoundingClientRect()
    if (!bounds.width) return
    const localScale = viewport.scale
    const diameter = Math.max(1, brushSize * (bounds.width / localScale / CANVAS_WIDTH))
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.left = `${(event.clientX - bounds.left) / localScale}px`
    cursor.style.top = `${(event.clientY - bounds.top) / localScale}px`
    cursor.style.display = 'block'
  }

  useEffect(() => {
    if (hoverEventRef.current) syncBrushCursor(hoverEventRef.current)
    else hideBrushCursor()
  }, [tool, brushSize, viewport.scale])

  const eventPoints = (event) => {
    const nativeEvent = event.nativeEvent
    const coalesced = nativeEvent.getCoalescedEvents?.()
    return (coalesced?.length ? coalesced : [nativeEvent]).map(pointFromEvent)
  }

  const handlePointerDown = (event) => {
    syncBrushCursor(event)
    if (historyRef.current.entries.length === 0) return
    if (event.button !== 0 && event.pointerType !== 'touch') return
    event.preventDefault()

    if (event.ctrlKey && event.button === 0 && event.pointerType !== 'touch') {
      hideBrushCursor()
      pointerRef.current = {
        active: true,
        tool: 'pan',
        start: null,
        last: { x: event.clientX, y: event.clientY },
      }
      setIsPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    const point = pointFromEvent(event)
    const { tool: activeTool, color: activeColor, brushSize: activeSize } = configRef.current
    const ctx = contextRef.current

    if (activeTool === 'picker') {
      onColorPick?.(sampleColor(ctx, point.x * pixelRatioRef.current, point.y * pixelRatioRef.current))
      return
    }

    if (activeTool === 'fill') {
      if (floodFill(ctx, point.x * pixelRatioRef.current, point.y * pixelRatioRef.current, activeColor)) {
        takeSnapshot()
      }
      return
    }

    if (activeTool === 'text') {
      onTextRequest?.({ ...point, color: activeColor, fontSize: configRef.current.textSize })
      return
    }

    pointerRef.current = { active: true, tool: activeTool, start: point, last: point }
    event.currentTarget.setPointerCapture(event.pointerId)

    if (activeTool === 'brush' || activeTool === 'eraser') {
      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = activeTool === 'eraser' ? '#ffffff' : activeColor
      ctx.fillStyle = activeTool === 'eraser' ? '#ffffff' : activeColor
      ctx.lineWidth = activeSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.arc(point.x, point.y, activeSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
    }
  }

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current
    if (pointer.active && pointer.tool === 'pan') {
      event.preventDefault()
      const deltaX = event.clientX - pointer.last.x
      const deltaY = event.clientY - pointer.last.y
      pointer.last = { x: event.clientX, y: event.clientY }
      setViewport((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }))
      return
    }

    syncBrushCursor(event)
    if (!pointer.active && event.ctrlKey && event.pointerType !== 'touch') {
      event.currentTarget.style.cursor = 'grab'
    } else if (!pointer.active) {
      event.currentTarget.style.cursor = ''
    }
    if (!pointer.active) return
    event.preventDefault()
    const points = eventPoints(event)

    if (pointer.tool === 'brush' || pointer.tool === 'eraser') {
      const ctx = contextRef.current
      for (const point of points) {
        ctx.lineTo(point.x, point.y)
        ctx.stroke()
      }
      pointer.last = points.at(-1)
      return
    }

    const point = points.at(-1)
    const previewCtx = previewContextRef.current
    clearPreview()
    drawShape(previewCtx, pointer.tool, pointer.start, point, configRef.current.color, configRef.current.brushSize)
    pointer.last = point
  }

  const finishPointer = (event, cancelled = false) => {
    const pointer = pointerRef.current
    if (!pointer.active) {
      syncBrushCursor(event)
      return
    }
    pointerRef.current.active = false

    if (pointer.tool === 'pan') {
      setIsPanning(false)
      event.currentTarget.style.cursor = ''
      return
    }

    if (pointer.tool !== 'brush' && pointer.tool !== 'eraser') {
      clearPreview()
      if (!cancelled) {
        pointer.last = pointFromEvent(event)
        drawShape(
          contextRef.current,
          pointer.tool,
          pointer.start,
          pointer.last ?? pointFromEvent(event),
          configRef.current.color,
          configRef.current.brushSize,
        )
      }
    } else {
      const finalPoint = pointFromEvent(event)
      if (!cancelled && pointer.last && (Math.abs(finalPoint.x - pointer.last.x) > 0.1 || Math.abs(finalPoint.y - pointer.last.y) > 0.1)) {
        contextRef.current.lineTo(finalPoint.x, finalPoint.y)
        contextRef.current.stroke()
      }
      contextRef.current.closePath()
      contextRef.current.restore()
    }

    if (!cancelled || pointer.tool === 'brush' || pointer.tool === 'eraser') takeSnapshot()
    syncBrushCursor(event)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const anchorX = event.clientX - (bounds.left + bounds.width / 2)
    const anchorY = event.clientY - (bounds.top + bounds.height / 2)
    const zoomFactor = Math.exp(-event.deltaY * 0.0015)

    setViewport((current) => {
      const scale = Math.max(0.25, Math.min(4, current.scale * zoomFactor))
      const ratio = scale / current.scale
      return {
        scale,
        x: current.x + anchorX * (1 - ratio),
        y: current.y + anchorY * (1 - ratio),
      }
    })
  }

  return (
    <div
      className="canvas-frame relative mx-auto overflow-hidden rounded-[2px] bg-white shadow-[0_18px_48px_rgba(24,32,55,0.14),0_2px_6px_rgba(24,32,55,0.08)] ring-1 ring-black/[0.04]"
      style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Your drawing canvas"
      />
      <canvas
        ref={previewRef}
        className={`absolute inset-0 h-full w-full touch-none ${isPanning ? 'cursor-grabbing' : tool === 'brush' || tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'}`}
        aria-label="Drawing surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onWheel={handleWheel}
        onPointerLeave={() => {
          if (!pointerRef.current.active) {
            hoverEventRef.current = null
            hideBrushCursor()
          }
        }}
      />
      <div ref={brushCursorRef} className="brush-size-cursor" aria-hidden="true" />
    </div>
  )
})

export default Canvas

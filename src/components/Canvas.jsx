import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_HISTORY } from '../constants.js'
import { drawShape, floodFill, sampleColor } from '../lib/canvas.js'

function imageFromUrl(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Saved layer could not be loaded'))
    image.src = source
  })
}

const Canvas = forwardRef(function Canvas({
  tool,
  color,
  brushSize,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
  transparent = false,
  initialArtwork,
  initialProject,
  onContentChange,
  onHistoryChange,
  onLayersChange,
  onColorPick,
  onPastePreviewChange,
  onReady,
}, ref) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const previewRef = useRef(null)
  const brushCursorRef = useRef(null)
  const hoverEventRef = useRef(null)
  const compositeContextRef = useRef(null)
  const previewContextRef = useRef(null)
  const pixelRatioRef = useRef(1)
  const dimensionsRef = useRef({ width, height, transparent })
  const appliedSettingsRef = useRef(null)
  const configRef = useRef({ tool, color, brushSize })
  const layersRef = useRef([])
  const activeLayerIdRef = useRef(null)
  const nextLayerIdRef = useRef(1)
  const initializedRef = useRef(false)
  const pointerRef = useRef({ active: false, tool: null, start: null, last: null })
  const lastCanvasPointRef = useRef(null)
  const pendingImageRef = useRef(null)
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [frameWidth, setFrameWidth] = useState(0)

  configRef.current = { tool, color, brushSize }

  const activeLayer = () => layersRef.current.find((layer) => layer.id === activeLayerIdRef.current)

  const notifyHistory = () => {
    const history = activeLayer()?.history
    onHistoryChange?.({
      canUndo: Boolean(history && history.index > 0),
      canRedo: Boolean(history && history.index < history.entries.length - 1),
    })
  }

  const notifyLayers = () => {
    onLayersChange?.({
      layers: layersRef.current.map(({ id, name, visible }) => ({ id, name, visible })),
      activeLayerId: activeLayerIdRef.current,
    })
  }

  const makeLayer = (name, id, visible = true) => {
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    const ratio = pixelRatioRef.current
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(canvasWidth * ratio)
    canvas.height = Math.round(canvasHeight * ratio)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    return { id, name, visible, canvas, ctx, history: { entries: [], index: -1 } }
  }

  const setupDisplayCanvases = () => {
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    const ratio = pixelRatioRef.current
    const displayCanvas = canvasRef.current
    const previewCanvas = previewRef.current
    if (!displayCanvas || !previewCanvas) return

    for (const surface of [displayCanvas, previewCanvas]) {
      surface.width = Math.round(canvasWidth * ratio)
      surface.height = Math.round(canvasHeight * ratio)
    }

    const displayContext = displayCanvas.getContext('2d', { willReadFrequently: true })
    const previewContext = previewCanvas.getContext('2d')
    displayContext.scale(ratio, ratio)
    previewContext.scale(ratio, ratio)
    compositeContextRef.current = displayContext
    previewContextRef.current = previewContext
  }

  const drawComposite = () => {
    const ctx = compositeContextRef.current
    if (!ctx) return
    const { width: canvasWidth, height: canvasHeight, transparent: hasTransparency } = dimensionsRef.current
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    if (!hasTransparency) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    }
    for (const layer of layersRef.current) {
      if (layer.visible) ctx.drawImage(layer.canvas, 0, 0, layer.canvas.width, layer.canvas.height, 0, 0, canvasWidth, canvasHeight)
    }
  }

  const clearPreview = () => {
    const ctx = previewContextRef.current
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    if (ctx) ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  }

  const resetLayerHistory = (layer) => {
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    layer.history = {
      entries: [layer.ctx.getImageData(0, 0, Math.round(canvasWidth * pixelRatioRef.current), Math.round(canvasHeight * pixelRatioRef.current))],
      index: 0,
    }
  }

  const pushLayerSnapshot = (layer) => {
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    const history = layer.history
    const entries = history.entries.slice(0, history.index + 1)
    entries.push(layer.ctx.getImageData(0, 0, Math.round(canvasWidth * pixelRatioRef.current), Math.round(canvasHeight * pixelRatioRef.current)))
    if (entries.length > MAX_HISTORY) entries.shift()
    layer.history = { entries, index: entries.length - 1 }
  }

  const takeSnapshot = (layer = activeLayer()) => {
    if (!layer) return
    pushLayerSnapshot(layer)
    drawComposite()
    notifyHistory()
    onContentChange?.()
  }

  const clearPendingImage = (notify = true) => {
    const pending = pendingImageRef.current
    if (!pending) return
    pendingImageRef.current = null
    clearPreview()
    pending.image.close?.()
    if (notify) onPastePreviewChange?.(false)
  }

  const drawPendingImage = () => {
    const pending = pendingImageRef.current
    const ctx = previewContextRef.current
    if (!pending || !ctx) return
    clearPreview()
    ctx.save()
    ctx.globalAlpha = 0.86
    ctx.drawImage(pending.image, pending.x, pending.y, pending.width, pending.height)
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#4f46e5'
    ctx.lineWidth = 1.5
    ctx.setLineDash([7, 5])
    ctx.strokeRect(pending.x, pending.y, pending.width, pending.height)
    ctx.restore()
  }

  const movePendingImage = (point) => {
    const pending = pendingImageRef.current
    if (!pending) return
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    pending.x = Math.max(0, Math.min(point.x - pending.width / 2, canvasWidth - pending.width))
    pending.y = Math.max(0, Math.min(point.y - pending.height / 2, canvasHeight - pending.height))
    drawPendingImage()
  }

  const emitProjectChange = () => {
    drawComposite()
    notifyLayers()
    notifyHistory()
    onContentChange?.()
  }

  const resizeLayers = (oldWidth, oldHeight) => {
    layersRef.current = layersRef.current.map((layer) => {
      const previousCanvas = layer.canvas
      const resized = makeLayer(layer.name, layer.id, layer.visible)
      resized.ctx.drawImage(previousCanvas, 0, 0, previousCanvas.width, previousCanvas.height, 0, 0, oldWidth, oldHeight)
      resetLayerHistory(resized)
      return resized
    })
    setupDisplayCanvases()
  }

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      dimensionsRef.current = { width, height, transparent }
      pixelRatioRef.current = Math.min(window.devicePixelRatio || 1, 2)
      setupDisplayCanvases()

      const savedLayers = Array.isArray(initialProject?.layers) ? initialProject.layers : []
      const usedIds = new Set()
      const layers = savedLayers.length
        ? savedLayers.map((saved, index) => {
          let id = typeof saved.id === 'string' && saved.id ? saved.id : `layer-${index + 1}`
          while (usedIds.has(id)) id = `layer-${index + 1}-${usedIds.size + 1}`
          usedIds.add(id)
          return makeLayer(
            typeof saved.name === 'string' ? saved.name : `Layer ${index + 1}`,
            id,
            saved.visible !== false,
          )
        })
        : [makeLayer('Layer 1', 'layer-1')]

      try {
        if (savedLayers.length) {
          await Promise.all(savedLayers.map(async (saved, index) => {
            if (typeof saved.dataUrl !== 'string') return
            const image = await imageFromUrl(saved.dataUrl)
            if (!cancelled) layers[index].ctx.drawImage(image, 0, 0, width, height)
          }))
        } else if (initialArtwork) {
          const image = await imageFromUrl(initialArtwork)
          if (!cancelled) layers[0].ctx.drawImage(image, 0, 0, width, height)
        }
      } catch {
        if (!cancelled) onReady?.({ restored: false, error: true })
        return
      }

      if (cancelled) return
      layers.forEach(resetLayerHistory)
      layersRef.current = layers
      const savedActiveId = initialProject?.activeLayerId
      activeLayerIdRef.current = layers.some((layer) => layer.id === savedActiveId)
        ? savedActiveId
        : layers.at(-1).id
      nextLayerIdRef.current = layers.reduce((nextId, layer) => {
        const numericId = Number(layer.id.match(/^layer-(\d+)$/)?.[1] ?? 0)
        return Math.max(nextId, numericId + 1)
      }, 1)
      appliedSettingsRef.current = { width, height, transparent }
      initializedRef.current = true
      drawComposite()
      notifyLayers()
      notifyHistory()
      onReady?.({ restored: Boolean(savedLayers.length || initialArtwork) })
    }

    if (!initializedRef.current) void initialize()
    else {
      const previous = appliedSettingsRef.current ?? dimensionsRef.current
      const sizeChanged = previous.width !== width || previous.height !== height
      const settingsChanged = sizeChanged || previous.transparent !== transparent
      dimensionsRef.current = { width, height, transparent }
      appliedSettingsRef.current = { width, height, transparent }
      if (sizeChanged) {
        resizeLayers(previous.width, previous.height)
        layersRef.current.forEach(resetLayerHistory)
      }
      if (settingsChanged) {
        clearPendingImage()
        drawComposite()
        notifyLayers()
        notifyHistory()
        onContentChange?.()
      }
    }

    return () => { cancelled = true }
  }, [width, height, transparent])

  useEffect(() => () => {
    clearPendingImage(false)
  }, [])

  useImperativeHandle(ref, () => ({
    undo() {
      if (pendingImageRef.current) {
        clearPendingImage()
        return
      }
      const layer = activeLayer()
      if (!layer || layer.history.index <= 0) return
      layer.history.index -= 1
      layer.ctx.putImageData(layer.history.entries[layer.history.index], 0, 0)
      drawComposite()
      notifyHistory()
      onContentChange?.()
    },
    redo() {
      if (pendingImageRef.current) {
        clearPendingImage()
        return
      }
      const layer = activeLayer()
      if (!layer || layer.history.index >= layer.history.entries.length - 1) return
      layer.history.index += 1
      layer.ctx.putImageData(layer.history.entries[layer.history.index], 0, 0)
      drawComposite()
      notifyHistory()
      onContentChange?.()
    },
    clear() {
      clearPendingImage()
      const firstLayer = makeLayer('Layer 1', 'layer-1')
      resetLayerHistory(firstLayer)
      layersRef.current = [firstLayer]
      activeLayerIdRef.current = firstLayer.id
      nextLayerIdRef.current = 2
      emitProjectChange()
    },
    getDataUrl() {
      drawComposite()
      return canvasRef.current?.toDataURL('image/png') ?? null
    },
    getProject() {
      const { width: canvasWidth, height: canvasHeight, transparent: hasTransparency } = dimensionsRef.current
      return {
        width: canvasWidth,
        height: canvasHeight,
        transparent: hasTransparency,
        activeLayerId: activeLayerIdRef.current,
        layers: layersRef.current.map((layer) => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          dataUrl: layer.canvas.toDataURL('image/png'),
        })),
      }
    },
    stageImage(image) {
      if (pendingImageRef.current) clearPendingImage()
      const sourceWidth = image?.width ?? image?.naturalWidth
      const sourceHeight = image?.height ?? image?.naturalHeight
      const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
      if (!activeLayer() || !sourceWidth || !sourceHeight) return
      const fitScale = Math.min(1, (canvasWidth * 0.8) / sourceWidth, (canvasHeight * 0.8) / sourceHeight)
      const drawWidth = sourceWidth * fitScale
      const drawHeight = sourceHeight * fitScale
      const point = lastCanvasPointRef.current ?? { x: canvasWidth / 2, y: canvasHeight / 2 }
      pendingImageRef.current = {
        image,
        width: drawWidth,
        height: drawHeight,
        x: Math.max(0, Math.min(point.x - drawWidth / 2, canvasWidth - drawWidth)),
        y: Math.max(0, Math.min(point.y - drawHeight / 2, canvasHeight - drawHeight)),
      }
      drawPendingImage()
      onPastePreviewChange?.(true)
    },
    cancelPendingImage() {
      clearPendingImage()
    },
    addLayer() {
      if (layersRef.current.length >= 24) return
      let id = `layer-${nextLayerIdRef.current++}`
      while (layersRef.current.some((layer) => layer.id === id)) id = `layer-${nextLayerIdRef.current++}`
      const layer = makeLayer(`Layer ${layersRef.current.length + 1}`, id)
      resetLayerHistory(layer)
      layersRef.current = [...layersRef.current, layer]
      activeLayerIdRef.current = id
      emitProjectChange()
    },
    selectLayer(id) {
      if (!layersRef.current.some((layer) => layer.id === id) || activeLayerIdRef.current === id) return
      activeLayerIdRef.current = id
      notifyLayers()
      notifyHistory()
      onContentChange?.()
    },
    renameLayer(id, name) {
      const normalized = name.trim().slice(0, 48)
      if (!normalized) return
      const layer = layersRef.current.find((item) => item.id === id)
      if (!layer || layer.name === normalized) return
      layer.name = normalized
      emitProjectChange()
    },
    toggleLayer(id) {
      const layer = layersRef.current.find((item) => item.id === id)
      if (!layer) return
      layer.visible = !layer.visible
      emitProjectChange()
    },
    deleteLayer(id) {
      if (layersRef.current.length <= 1) return
      const index = layersRef.current.findIndex((layer) => layer.id === id)
      if (index < 0) return
      layersRef.current.splice(index, 1)
      if (activeLayerIdRef.current === id) activeLayerIdRef.current = layersRef.current[Math.max(0, index - 1)].id
      emitProjectChange()
    },
    moveLayer(id, targetId) {
      const visualOrder = [...layersRef.current].reverse()
      const sourceIndex = visualOrder.findIndex((layer) => layer.id === id)
      const targetIndex = visualOrder.findIndex((layer) => layer.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
      const [movedLayer] = visualOrder.splice(sourceIndex, 1)
      visualOrder.splice(targetIndex, 0, movedLayer)
      const uniqueLayers = [...new Map(visualOrder.map((layer) => [layer.id, layer])).values()]
      layersRef.current = uniqueLayers.reverse()
      emitProjectChange()
    },
  }), [])

  const pointFromEvent = (event) => {
    const bounds = previewRef.current.getBoundingClientRect()
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvasWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * canvasHeight,
    }
  }

  const hideBrushCursor = () => {
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none'
  }

  const syncBrushCursor = (event) => {
    hoverEventRef.current = { pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY }
    const cursor = brushCursorRef.current
    const surface = previewRef.current
    if (!cursor || !surface || pendingImageRef.current || pointerRef.current.tool === 'pan' || event.pointerType === 'touch' || (tool !== 'brush' && tool !== 'eraser')) {
      hideBrushCursor()
      return
    }
    const bounds = surface.getBoundingClientRect()
    if (!bounds.width) return
    const localScale = viewport.scale
    const { width: canvasWidth } = dimensionsRef.current
    const diameter = Math.max(1, brushSize * (bounds.width / localScale / canvasWidth))
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.left = `${(event.clientX - bounds.left) / localScale}px`
    cursor.style.top = `${(event.clientY - bounds.top) / localScale}px`
    cursor.style.display = 'block'
  }

  useEffect(() => {
    if (hoverEventRef.current) syncBrushCursor(hoverEventRef.current)
    else hideBrushCursor()
  }, [tool, brushSize, viewport.scale, width, height])

  useEffect(() => {
    const frame = frameRef.current
    const workspace = frame?.parentElement
    if (!workspace) return undefined

    const updateFrameSize = () => {
      const rect = workspace.getBoundingClientRect()
      const style = window.getComputedStyle(workspace)
      const horizontalSpace = rect.width
        - Number.parseFloat(style.paddingLeft || '0')
        - Number.parseFloat(style.paddingRight || '0')
        - Number.parseFloat(style.borderLeftWidth || '0')
        - Number.parseFloat(style.borderRightWidth || '0')
      const verticalSpace = rect.height
        - Number.parseFloat(style.paddingTop || '0')
        - Number.parseFloat(style.paddingBottom || '0')
        - Number.parseFloat(style.borderTopWidth || '0')
        - Number.parseFloat(style.borderBottomWidth || '0')
      const fittedWidth = Math.max(0, Math.min(horizontalSpace, 1200, verticalSpace * (width / height)))
      setFrameWidth((current) => Math.abs(current - fittedWidth) < 1 ? current : fittedWidth)
    }

    updateFrameSize()
    const observer = new ResizeObserver(updateFrameSize)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [width, height])

  const eventPoints = (event) => {
    const nativeEvent = event.nativeEvent
    const coalesced = nativeEvent.getCoalescedEvents?.()
    return (coalesced?.length ? coalesced : [nativeEvent]).map(pointFromEvent)
  }

  const handlePointerDown = (event) => {
    syncBrushCursor(event)
    if (!activeLayer()) return
    if (event.button === 1 && event.pointerType !== 'touch') {
      event.preventDefault()
      hideBrushCursor()
      pointerRef.current = { active: true, tool: 'pan', start: null, last: { x: event.clientX, y: event.clientY } }
      setIsPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0 && event.pointerType !== 'touch') return
    event.preventDefault()

    const point = pointFromEvent(event)
    lastCanvasPointRef.current = point
    if (pendingImageRef.current) {
      movePendingImage(point)
      const pending = pendingImageRef.current
      const layer = activeLayer()
      layer.ctx.save()
      layer.ctx.globalCompositeOperation = 'source-over'
      layer.ctx.drawImage(pending.image, pending.x, pending.y, pending.width, pending.height)
      layer.ctx.restore()
      clearPendingImage()
      takeSnapshot(layer)
      return
    }

    const { tool: activeTool, color: activeColor, brushSize: activeSize } = configRef.current
    const layer = activeLayer()
    const composite = compositeContextRef.current
    const ratio = pixelRatioRef.current
    if (activeTool === 'picker') {
      onColorPick?.(sampleColor(composite, point.x * ratio, point.y * ratio))
      return
    }
    if (activeTool === 'fill') {
      if (floodFill(layer.ctx, point.x * ratio, point.y * ratio, activeColor)) takeSnapshot(layer)
      return
    }
    pointerRef.current = { active: true, tool: activeTool, start: point, last: point }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (activeTool === 'brush' || activeTool === 'eraser') {
      layer.ctx.save()
      layer.ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
      layer.ctx.strokeStyle = activeColor
      layer.ctx.fillStyle = activeColor
      layer.ctx.lineWidth = activeSize
      layer.ctx.lineCap = 'round'
      layer.ctx.lineJoin = 'round'
      layer.ctx.beginPath()
      layer.ctx.arc(point.x, point.y, activeSize / 2, 0, Math.PI * 2)
      layer.ctx.fill()
      layer.ctx.beginPath()
      layer.ctx.moveTo(point.x, point.y)
      drawComposite()
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
    const point = pointFromEvent(event)
    lastCanvasPointRef.current = point
    if (pendingImageRef.current) {
      movePendingImage(point)
      return
    }
    if (!pointer.active) return
    event.preventDefault()
    const points = eventPoints(event)
    const layer = activeLayer()
    if (pointer.tool === 'brush' || pointer.tool === 'eraser') {
      for (const nextPoint of points) {
        layer.ctx.lineTo(nextPoint.x, nextPoint.y)
        layer.ctx.stroke()
      }
      pointer.last = points.at(-1)
      drawComposite()
      return
    }
    const end = points.at(-1)
    clearPreview()
    drawShape(previewContextRef.current, pointer.tool, pointer.start, end, configRef.current.color, configRef.current.brushSize)
    pointer.last = end
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

    const layer = activeLayer()
    if (pointer.tool !== 'brush' && pointer.tool !== 'eraser') {
      clearPreview()
      if (!cancelled) {
        pointer.last = pointFromEvent(event)
        drawShape(layer.ctx, pointer.tool, pointer.start, pointer.last, configRef.current.color, configRef.current.brushSize)
      }
    } else {
      if (!cancelled) {
        const finalPoint = pointFromEvent(event)
        if (pointer.last && (Math.abs(finalPoint.x - pointer.last.x) > 0.1 || Math.abs(finalPoint.y - pointer.last.y) > 0.1)) {
          layer.ctx.lineTo(finalPoint.x, finalPoint.y)
          layer.ctx.stroke()
        }
      }
      layer.ctx.closePath()
      layer.ctx.restore()
    }
    if (!cancelled || pointer.tool === 'brush' || pointer.tool === 'eraser') takeSnapshot(layer)
    else drawComposite()
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
      return { scale, x: current.x + anchorX * (1 - ratio), y: current.y + anchorY * (1 - ratio) }
    })
  }

  const aspect = width / height
  return (
    <div
      ref={frameRef}
      className={`canvas-frame relative mx-auto overflow-hidden rounded-[2px] ${transparent ? 'transparent-canvas' : 'bg-white'} shadow-[0_18px_48px_rgba(24,32,55,0.14),0_2px_6px_rgba(24,32,55,0.08)] ring-1 ring-black/[0.04]`}
      style={{ '--canvas-aspect': `${width} / ${height}`, width: frameWidth ? `${frameWidth}px` : '100%', transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Your drawing canvas" />
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
          if (!pointerRef.current.active && !pendingImageRef.current) {
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

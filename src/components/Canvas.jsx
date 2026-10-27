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
  fillMode = 'solid',
  gradientColor = '#ffffff',
  gradientDirection = 'horizontal',
  textSize = 32,
  textFont = 'Arial',
  textBold = false,
  textItalic = false,
  textAlign = 'left',
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
  const textInputRef = useRef(null)
  const hoverEventRef = useRef(null)
  const compositeContextRef = useRef(null)
  const previewContextRef = useRef(null)
  const pixelRatioRef = useRef(1)
  const dimensionsRef = useRef({ width, height, transparent })
  const appliedSettingsRef = useRef(null)
  const configRef = useRef({ tool, color, brushSize, fillMode, gradientColor, gradientDirection, textSize, textFont, textBold, textItalic, textAlign })
  const layersRef = useRef([])
  const activeLayerIdRef = useRef(null)
  const nextLayerIdRef = useRef(1)
  const initializedRef = useRef(false)
  const pointerRef = useRef({ active: false, tool: null, start: null, last: null })
  const selectionRef = useRef(null)
  const touchPointsRef = useRef(new Map())
  const touchGestureRef = useRef(null)
  const lastCanvasPointRef = useRef(null)
  const pendingImageRef = useRef(null)
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [frameWidth, setFrameWidth] = useState(0)
  const [textEdit, setTextEdit] = useState(null)

  configRef.current = { tool, color, brushSize, fillMode, gradientColor, gradientDirection, textSize, textFont, textBold, textItalic, textAlign }

  useEffect(() => {
    if (textEdit) textInputRef.current?.focus()
  }, [textEdit])

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

  const normalizeSelection = (start, end) => {
    const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
    const left = Math.max(0, Math.min(canvasWidth, Math.min(start.x, end.x)))
    const top = Math.max(0, Math.min(canvasHeight, Math.min(start.y, end.y)))
    const right = Math.max(left, Math.min(canvasWidth, Math.max(start.x, end.x)))
    const bottom = Math.max(top, Math.min(canvasHeight, Math.max(start.y, end.y)))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  const drawSelectionOutline = (ctx, selection) => {
    if (!selection || selection.width <= 0 || selection.height <= 0) return
    ctx.save()
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width, selection.height)
    ctx.lineDashOffset = 4
    ctx.strokeStyle = '#111111'
    ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width, selection.height)
    const handleSize = 8
    const halfHandle = handleSize / 2
    const handlePoints = [
      [selection.x, selection.y], [selection.x + selection.width / 2, selection.y], [selection.x + selection.width, selection.y],
      [selection.x + selection.width, selection.y + selection.height / 2], [selection.x + selection.width, selection.y + selection.height],
      [selection.x + selection.width / 2, selection.y + selection.height], [selection.x, selection.y + selection.height],
      [selection.x, selection.y + selection.height / 2],
    ]
    ctx.setLineDash([])
    for (const [x, y] of handlePoints) {
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#111111'
      ctx.fillRect(x - halfHandle, y - halfHandle, handleSize, handleSize)
      ctx.strokeRect(x - halfHandle, y - halfHandle, handleSize, handleSize)
    }
    ctx.restore()
  }

  const getSelectionHandle = (point, selection) => {
    if (!selection) return null
    const bounds = frameRef.current?.getBoundingClientRect()
    const { width: canvasWidth } = dimensionsRef.current
    const tolerance = Math.max(7, 10 * canvasWidth / (bounds?.width || canvasWidth))
    const handles = [
      ['nw', selection.x, selection.y], ['n', selection.x + selection.width / 2, selection.y], ['ne', selection.x + selection.width, selection.y],
      ['e', selection.x + selection.width, selection.y + selection.height / 2], ['se', selection.x + selection.width, selection.y + selection.height],
      ['s', selection.x + selection.width / 2, selection.y + selection.height], ['sw', selection.x, selection.y + selection.height],
      ['w', selection.x, selection.y + selection.height / 2],
    ]
    return handles.find(([, x, y]) => Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance)?.[0] ?? null
  }

  const getSelectionCursor = (handle) => {
    if (!handle) return 'move'
    if (handle === 'n' || handle === 's') return 'ns-resize'
    if (handle === 'e' || handle === 'w') return 'ew-resize'
    if (handle === 'nw' || handle === 'se') return 'nwse-resize'
    return 'nesw-resize'
  }

  const resizeSelection = (origin, handle, delta, canvasWidth, canvasHeight) => {
    const minimumSize = 4
    let left = origin.x
    let top = origin.y
    let right = origin.x + origin.width
    let bottom = origin.y + origin.height
    if (handle.includes('w')) left = Math.max(0, Math.min(right - minimumSize, origin.x + delta.x))
    if (handle.includes('e')) right = Math.min(canvasWidth, Math.max(left + minimumSize, origin.x + origin.width + delta.x))
    if (handle.includes('n')) top = Math.max(0, Math.min(bottom - minimumSize, origin.y + delta.y))
    if (handle.includes('s')) bottom = Math.min(canvasHeight, Math.max(top + minimumSize, origin.y + origin.height + delta.y))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  const drawSelectionPreview = (pointer = pointerRef.current) => {
    const ctx = previewContextRef.current
    if (!ctx) return
    clearPreview()
    if (pointer.active && pointer.tool === 'selection' && pointer.mode === 'marquee') {
      drawSelectionOutline(ctx, normalizeSelection(pointer.start, pointer.last))
      return
    }
    if (pointer.active && pointer.tool === 'selection' && (pointer.mode === 'move' || pointer.mode === 'resize')) {
      ctx.drawImage(pointer.selectionCanvas, selectionRef.current.x, selectionRef.current.y, selectionRef.current.width, selectionRef.current.height)
      drawSelectionOutline(ctx, selectionRef.current)
      return
    }
    if (selectionRef.current) drawSelectionOutline(ctx, selectionRef.current)
  }

  const restoreMovedSelection = (pointer, layer) => {
    if (!pointer.selectionCanvas || !layer) return
    const origin = pointer.selectionOrigin
    layer.ctx.drawImage(pointer.selectionCanvas, origin.x, origin.y, origin.width, origin.height)
    selectionRef.current = { x: origin.x, y: origin.y, width: origin.width, height: origin.height }
    drawComposite()
  }

  const emitProjectChange = () => {
    drawComposite()
    notifyLayers()
    notifyHistory()
    onContentChange?.()
  }

  const resizeLayers = (oldWidth, oldHeight) => {
    selectionRef.current = null
    clearPreview()
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
      selectionRef.current = null
      clearPreview()
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
      selectionRef.current = null
      clearPreview()
      drawComposite()
      notifyHistory()
      onContentChange?.()
    },
    clear() {
      clearPendingImage()
      selectionRef.current = null
      clearPreview()
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
      selectionRef.current = null
      clearPreview()
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
      if (activeLayerIdRef.current === id) {
        selectionRef.current = null
        clearPreview()
      }
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
    if (tool === 'selection' || pointerRef.current.active || !selectionRef.current) return
    selectionRef.current = null
    if (pendingImageRef.current) drawPendingImage()
    else clearPreview()
  }, [tool])

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

  const extendSmoothedStroke = (ctx, previous, points) => {
    let last = previous
    for (const next of points) {
      const midpoint = { x: (last.x + next.x) / 2, y: (last.y + next.y) / 2 }
      ctx.quadraticCurveTo(last.x, last.y, midpoint.x, midpoint.y)
      last = next
    }
    return last
  }

  const cancelDrawingForTouchGesture = () => {
    const pointer = pointerRef.current
    if (!pointer.active || pointer.tool === 'pan') return
    const layer = activeLayer()
    if (pointer.tool === 'selection' && (pointer.mode === 'move' || pointer.mode === 'resize')) {
      restoreMovedSelection(pointer, layer)
      clearPreview()
    } else if (pointer.tool === 'selection') {
      clearPreview()
    } else if (layer && (pointer.tool === 'brush' || pointer.tool === 'eraser')) {
      layer.ctx.closePath()
      layer.ctx.restore()
      const previous = layer.history.entries[layer.history.index]
      if (previous) layer.ctx.putImageData(previous, 0, 0)
      drawComposite()
    } else {
      clearPreview()
    }
    pointerRef.current = { active: false, tool: null, start: null, last: null }
  }

  const commitText = () => {
    if (!textEdit?.value.trim()) {
      setTextEdit(null)
      return
    }
    const layer = layersRef.current.find((item) => item.id === textEdit.layerId)
    if (!layer) {
      setTextEdit(null)
      return
    }
    const { width: canvasWidth } = dimensionsRef.current
    const { textSize: fontSize, textFont: fontFamily, textBold: bold, textItalic: italic, textAlign: alignment, color: fillColor } = configRef.current
    const maxWidth = Math.max(1, canvasWidth - textEdit.x)
    const lineHeight = fontSize * 1.25
    layer.ctx.save()
    layer.ctx.globalCompositeOperation = 'source-over'
    layer.ctx.fillStyle = fillColor
    layer.ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px "${fontFamily}"`
    layer.ctx.textBaseline = 'top'
    layer.ctx.textAlign = alignment
    const lines = []
    for (const paragraph of textEdit.value.split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean)
      if (!words.length) {
        lines.push('')
        continue
      }
      let line = words[0]
      for (const word of words.slice(1)) {
        const next = `${line} ${word}`
        if (layer.ctx.measureText(next).width > maxWidth && line) {
          lines.push(line)
          line = word
        } else {
          line = next
        }
      }
      lines.push(line)
    }
    const anchorX = alignment === 'left' ? textEdit.x : alignment === 'center' ? textEdit.x + maxWidth / 2 : textEdit.x + maxWidth
    lines.forEach((line, index) => layer.ctx.fillText(line, anchorX, textEdit.y + index * lineHeight, maxWidth))
    layer.ctx.restore()
    setTextEdit(null)
    takeSnapshot(layer)
  }

  const updateTouchGesture = () => {
    const gesture = touchGestureRef.current
    if (!gesture || touchPointsRef.current.size < 2) return
    const points = [...touchPointsRef.current.values()].slice(0, 2)
    const midpoint = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    }
    const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
    const scale = Math.max(0.25, Math.min(4, gesture.startViewport.scale * distance / gesture.startDistance))
    const ratio = scale / gesture.startViewport.scale
    const anchorX = gesture.startMidpoint.x - gesture.startFrameCenter.x
    const anchorY = gesture.startMidpoint.y - gesture.startFrameCenter.y
    setViewport({
      scale,
      x: gesture.startViewport.x + anchorX * (1 - ratio) + midpoint.x - gesture.startMidpoint.x,
      y: gesture.startViewport.y + anchorY * (1 - ratio) + midpoint.y - gesture.startMidpoint.y,
    })
  }

  const handlePointerDown = (event) => {
    const pointer = pointerRef.current
    if (event.pointerType === 'touch') {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPointsRef.current.size >= 2) {
        event.preventDefault()
        cancelDrawingForTouchGesture()
        if (!touchGestureRef.current) {
          const points = [...touchPointsRef.current.values()].slice(0, 2)
          touchGestureRef.current = {
            startMidpoint: {
              x: (points[0].x + points[1].x) / 2,
              y: (points[0].y + points[1].y) / 2,
            },
            startDistance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
            startViewport: viewport,
            startFrameCenter: (() => {
              const bounds = frameRef.current?.getBoundingClientRect()
              return { x: bounds ? bounds.left + bounds.width / 2 : 0, y: bounds ? bounds.top + bounds.height / 2 : 0 }
            })(),
          }
        }
        setIsPanning(true)
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
    }
    if (textEdit) return
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
    if (!pointer.active && !pendingImageRef.current && tool === 'selection' && selectionRef.current) {
      const selected = selectionRef.current
      const handle = getSelectionHandle(point, selected)
      const inside = point.x >= selected.x && point.x <= selected.x + selected.width && point.y >= selected.y && point.y <= selected.y + selected.height
      event.currentTarget.style.cursor = handle ? getSelectionCursor(handle) : inside ? 'move' : 'crosshair'
    }
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
    if (activeTool === 'text') {
      setTextEdit({ layerId: activeLayerIdRef.current, x: Math.max(0, Math.min(width - 1, point.x)), y: Math.max(0, Math.min(height - 1, point.y)), value: '' })
      return
    }
    if (activeTool === 'selection') {
      const currentSelection = selectionRef.current
      const pointInside = currentSelection
        && point.x >= currentSelection.x
        && point.x <= currentSelection.x + currentSelection.width
        && point.y >= currentSelection.y
        && point.y <= currentSelection.y + currentSelection.height
      if (pointInside) {
        const origin = { ...currentSelection }
        const handle = getSelectionHandle(point, origin)
        const imageData = layer.ctx.getImageData(
          Math.round(origin.x * ratio),
          Math.round(origin.y * ratio),
          Math.max(1, Math.round(origin.width * ratio)),
          Math.max(1, Math.round(origin.height * ratio)),
        )
        const selectionCanvas = document.createElement('canvas')
        selectionCanvas.width = imageData.width
        selectionCanvas.height = imageData.height
        selectionCanvas.getContext('2d').putImageData(imageData, 0, 0)
        layer.ctx.clearRect(origin.x, origin.y, origin.width, origin.height)
        selectionRef.current = { ...origin }
        pointerRef.current = {
          active: true,
          tool: activeTool,
          mode: handle ? 'resize' : 'move',
          selectionHandle: handle,
          start: point,
          last: point,
          selectionOrigin: origin,
          selectionCanvas,
          moved: false,
        }
        drawComposite()
        drawSelectionPreview()
      } else {
        pointerRef.current = { active: true, tool: activeTool, mode: 'marquee', start: point, last: point }
        drawSelectionPreview()
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (activeTool === 'picker') {
      onColorPick?.(sampleColor(composite, point.x * ratio, point.y * ratio))
      return
    }
    if (activeTool === 'fill') {
      const gradient = configRef.current.fillMode === 'gradient'
        ? { color: configRef.current.gradientColor, direction: configRef.current.gradientDirection }
        : null
      if (floodFill(layer.ctx, point.x * ratio, point.y * ratio, activeColor, 18, gradient)) takeSnapshot(layer)
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
    if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchGestureRef.current) {
        event.preventDefault()
        updateTouchGesture()
        return
      }
    }
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
    if (pointer.tool === 'selection') {
      const end = points.at(-1)
      if (pointer.mode === 'marquee') {
        pointer.last = end
      } else if (pointer.mode === 'move' || pointer.mode === 'resize') {
        const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
        const selection = selectionRef.current
        if (pointer.mode === 'move') {
          const nextX = Math.max(0, Math.min(pointer.selectionOrigin.x + end.x - pointer.start.x, canvasWidth - selection.width))
          const nextY = Math.max(0, Math.min(pointer.selectionOrigin.y + end.y - pointer.start.y, canvasHeight - selection.height))
          pointer.moved = pointer.moved || Math.abs(nextX - pointer.selectionOrigin.x) > 0.5 || Math.abs(nextY - pointer.selectionOrigin.y) > 0.5
          selectionRef.current = { ...selection, x: nextX, y: nextY }
        } else {
          const resized = resizeSelection(pointer.selectionOrigin, pointer.selectionHandle, { x: end.x - pointer.start.x, y: end.y - pointer.start.y }, canvasWidth, canvasHeight)
          pointer.moved = pointer.moved || Math.abs(resized.width - pointer.selectionOrigin.width) > 0.5 || Math.abs(resized.height - pointer.selectionOrigin.height) > 0.5 || Math.abs(resized.x - pointer.selectionOrigin.x) > 0.5 || Math.abs(resized.y - pointer.selectionOrigin.y) > 0.5
          selectionRef.current = resized
        }
      }
      drawSelectionPreview(pointer)
      return
    }
    const layer = activeLayer()
    if (pointer.tool === 'brush' || pointer.tool === 'eraser') {
      pointer.last = extendSmoothedStroke(layer.ctx, pointer.last, points)
      layer.ctx.stroke()
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

    if (pointer.tool === 'selection') {
      const layer = activeLayer()
      if (pointer.mode === 'marquee') {
        pointer.last = pointFromEvent(event)
        const selection = normalizeSelection(pointer.start, pointer.last)
        selectionRef.current = selection.width > 2 && selection.height > 2 ? selection : null
      } else if (pointer.mode === 'move' || pointer.mode === 'resize') {
        const finalPoint = pointFromEvent(event)
        const { width: canvasWidth, height: canvasHeight } = dimensionsRef.current
        const currentSelection = selectionRef.current
        if (pointer.mode === 'move') {
          const nextX = Math.max(0, Math.min(pointer.selectionOrigin.x + finalPoint.x - pointer.start.x, canvasWidth - currentSelection.width))
          const nextY = Math.max(0, Math.min(pointer.selectionOrigin.y + finalPoint.y - pointer.start.y, canvasHeight - currentSelection.height))
          pointer.moved = pointer.moved || Math.abs(nextX - pointer.selectionOrigin.x) > 0.5 || Math.abs(nextY - pointer.selectionOrigin.y) > 0.5
          selectionRef.current = { ...currentSelection, x: nextX, y: nextY }
        } else {
          const resized = resizeSelection(pointer.selectionOrigin, pointer.selectionHandle, { x: finalPoint.x - pointer.start.x, y: finalPoint.y - pointer.start.y }, canvasWidth, canvasHeight)
          pointer.moved = pointer.moved || Math.abs(resized.width - pointer.selectionOrigin.width) > 0.5 || Math.abs(resized.height - pointer.selectionOrigin.height) > 0.5 || Math.abs(resized.x - pointer.selectionOrigin.x) > 0.5 || Math.abs(resized.y - pointer.selectionOrigin.y) > 0.5
          selectionRef.current = resized
        }
        if (cancelled || !pointer.moved) {
          restoreMovedSelection(pointer, layer)
        } else {
          layer.ctx.drawImage(pointer.selectionCanvas, selectionRef.current.x, selectionRef.current.y, selectionRef.current.width, selectionRef.current.height)
          takeSnapshot(layer)
        }
      }
      drawSelectionPreview()
      syncBrushCursor(event)
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
          layer.ctx.quadraticCurveTo(pointer.last.x, pointer.last.y, finalPoint.x, finalPoint.y)
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

  const handlePointerEnd = (event, cancelled = false) => {
    if (event.pointerType === 'touch') {
      touchPointsRef.current.delete(event.pointerId)
      if (touchGestureRef.current) {
        if (touchPointsRef.current.size < 2) {
          touchGestureRef.current = null
          pointerRef.current = { active: false, tool: null, start: null, last: null }
          setIsPanning(false)
        } else {
          updateTouchGesture()
        }
        return
      }
    }
    finishPointer(event, cancelled)
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
        className={`absolute inset-0 h-full w-full touch-none ${isPanning ? 'cursor-grabbing' : tool === 'brush' || tool === 'eraser' ? 'cursor-none' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
        aria-label="Drawing surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => handlePointerEnd(event)}
        onPointerCancel={(event) => handlePointerEnd(event, true)}
        onWheel={handleWheel}
        onPointerLeave={() => {
          if (!pointerRef.current.active && !pendingImageRef.current) {
            hoverEventRef.current = null
            hideBrushCursor()
          }
        }}
      />
      <div ref={brushCursorRef} className="brush-size-cursor" aria-hidden="true" />
      {textEdit && <div
        className="canvas-text-editor absolute z-20 flex flex-col gap-1.5 border p-1.5 shadow-lg"
        style={{ left: `${(textEdit.x / width) * 100}%`, top: `${(textEdit.y / height) * 100}%`, width: `${Math.max(80, Math.min(280, frameWidth ? ((width - textEdit.x) / width) * frameWidth : 280))}px` }}
      >
        <textarea
          ref={textInputRef}
          value={textEdit.value}
          onChange={(event) => setTextEdit((current) => ({ ...current, value: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); setTextEdit(null) }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitText() }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="Type here…"
          aria-label="Canvas text"
          rows={2}
          className="canvas-text-editor-input w-full resize-y bg-transparent outline-none"
          style={{ color, fontFamily: textFont, fontSize: `${textSize}px`, fontWeight: textBold ? 700 : 400, fontStyle: textItalic ? 'italic' : 'normal', textAlign: textAlign }}
        />
        <div className="flex justify-end gap-1 border-t pt-1">
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setTextEdit(null)} className="canvas-text-editor-button">Cancel</button>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={commitText} className="canvas-text-editor-button canvas-text-editor-add">Add text</button>
        </div>
      </div>}
    </div>
  )
})

export default Canvas

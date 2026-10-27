export function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

export function drawShape(ctx, tool, start, end, color, size) {
  const width = end.x - start.x
  const height = end.y - start.y

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()

  if (tool === 'rectangle') {
    ctx.rect(start.x, start.y, width, height)
  } else if (tool === 'ellipse') {
    ctx.ellipse(
      start.x + width / 2,
      start.y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2,
    )
  } else if (tool === 'line') {
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
  }

  ctx.stroke()
  ctx.restore()
}

export function floodFill(ctx, x, y, hexColor, tolerance = 18, gradient = null) {
  const { canvas } = ctx
  const startX = Math.floor(x)
  const startY = Math.floor(y)

  if (startX < 0 || startY < 0 || startX >= canvas.width || startY >= canvas.height) {
    return false
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = image
  const start = (startY * width + startX) * 4
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]]
  const replacement = hexToRgb(hexColor)
  const replacementColor = [replacement.r, replacement.g, replacement.b, 255]

  if (!gradient && target.every((channel, index) => channel === replacementColor[index])) return false

  const matches = (pixel) => (
    Math.abs(data[pixel] - target[0]) <= tolerance
    && Math.abs(data[pixel + 1] - target[1]) <= tolerance
    && Math.abs(data[pixel + 2] - target[2]) <= tolerance
    && Math.abs(data[pixel + 3] - target[3]) <= tolerance
  )

  const totalPixels = width * height
  const stack = new Int32Array(totalPixels)
  const visited = new Uint8Array(totalPixels)
  let stackLength = 0
  let minX = startX
  let maxX = startX
  let minY = startY
  let maxY = startY
  const startIndex = startY * width + startX
  stack[stackLength++] = startIndex
  visited[startIndex] = 1
  const enqueueIfMatching = (index) => {
    if (index < 0 || visited[index] || !matches(index * 4)) return
    visited[index] = 1
    stack[stackLength++] = index
  }

  while (stackLength > 0) {
    const index = stack[--stackLength]
    const pixelX = index % width
    const pixelY = Math.floor(index / width)
    minX = Math.min(minX, pixelX)
    maxX = Math.max(maxX, pixelX)
    minY = Math.min(minY, pixelY)
    maxY = Math.max(maxY, pixelY)

    if (pixelX > 0) enqueueIfMatching(index - 1)
    if (pixelX + 1 < width) enqueueIfMatching(index + 1)
    if (pixelY > 0) enqueueIfMatching(index - width)
    if (pixelY + 1 < height) enqueueIfMatching(index + width)
  }

  const gradientEnd = gradient ? hexToRgb(gradient.color) : null
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  // Re-scan the visited mask so gradient colors use the bounds of the whole connected area.
  for (let index = 0; index < totalPixels; index += 1) {
    if (!visited[index]) continue
    const pixel = index * 4
    if (!gradient) {
      data[pixel] = replacementColor[0]
      data[pixel + 1] = replacementColor[1]
      data[pixel + 2] = replacementColor[2]
      data[pixel + 3] = replacementColor[3]
      continue
    }
    const pixelX = index % width
    const pixelY = Math.floor(index / width)
    const horizontal = (pixelX - minX) / spanX
    const vertical = (pixelY - minY) / spanY
    const amount = gradient.direction === 'vertical' ? vertical : gradient.direction === 'diagonal' ? (horizontal + vertical) / 2 : horizontal
    data[pixel] = Math.round(replacement.r + (gradientEnd.r - replacement.r) * amount)
    data[pixel + 1] = Math.round(replacement.g + (gradientEnd.g - replacement.g) * amount)
    data[pixel + 2] = Math.round(replacement.b + (gradientEnd.b - replacement.b) * amount)
    data[pixel + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return true
}

export function sampleColor(ctx, x, y) {
  const { canvas } = ctx
  const pixelX = Math.min(canvas.width - 1, Math.max(0, Math.floor(x)))
  const pixelY = Math.min(canvas.height - 1, Math.max(0, Math.floor(y)))
  const [r, g, b] = ctx.getImageData(pixelX, pixelY, 1, 1).data

  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

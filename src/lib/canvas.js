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

export function floodFill(ctx, x, y, hexColor, tolerance = 18) {
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

  if (target.every((channel, index) => channel === replacementColor[index])) return false

  const matches = (pixel) => (
    !(data[pixel] === replacementColor[0]
      && data[pixel + 1] === replacementColor[1]
      && data[pixel + 2] === replacementColor[2]
      && data[pixel + 3] === replacementColor[3])
    &&
    Math.abs(data[pixel] - target[0]) <= tolerance
    && Math.abs(data[pixel + 1] - target[1]) <= tolerance
    && Math.abs(data[pixel + 2] - target[2]) <= tolerance
    && Math.abs(data[pixel + 3] - target[3]) <= tolerance
  )

  const stack = new Int32Array(width * height)
  let stackLength = 0
  stack[stackLength++] = startY * width + startX

  while (stackLength > 0) {
    const seed = stack[--stackLength]
    const seedX = seed % width
    const row = Math.floor(seed / width)
    let left = seedX
    let pixel = (row * width + left) * 4

    while (left > 0 && matches(pixel - 4)) {
      left -= 1
      pixel -= 4
    }

    let spanAbove = false
    let spanBelow = false

    for (let currentX = left; currentX < width; currentX += 1) {
      pixel = (row * width + currentX) * 4
      if (!matches(pixel)) break

      data[pixel] = replacementColor[0]
      data[pixel + 1] = replacementColor[1]
      data[pixel + 2] = replacementColor[2]
      data[pixel + 3] = replacementColor[3]

      if (row > 0) {
        const above = pixel - width * 4
        if (matches(above)) {
          if (!spanAbove && stackLength < stack.length) {
            stack[stackLength++] = (row - 1) * width + currentX
          }
          spanAbove = true
        } else {
          spanAbove = false
        }
      }

      if (row < height - 1) {
        const below = pixel + width * 4
        if (matches(below)) {
          if (!spanBelow && stackLength < stack.length) {
            stack[stackLength++] = (row + 1) * width + currentX
          }
          spanBelow = true
        } else {
          spanBelow = false
        }
      }
    }
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

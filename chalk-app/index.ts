export * from './strokes'

export interface DrawGridOptions {
  spacing?: number
  strokeStyle?: string
  lineWidth?: number
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: DrawGridOptions = {},
): void {
  const {
    spacing = 10,
    strokeStyle = '#e5e7eb',
    lineWidth = 1,
  } = options
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth

  ctx.beginPath()
  for (let x = 0.5; x < width; x += spacing) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = 0.5; y < height; y += spacing) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()
}

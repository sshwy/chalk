<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { drawGrid, StrokeManager, type Point } from '../chalk-app/index'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const lastPoint = ref<Point | null>(null)
const strokeManager = new StrokeManager()

const resizeAndDraw = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  // 根据屏幕的像素密度，把 canvas 的「绘图分辨率」调高，避免画出来的网格模糊。
  // - `rect.width` / `rect.height` 是 canvas 在页面中以 **CSS 像素** 计算的宽高（比如 800×600）。
  // - `dpr = window.devicePixelRatio || 1` 是设备像素比（Retina 屏上通常是 2 或更高）。
  // - `canvas.width = rect.width * dpr`、`canvas.height = rect.height * dpr` 是在设置 canvas 
  //   的 **内部像素宽高**，让它的绘图缓冲区尺寸变成「CSS 大小 × 像素比」，例如 800×600 的区域在 dpr=2
  //   时实际有 1600×1200 个像素可用，从而绘制的线条更加清晰。
  // - 随后配合 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，让你在后续绘图时仍然可以按「CSS 像素」
  //   坐标来写代码，但实际会以更高分辨率渲染。
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawGrid(ctx, rect.width, rect.height, { spacing: 20 })
  redrawStrokes(ctx)
}

const redrawStrokes = (ctx: CanvasRenderingContext2D) => {
  const strokes = strokeManager.getStrokes()
  if (!strokes.length) return

  ctx.save()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  for (const stroke of strokes) {
    const points = stroke.points
    if (!points || points.length < 2) continue

    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

const getCanvasPoint = (event: MouseEvent): Point | null => {
  const canvas = canvasRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

const drawLineTo = (point: Point) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx || !lastPoint.value) return

  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(lastPoint.value.x, lastPoint.value.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()

  lastPoint.value = point
}

const handleMouseDown = (event: MouseEvent) => {
  const point = getCanvasPoint(event)
  if (!point) return

  isDrawing.value = true
  strokeManager.beginStroke(point)
  lastPoint.value = point
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDrawing.value) return
  const point = getCanvasPoint(event)
  if (!point) return

  strokeManager.appendPoint(point)
  drawLineTo(point)
}

const handleMouseUp = () => {
  isDrawing.value = false
  lastPoint.value = null
  strokeManager.endStroke()
}

onMounted(() => {
  resizeAndDraw()
  window.addEventListener('resize', resizeAndDraw)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAndDraw)
})
</script>

<template>
  <div class="min-h-screen w-screen">
    <canvas
      ref="canvasRef"
      class="w-screen h-screen block"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    ></canvas>
  </div>
</template>

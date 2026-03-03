<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Hand, Pencil, Undo2, Redo2 } from 'lucide-vue-next'
import { StrokeManager, type Point } from '../chalk-app/index'

type Tool = 'drag' | 'pen'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const lastPoint = ref<Point | null>(null)
const strokeManager = new StrokeManager()
const currentTool = ref<Tool>('pen')
const viewOffset = ref<Point>({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref<Point | null>(null)
const viewOffsetAtPanStart = ref<Point | null>(null)

const drawGridWithOffset = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spacing: number,
  offset: Point,
) => {
  const normalizedOffsetX = ((offset.x % spacing) + spacing) % spacing
  const normalizedOffsetY = ((offset.y % spacing) + spacing) % spacing

  ctx.save()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()

  // 从视口外一格开始，确保拖动后边缘仍被网格覆盖。
  for (let x = normalizedOffsetX - spacing + 0.5; x <= width + spacing; x += spacing) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = normalizedOffsetY - spacing + 0.5; y <= height + spacing; y += spacing) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }

  ctx.stroke()
  ctx.restore()
}

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

  // 先在设备坐标系下清空整个画布
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 再应用 DPR 缩放和视图偏移，让网格和笔画一起移动
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawGridWithOffset(ctx, rect.width, rect.height, 20, viewOffset.value)

  ctx.save()
  ctx.translate(viewOffset.value.x, viewOffset.value.y)
  redrawStrokes(ctx)
  ctx.restore()
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

const handleUndo = () => {
  strokeManager.undo()
  resizeAndDraw()
}

const handleRedo = () => {
  strokeManager.redo()
  resizeAndDraw()
}

const getCanvasPoint = (event: MouseEvent): Point | null => {
  const canvas = canvasRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  const offset = viewOffset.value
  return {
    x: event.clientX - rect.left - offset.x,
    y: event.clientY - rect.top - offset.y,
  }
}

const drawLineTo = (point: Point) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx || !lastPoint.value) return

  ctx.save()
  ctx.translate(viewOffset.value.x, viewOffset.value.y)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(lastPoint.value.x, lastPoint.value.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  ctx.restore()

  lastPoint.value = point
}

const handleMouseDown = (event: MouseEvent) => {
  if (currentTool.value === 'pen') {
    const point = getCanvasPoint(event)
    if (!point) return

    isDrawing.value = true
    strokeManager.beginStroke(point)
    lastPoint.value = point
  } else if (currentTool.value === 'drag') {
    const canvas = canvasRef.value
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const startX = event.clientX - rect.left
    const startY = event.clientY - rect.top

    isPanning.value = true
    panStart.value = { x: startX, y: startY }
    viewOffsetAtPanStart.value = { ...viewOffset.value }
  }
}

const handleMouseMove = (event: MouseEvent) => {
  if (currentTool.value === 'pen') {
    if (!isDrawing.value) return

    const point = getCanvasPoint(event)
    if (!point) return

    strokeManager.appendPoint(point)
    drawLineTo(point)
  } else if (currentTool.value === 'drag') {
    if (!isPanning.value) return

    const canvas = canvasRef.value
    if (!canvas || !panStart.value || !viewOffsetAtPanStart.value) return

    const rect = canvas.getBoundingClientRect()
    const currentX = event.clientX - rect.left
    const currentY = event.clientY - rect.top

    const dx = currentX - panStart.value.x
    const dy = currentY - panStart.value.y

    viewOffset.value = {
      x: viewOffsetAtPanStart.value.x + dx,
      y: viewOffsetAtPanStart.value.y + dy,
    }

    resizeAndDraw()
  }
}

const handleMouseUp = () => {
  if (isDrawing.value) {
    isDrawing.value = false
    lastPoint.value = null
    strokeManager.endStroke()
  }

  isPanning.value = false
  panStart.value = null
  viewOffsetAtPanStart.value = null
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
  <div class="relative min-h-screen w-screen">
    <canvas
      ref="canvasRef"
      class="w-screen h-screen block"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    ></canvas>

    <div class="pointer-events-none fixed top-4 inset-x-0 flex justify-center z-10">
      <div
        class="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-slate-900/70 backdrop-blur shadow-lg border border-white/40 px-3 py-2"
      >
        <button
          type="button"
          class="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          :class="currentTool === 'drag' ? 'bg-black/5 dark:bg-white/10 ring-2 ring-sky-500' : ''"
          @click="currentTool = 'drag'"
        >
          <Hand class="w-4 h-4" aria-label="Drag mode" />
        </button>

        <button
          type="button"
          class="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          :class="currentTool === 'pen' ? 'bg-black/5 dark:bg-white/10 ring-2 ring-sky-500' : ''"
          @click="currentTool = 'pen'"
        >
          <Pencil class="w-4 h-4" aria-label="Pen mode" />
        </button>

        <button
          type="button"
          class="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="handleUndo"
        >
          <Undo2 class="w-4 h-4" aria-label="Undo" />
        </button>

        <button
          type="button"
          class="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="handleRedo"
        >
          <Redo2 class="w-4 h-4" aria-label="Redo" />
        </button>
      </div>
    </div>
  </div>
</template>

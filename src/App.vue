<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue'
import { useColorMode } from '@vueuse/core'
import Toolbar from './components/Toolbar.vue'
import { DEFAULT_STROKE_WIDTH, StrokeManager, type Point, type Stroke } from '../chalk-app/index'

type Tool = 'drag' | 'pen' | 'brush'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const lastPoint = ref<Point | null>(null)
const strokeManager = new StrokeManager()
const currentTool = ref<Tool>('pen')
const penOnly = ref(false)
const viewOffset = ref<Point>({ x: 0, y: 0 })
const viewScale = ref(1)
const MIN_SCALE = 0.25
const MAX_SCALE = 4
const isPanning = ref(false)
const panStart = ref<Point | null>(null)
const viewOffsetAtPanStart = ref<Point | null>(null)

// 触屏双指手势：活跃 touch 触点（pointerId -> 画布内 CSS 坐标）
const activeTouchPoints = ref(new Map<number, Point>())
const isPinching = ref(false)
const pinchStartDistance = ref(0)
const pinchStartScale = ref(1)
const pinchStartCenter = ref<Point>({ x: 0, y: 0 })
const pinchStartOffset = ref<Point>({ x: 0, y: 0 })

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
function center(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// 画笔：线宽（世界坐标），固定档位 2,4,6,8,10
const penWidth = ref(DEFAULT_STROKE_WIDTH)

// 刷子：半径（CSS px）、是否正在刷、当前中心（世界坐标）、本笔待删轨迹索引
const brushRadius = ref(20)
const isBrushing = ref(false)
const brushCenter = ref<Point | null>(null)
const pendingDeleteIndexes = ref<Set<number>>(new Set())

/** 点到线段的最短距离（世界坐标） */
function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const q = { x: a.x + t * dx, y: a.y + t * dy }
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** 刷子圆（世界坐标）是否与轨迹相交：半径 = brushRadius / viewScale */
function strokeHitByBrush(stroke: Stroke, center: Point, worldRadius: number): boolean {
  const pts = stroke.points
  if (!pts || pts.length < 2) return false
  for (let i = 0; i < pts.length - 1; i++) {
    if (pointToSegmentDistance(center, pts[i]!, pts[i + 1]!) <= worldRadius) return true
  }
  return false
}

const colorMode = useColorMode({
  initialValue: 'light',
})
const isDark = computed(() => colorMode.value === 'dark')
const toolbarMode = computed<'light' | 'dark'>({
  get: () => (isDark.value ? 'dark' : 'light'),
  set: (value) => {
    colorMode.value = value
  },
})

watch(isDark, () => {
  resizeAndDraw()
})

const strokeColor = computed(() => (isDark.value ? '#f1f5f9' : '#0f172a'))

const scalePercent = computed(() => `${Math.round(viewScale.value * 100)}%`)

/** 世界坐标系下可见矩形（用于网格绘制） */
const getVisibleWorldRect = (
  width: number,
  height: number,
  offset: Point,
  scale: number,
) => {
  return {
    left: -offset.x / scale,
    top: -offset.y / scale,
    right: (width - offset.x) / scale,
    bottom: (height - offset.y) / scale,
  }
}

const GRID_SPACING = 20

const drawGridInWorld = (
  ctx: CanvasRenderingContext2D,
  worldRect: { left: number; top: number; right: number; bottom: number },
  spacing: number,
) => {
  const gridColor = isDark.value ? '#192747' : '#eee'

  ctx.save()
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1
  ctx.beginPath()

  const iMin = Math.floor(worldRect.left / spacing)
  const iMax = Math.ceil(worldRect.right / spacing)
  const jMin = Math.floor(worldRect.top / spacing)
  const jMax = Math.ceil(worldRect.bottom / spacing)

  for (let i = iMin; i <= iMax; i++) {
    const x = i * spacing + 0.5
    ctx.moveTo(x, worldRect.top)
    ctx.lineTo(x, worldRect.bottom)
  }
  for (let j = jMin; j <= jMax; j++) {
    const y = j * spacing + 0.5
    ctx.moveTo(worldRect.left, y)
    ctx.lineTo(worldRect.right, y)
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

  // 应用 DPR，再应用视图平移与缩放，使网格和笔画在同一世界坐标系下
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(viewOffset.value.x, viewOffset.value.y)
  ctx.scale(viewScale.value, viewScale.value)

  const worldRect = getVisibleWorldRect(
    rect.width,
    rect.height,
    viewOffset.value,
    viewScale.value,
  )
  drawGridInWorld(ctx, worldRect, GRID_SPACING)
  redrawStrokes(ctx)
  drawBrushCircle(ctx)
}

const pendingDeleteColor = computed(() => (isDark.value ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)'))

const redrawStrokes = (ctx: CanvasRenderingContext2D) => {
  const strokes = strokeManager.getStrokes()
  const pending = pendingDeleteIndexes.value

  ctx.save()
  ctx.lineCap = 'round'

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i]!
    const points = stroke.points
    if (!points || points.length < 2) continue
    ctx.lineWidth = stroke.width ?? DEFAULT_STROKE_WIDTH
    ctx.strokeStyle = pending.has(i) ? pendingDeleteColor.value : strokeColor.value
    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    for (let j = 1; j < points.length; j++) {
      const p = points[j]!
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

const drawBrushCircle = (ctx: CanvasRenderingContext2D) => {
  if (!isBrushing.value || !brushCenter.value) return
  const c = brushCenter.value
  const worldRadius = brushRadius.value / viewScale.value
  ctx.save()
  ctx.strokeStyle = isDark.value ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.4)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.arc(c.x, c.y, worldRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

const canUndo = ref(strokeManager.canUndo())
const canRedo = ref(strokeManager.canRedo())
const onHistoryChange = () => {
  canUndo.value = strokeManager.canUndo()
  canRedo.value = strokeManager.canRedo()
}
strokeManager.addEventListener('change', onHistoryChange)

const handleUndo = () => {
  strokeManager.undo()
  resizeAndDraw()
}

const handleRedo = () => {
  strokeManager.redo()
  resizeAndDraw()
}

const getCanvasPoint = (event: { clientX: number; clientY: number }): Point | null => {
  const canvas = canvasRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  const sx = event.clientX - rect.left
  const sy = event.clientY - rect.top
  const scale = viewScale.value
  return {
    x: (sx - viewOffset.value.x) / scale,
    y: (sy - viewOffset.value.y) / scale,
  }
}

const drawLineTo = (point: Point) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx || !lastPoint.value) return

  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(viewOffset.value.x, viewOffset.value.y)
  ctx.scale(viewScale.value, viewScale.value)
  ctx.strokeStyle = strokeColor.value
  ctx.lineWidth = penWidth.value
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(lastPoint.value.x, lastPoint.value.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  ctx.restore()

  lastPoint.value = point
}

const handlePointerDown = (event: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  const point: Point = { x: canvasX, y: canvasY }

  if (event.pointerType === 'touch') {
    activeTouchPoints.value.set(event.pointerId, point)
    if (activeTouchPoints.value.size >= 2) {
      const wasDrawing = isDrawing.value
      endPointerInteraction()
      if (wasDrawing) {
        strokeManager.undo()
        resizeAndDraw()
      }
      const pts = [...activeTouchPoints.value.values()]
      const [p1, p2] = pts
      if (p1 && p2) {
        const dist = distance(p1, p2)
        if (dist > 1e-6) {
          pinchStartDistance.value = dist
          pinchStartScale.value = viewScale.value
          pinchStartCenter.value = center(p1, p2)
          pinchStartOffset.value = { ...viewOffset.value }
          isPinching.value = true
        }
      }
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        event.preventDefault()
      }
      canvas.setPointerCapture(event.pointerId)
      return
    }
  }

  if (isDrawing.value || isPanning.value || isPinching.value) return

  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    event.preventDefault()
  }
  canvas.setPointerCapture(event.pointerId)

  if (currentTool.value === 'brush') {
    if (penOnly.value && event.pointerType !== 'pen') return
    const pt = getCanvasPoint(event)
    if (!pt) return
    isBrushing.value = true
    brushCenter.value = pt
    pendingDeleteIndexes.value = new Set()
    const worldRadius = brushRadius.value / viewScale.value
    const strokes = strokeManager.getStrokes()
    for (let i = 0; i < strokes.length; i++) {
      if (strokeHitByBrush(strokes[i]!, pt, worldRadius)) pendingDeleteIndexes.value.add(i)
    }
    resizeAndDraw()
    return
  }

  // 中键按住拖动：无论当前工具为何都进入平移
  if (event.button === 1) {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const startX = event.clientX - rect.left
    const startY = event.clientY - rect.top
    isPanning.value = true
    panStart.value = { x: startX, y: startY }
    viewOffsetAtPanStart.value = { ...viewOffset.value }
    return
  }

  if (currentTool.value === 'pen') {
    if (penOnly.value && event.pointerType !== 'pen') return
    const point = getCanvasPoint(event)
    if (!point) return

    isDrawing.value = true
    strokeManager.beginStroke(point, penWidth.value)
    lastPoint.value = point
  } else if (currentTool.value === 'drag') {
    const rect = canvas.getBoundingClientRect()
    const startX = event.clientX - rect.left
    const startY = event.clientY - rect.top

    isPanning.value = true
    panStart.value = { x: startX, y: startY }
    viewOffsetAtPanStart.value = { ...viewOffset.value }
  }
}

const handlePointerMove = (event: PointerEvent) => {
  if (isPinching.value && event.pointerType === 'touch') {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    activeTouchPoints.value.set(event.pointerId, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    const pts = [...activeTouchPoints.value.values()]
    if (pts.length !== 2 || !pts[0] || !pts[1]) return
    const newCenter = center(pts[0], pts[1])
    const newDistance = distance(pts[0], pts[1])
    if (pinchStartDistance.value < 1e-6) return
    const ratio = newDistance / pinchStartDistance.value
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, pinchStartScale.value * ratio),
    )
    const c0 = pinchStartCenter.value
    const o0 = pinchStartOffset.value
    viewScale.value = newScale
    viewOffset.value = {
      x: newCenter.x - (newScale / pinchStartScale.value) * (c0.x - o0.x),
      y: newCenter.y - (newScale / pinchStartScale.value) * (c0.y - o0.y),
    }
    resizeAndDraw()
    return
  }

  if (isPanning.value) {
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
    return
  }

  if (isBrushing.value) {
    const pt = getCanvasPoint(event)
    if (!pt) return
    brushCenter.value = pt
    const worldRadius = brushRadius.value / viewScale.value
    const strokes = strokeManager.getStrokes()
    for (let i = 0; i < strokes.length; i++) {
      if (strokeHitByBrush(strokes[i]!, pt, worldRadius)) pendingDeleteIndexes.value.add(i)
    }
    resizeAndDraw()
    return
  }

  if (currentTool.value === 'pen') {
    if (!isDrawing.value) return
    if (penOnly.value && event.pointerType !== 'pen') return

    const point = getCanvasPoint(event)
    if (!point) return

    strokeManager.appendPoint(point)
    drawLineTo(point)
  }
}

const endPointerInteraction = () => {
  if (isBrushing.value) {
    const indexes = [...pendingDeleteIndexes.value].sort((a, b) => b - a)
    if (indexes.length) strokeManager.removeStrokesByIndexes(indexes)
    isBrushing.value = false
    brushCenter.value = null
    pendingDeleteIndexes.value = new Set()
    resizeAndDraw()
  }

  if (isDrawing.value) {
    isDrawing.value = false
    lastPoint.value = null
    strokeManager.endStroke()
  }

  isPanning.value = false
  panStart.value = null
  viewOffsetAtPanStart.value = null
}

const handlePointerUp = (event: PointerEvent) => {
  if (activeTouchPoints.value.has(event.pointerId)) {
    activeTouchPoints.value.delete(event.pointerId)
    if (activeTouchPoints.value.size < 2) {
      isPinching.value = false
    }
    const canvas = canvasRef.value
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
    if (activeTouchPoints.value.size === 0) {
      endPointerInteraction()
    }
    return
  }
  const canvas = canvasRef.value
  if (canvas) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {
      // ignore if not captured
    }
  }
  endPointerInteraction()
}

const handlePointerCancel = (event: PointerEvent) => {
  if (activeTouchPoints.value.has(event.pointerId)) {
    activeTouchPoints.value.delete(event.pointerId)
    if (activeTouchPoints.value.size < 2) {
      isPinching.value = false
    }
    const canvas = canvasRef.value
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
    if (activeTouchPoints.value.size === 0) {
      endPointerInteraction()
    }
    return
  }
  const canvas = canvasRef.value
  if (canvas) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {
      // ignore if not captured
    }
  }
  endPointerInteraction()
}

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      handleUndo()
    } else if (key === 'y') {
      event.preventDefault()
      handleRedo()
    }
  }
}

const ZOOM_SENSITIVITY = 0.002

const handleWheel = (event: WheelEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return

  event.preventDefault()

  const rect = canvas.getBoundingClientRect()
  const sx = event.clientX - rect.left
  const sy = event.clientY - rect.top
  const scale = viewScale.value
  const newScale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, scale * (1 - event.deltaY * ZOOM_SENSITIVITY)),
  )
  if (newScale === scale) return

  const ratio = newScale / scale
  viewOffset.value = {
    x: sx - ratio * (sx - viewOffset.value.x),
    y: sy - ratio * (sy - viewOffset.value.y),
  }
  viewScale.value = newScale
  resizeAndDraw()
}

onMounted(() => {
  resizeAndDraw()
  window.addEventListener('resize', resizeAndDraw)
  window.addEventListener('keydown', handleKeydown)
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('wheel', handleWheel, { passive: false })
  }
})

onBeforeUnmount(() => {
  strokeManager.removeEventListener('change', onHistoryChange)
  window.removeEventListener('resize', resizeAndDraw)
  window.removeEventListener('keydown', handleKeydown)
  const canvas = canvasRef.value
  if (canvas) {
    canvas.removeEventListener('wheel', handleWheel)
  }
})
</script>

<template>
  <div class="relative min-h-screen w-screen">
    <canvas
      ref="canvasRef"
      class="w-screen h-screen block touch-none transition-colors"
      :class="isDark ? 'bg-slate-900' : 'bg-slate-50'"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
      @pointercancel="handlePointerCancel"
    ></canvas>

    <Toolbar
      v-model:tool="currentTool"
      v-model:mode="toolbarMode"
      v-model:pen-only="penOnly"
      v-model:brush-radius="brushRadius"
      v-model:pen-width="penWidth"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @undo="handleUndo"
      @redo="handleRedo"
    />

    <div
      class="pointer-events-none select-none fixed bottom-4 right-4 z-10 rounded-full px-3 py-1.5 text-sm tabular-nums backdrop-blur border"
      :class="
        isDark
          ? 'bg-slate-900/70 border-white/20 text-slate-200'
          : 'bg-white/70 border-slate-200/80 text-slate-700'
      "
    >
      {{ scalePercent }}
    </div>
  </div>
</template>

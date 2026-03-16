<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from "vue";
import { useColorMode, useLocalStorage } from "@vueuse/core";
import Toolbar from "./components/Toolbar.vue";
import {
  DEFAULT_STROKE_WIDTH,
  StrokeManager,
  type Point,
  distance,
  center,
  strokeHitByBrush,
  getVisibleWorldRect,
  screenToWorld,
  zoomAtPoint,
  drawGridInWorld,
  drawStrokes,
  drawBrushCircle,
  drawStrokeSegment,
} from "../chalk-app/index";

type Tool = "drag" | "pen" | "brush";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const lastPoint = ref<Point | null>(null);
const strokeManager = new StrokeManager();
const currentTool = ref<Tool>("pen");
const penOnly = useLocalStorage<boolean>("chalk:pen-only", false);
const viewOffset = ref<Point>({ x: 0, y: 0 });
const viewScale = ref(1);
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const isPanning = ref(false);
const panStart = ref<Point | null>(null);
const viewOffsetAtPanStart = ref<Point | null>(null);

// 触屏双指手势：活跃 touch 触点（pointerId -> 画布内 CSS 坐标）
const activeTouchPoints = ref(new Map<number, Point>());
const isPinching = ref(false);
const pinchStartDistance = ref(0);
const pinchStartScale = ref(1);
const pinchStartCenter = ref<Point>({ x: 0, y: 0 });
const pinchStartOffset = ref<Point>({ x: 0, y: 0 });

// 画笔：线宽（世界坐标），固定档位 2,4,6,8,10
const penWidth = ref(DEFAULT_STROKE_WIDTH);

// 刷子：半径（CSS px）、是否正在刷、当前中心（世界坐标）、本笔待删轨迹索引
const brushRadius = ref(20);
const isBrushing = ref(false);
const brushCenter = ref<Point | null>(null);
const pendingDeleteIndexes = ref<Set<number>>(new Set());

const colorMode = useColorMode({
  initialValue: "light",
});
const isDark = computed(() => colorMode.value === "dark");
const toolbarMode = computed<"light" | "dark">({
  get: () => (isDark.value ? "dark" : "light"),
  set: (value) => {
    colorMode.value = value;
  },
});

watch(isDark, () => {
  resizeAndDraw();
});

const themeColors = computed(() =>
  isDark.value
    ? {
        stroke: "#f1f5f9",
        pending: "rgba(148,163,184,0.6)",
        grid: "#192747",
        brush: "rgba(248,250,252,0.5)",
      }
    : {
        stroke: "#0f172a",
        pending: "rgba(100,116,139,0.6)",
        grid: "#eee",
        brush: "rgba(15,23,42,0.4)",
      },
);

const scalePercent = computed(() => `${Math.round(viewScale.value * 100)}%`);

const GRID_SPACING = 20;

const resizeAndDraw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // 根据屏幕的像素密度，把 canvas 的「绘图分辨率」调高，避免画出来的网格模糊。
  // - `rect.width` / `rect.height` 是 canvas 在页面中以 **CSS 像素** 计算的宽高（比如 800×600）。
  // - `dpr = window.devicePixelRatio || 1` 是设备像素比（Retina 屏上通常是 2 或更高）。
  // - `canvas.width = rect.width * dpr`、`canvas.height = rect.height * dpr` 是在设置 canvas
  //   的 **内部像素宽高**，让它的绘图缓冲区尺寸变成「CSS 大小 × 像素比」，例如 800×600 的区域在 dpr=2
  //   时实际有 1600×1200 个像素可用，从而绘制的线条更加清晰。
  // - 随后配合 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，让你在后续绘图时仍然可以按「CSS 像素」
  //   坐标来写代码，但实际会以更高分辨率渲染。
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 先在设备坐标系下清空整个画布
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 应用 DPR，再应用视图平移与缩放，使网格和笔画在同一世界坐标系下
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(viewOffset.value.x, viewOffset.value.y);
  ctx.scale(viewScale.value, viewScale.value);

  const worldRect = getVisibleWorldRect(rect.width, rect.height, viewOffset.value, viewScale.value);
  drawGridInWorld(ctx, worldRect, GRID_SPACING, themeColors.value.grid);
  drawStrokes(ctx, strokeManager.getStrokes(), {
    pendingIndexes: pendingDeleteIndexes.value,
    strokeColor: themeColors.value.stroke,
    pendingColor: themeColors.value.pending,
    defaultLineWidth: DEFAULT_STROKE_WIDTH,
  });
  if (isBrushing.value && brushCenter.value) {
    const worldRadius = brushRadius.value / viewScale.value;
    drawBrushCircle(ctx, brushCenter.value, worldRadius, themeColors.value.brush);
  }
};

const canUndo = ref(strokeManager.canUndo());
const canRedo = ref(strokeManager.canRedo());
const onHistoryChange = () => {
  canUndo.value = strokeManager.canUndo();
  canRedo.value = strokeManager.canRedo();
};
strokeManager.addEventListener("change", onHistoryChange);

const handleUndo = () => {
  strokeManager.update({ type: "undo" });
  resizeAndDraw();
};

const handleRedo = () => {
  strokeManager.update({ type: "redo" });
  resizeAndDraw();
};

const isInputAllowedForDrawing = (pointerType: PointerEvent["pointerType"]): boolean => {
  return !penOnly.value || pointerType === "pen";
};

const startPanning = (start: Point): void => {
  isPanning.value = true;
  panStart.value = { x: start.x, y: start.y };
  viewOffsetAtPanStart.value = { ...viewOffset.value };
};

const safeReleasePointerCapture = (pointerId: number): void => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    canvas.releasePointerCapture(pointerId);
  } catch {
    // ignore if not captured
  }
};

const getCanvasOffsetPoint = (
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
): Point => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const getCanvasPoint = (event: { clientX: number; clientY: number }): Point | null => {
  const canvas = canvasRef.value;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  return screenToWorld(event.clientX, event.clientY, rect, viewOffset.value, viewScale.value);
};

const drawLineTo = (point: Point) => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx || !lastPoint.value) return;

  const dpr = window.devicePixelRatio || 1;
  drawStrokeSegment(ctx, lastPoint.value, point, {
    strokeColor: themeColors.value.stroke,
    lineWidth: penWidth.value,
    dpr,
    offset: viewOffset.value,
    scale: viewScale.value,
  });

  lastPoint.value = point;
};

const markBrushHitsAt = (centerPoint: Point): void => {
  const worldRadius = brushRadius.value / viewScale.value;
  const strokes = strokeManager.getStrokes();
  for (let i = 0; i < strokes.length; i++) {
    if (strokeHitByBrush(strokes[i]!, centerPoint, worldRadius)) pendingDeleteIndexes.value.add(i);
  }
};

const startBrushing = (point: Point): void => {
  isBrushing.value = true;
  brushCenter.value = point;
  pendingDeleteIndexes.value = new Set();
  markBrushHitsAt(point);
  resizeAndDraw();
};

const startDrawing = (point: Point): void => {
  isDrawing.value = true;
  strokeManager.update({
    type: "beginStroke",
    startPoint: point,
    width: penWidth.value,
  });
  lastPoint.value = point;
};

const beginPinchFromTouchPoints = (): void => {
  const pts = [...activeTouchPoints.value.values()];
  const [p1, p2] = pts;
  if (!p1 || !p2) return;
  const dist = distance(p1, p2);
  if (dist <= 1e-6) return;
  pinchStartDistance.value = dist;
  pinchStartScale.value = viewScale.value;
  pinchStartCenter.value = center(p1, p2);
  pinchStartOffset.value = { ...viewOffset.value };
  isPinching.value = true;
};

const handleTouchPointerDown = (
  event: PointerEvent,
  point: Point,
  canvas: HTMLCanvasElement,
): boolean => {
  if (event.pointerType !== "touch") return false;
  activeTouchPoints.value.set(event.pointerId, point);
  if (activeTouchPoints.value.size < 2) return false;

  const wasDrawing = isDrawing.value;
  endPointerInteraction();
  if (wasDrawing) {
    strokeManager.update({ type: "undo" });
    resizeAndDraw();
  }
  beginPinchFromTouchPoints();
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  return true;
};

const handleBrushPointerDown = (event: PointerEvent): boolean => {
  if (currentTool.value !== "brush") return false;
  if (!isInputAllowedForDrawing(event.pointerType)) return true;
  const pt = getCanvasPoint(event);
  if (!pt) return true;
  startBrushing(pt);
  return true;
};

const handlePenPointerDown = (event: PointerEvent): boolean => {
  if (currentTool.value !== "pen") return false;
  if (!isInputAllowedForDrawing(event.pointerType)) return true;
  const point = getCanvasPoint(event);
  if (!point) return true;
  startDrawing(point);
  return true;
};

const handlePinchMove = (event: PointerEvent): boolean => {
  if (!(isPinching.value && event.pointerType === "touch")) return false;
  const canvas = canvasRef.value;
  if (!canvas) return true;

  const p = getCanvasOffsetPoint(canvas, event);
  activeTouchPoints.value.set(event.pointerId, p);
  const pts = [...activeTouchPoints.value.values()];
  if (pts.length !== 2 || !pts[0] || !pts[1]) return true;
  const newCenter = center(pts[0], pts[1]);
  const newDistance = distance(pts[0], pts[1]);
  if (pinchStartDistance.value < 1e-6) return true;
  const ratio = newDistance / pinchStartDistance.value;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale.value * ratio));
  const c0 = pinchStartCenter.value;
  const o0 = pinchStartOffset.value;
  viewScale.value = newScale;
  viewOffset.value = {
    x: newCenter.x - (newScale / pinchStartScale.value) * (c0.x - o0.x),
    y: newCenter.y - (newScale / pinchStartScale.value) * (c0.y - o0.y),
  };
  resizeAndDraw();
  return true;
};

const handlePanningMove = (event: PointerEvent): boolean => {
  if (!isPanning.value) return false;
  const canvas = canvasRef.value;
  if (!canvas || !panStart.value || !viewOffsetAtPanStart.value) return true;

  const p = getCanvasOffsetPoint(canvas, event);
  const dx = p.x - panStart.value.x;
  const dy = p.y - panStart.value.y;

  viewOffset.value = {
    x: viewOffsetAtPanStart.value.x + dx,
    y: viewOffsetAtPanStart.value.y + dy,
  };

  resizeAndDraw();
  return true;
};

const handlePenDrawingMove = (event: PointerEvent): boolean => {
  if (currentTool.value !== "pen") return false;
  if (!isDrawing.value) return true;
  if (!isInputAllowedForDrawing(event.pointerType)) return true;

  const point = getCanvasPoint(event);
  if (!point) return true;

  strokeManager.update({ type: "appendPoint", point });
  drawLineTo(point);
  return true;
};

const handlePointerDown = (event: PointerEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const point = getCanvasOffsetPoint(canvas, event);

  if (handleTouchPointerDown(event, point, canvas)) return;

  if (isDrawing.value || isPanning.value || isPinching.value) return;

  if (event.pointerType === "touch" || event.pointerType === "pen") {
    event.preventDefault();
  }
  canvas.setPointerCapture(event.pointerId);

  if (handleBrushPointerDown(event)) return;

  // 中键按住拖动：无论当前工具为何都进入平移
  if (event.button === 1) {
    event.preventDefault();
    startPanning(point);
    return;
  }

  if (handlePenPointerDown(event)) return;
  if (currentTool.value === "drag") {
    startPanning(point);
  }
};

const handlePointerMove = (event: PointerEvent) => {
  if (handlePinchMove(event)) return;
  if (handlePanningMove(event)) return;

  if (isBrushing.value) {
    const pt = getCanvasPoint(event);
    if (!pt) return;
    brushCenter.value = pt;
    markBrushHitsAt(pt);
    resizeAndDraw();
    return;
  }

  handlePenDrawingMove(event);
};

const endPointerInteraction = () => {
  if (isBrushing.value) {
    const indexes = [...pendingDeleteIndexes.value].sort((a, b) => b - a);
    if (indexes.length) {
      strokeManager.update({ type: "removeByIndexes", indexes });
    }
    isBrushing.value = false;
    brushCenter.value = null;
    pendingDeleteIndexes.value = new Set();
    resizeAndDraw();
  }

  if (isDrawing.value) {
    isDrawing.value = false;
    lastPoint.value = null;
    strokeManager.update({ type: "endStroke" });
  }

  isPanning.value = false;
  panStart.value = null;
  viewOffsetAtPanStart.value = null;
};

const handlePointerEnd = (event: PointerEvent) => {
  const wasTouchPointer = activeTouchPoints.value.has(event.pointerId);
  if (wasTouchPointer) {
    activeTouchPoints.value.delete(event.pointerId);
    if (activeTouchPoints.value.size < 2) {
      isPinching.value = false;
    }
  }

  safeReleasePointerCapture(event.pointerId);

  if (wasTouchPointer) {
    if (activeTouchPoints.value.size === 0) {
      endPointerInteraction();
    }
    return;
  }
  endPointerInteraction();
};

const handlePointerUp = (event: PointerEvent) => handlePointerEnd(event);

const handlePointerCancel = (event: PointerEvent) => handlePointerEnd(event);

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      handleUndo();
    } else if (key === "y") {
      event.preventDefault();
      handleRedo();
    }
  }
};

const ZOOM_SENSITIVITY = 0.002;

const handleWheel = (event: WheelEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  event.preventDefault();

  const p = getCanvasOffsetPoint(canvas, event);
  const { scale: newScale, offset: newOffset } = zoomAtPoint(
    p.x,
    p.y,
    event.deltaY,
    viewScale.value,
    viewOffset.value,
    MIN_SCALE,
    MAX_SCALE,
    ZOOM_SENSITIVITY,
  );
  if (
    newScale === viewScale.value &&
    newOffset.x === viewOffset.value.x &&
    newOffset.y === viewOffset.value.y
  ) {
    return;
  }
  viewScale.value = newScale;
  viewOffset.value = newOffset;
  resizeAndDraw();
};

onMounted(() => {
  resizeAndDraw();
  window.addEventListener("resize", resizeAndDraw);
  window.addEventListener("keydown", handleKeydown);
  const canvas = canvasRef.value;
  if (canvas) {
    canvas.addEventListener("wheel", handleWheel, { passive: false });
  }
});

onBeforeUnmount(() => {
  strokeManager.removeEventListener("change", onHistoryChange);
  window.removeEventListener("resize", resizeAndDraw);
  window.removeEventListener("keydown", handleKeydown);
  const canvas = canvasRef.value;
  if (canvas) {
    canvas.removeEventListener("wheel", handleWheel);
  }
});
</script>

<template>
  <div class="relative h-screen w-screen">
    <canvas
      ref="canvasRef"
      class="w-full h-full block touch-none transition-colors"
      :class="isDark ? 'bg-slate-900' : 'bg-slate-50'"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
      @pointercancel="handlePointerCancel"
    ></canvas>

    <div class="pointer-events-none absolute top-4 inset-x-0 flex justify-center z-10">
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
    </div>

    <div
      class="pointer-events-none select-none absolute bottom-4 right-4 z-10 rounded-full px-3 py-1.5 text-sm tabular-nums backdrop-blur-sm border"
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

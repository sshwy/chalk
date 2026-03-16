import type { Point } from "./strokes";

/**
 * 世界坐标系下可见矩形（用于网格绘制等）。
 *
 * @param width  画布 CSS 宽度
 * @param height 画布 CSS 高度
 * @param offset 当前视图偏移（世界坐标 -> 屏幕坐标的平移量）
 * @param scale  当前缩放倍数
 */
export function getVisibleWorldRect(width: number, height: number, offset: Point, scale: number) {
  return {
    left: -offset.x / scale,
    top: -offset.y / scale,
    right: (width - offset.x) / scale,
    bottom: (height - offset.y) / scale,
  };
}

/**
 * 将屏幕坐标（PointerEvent 的 clientX/clientY）转换为世界坐标。
 *
 * @param clientX PointerEvent.clientX
 * @param clientY PointerEvent.clientY
 * @param rect    canvas.getBoundingClientRect()
 * @param offset  视图偏移
 * @param scale   视图缩放
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  offset: Point,
  scale: number,
): Point {
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale,
  };
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export interface ZoomAtPointResult {
  scale: number;
  offset: Point;
}

/**
 * 以屏幕坐标 (sx, sy) 为锚点进行缩放，返回新的缩放值与偏移。
 *
 * 该函数复用了 App.vue 中滚轮缩放的数学公式：
 * - 先根据 deltaY 和 sensitivity 计算目标缩放倍数
 * - 使用 clamp 限制在 [minScale, maxScale]
 * - 再调整 offset，使得缩放前后“屏幕点 (sx, sy) 对应的世界坐标”保持不变
 */
export function zoomAtPoint(
  sx: number,
  sy: number,
  deltaY: number,
  scale: number,
  offset: Point,
  minScale: number,
  maxScale: number,
  sensitivity: number,
): ZoomAtPointResult {
  const target = scale * (1 - deltaY * sensitivity);
  const newScale = clamp(target, minScale, maxScale);
  if (newScale === scale) {
    return { scale, offset };
  }
  const ratio = newScale / scale;
  const newOffset: Point = {
    x: sx - ratio * (sx - offset.x),
    y: sy - ratio * (sy - offset.y),
  };
  return { scale: newScale, offset: newOffset };
}

import type { Point, Stroke } from './strokes'

/**
 * 计算两点之间的欧氏距离（世界坐标）。
 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * 计算两点的中点（世界坐标）。
 */
export function center(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * 点到线段的最短距离（世界坐标）。
 *
 * @param p 任意点
 * @param a 线段起点
 * @param b 线段终点
 */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const q = { x: a.x + t * dx, y: a.y + t * dy }
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/**
 * 判断刷子圆是否命中一条笔画。
 *
 * 半径为世界坐标半径（例如 brushRadius / viewScale）。
 */
export function strokeHitByBrush(stroke: Stroke, c: Point, worldRadius: number): boolean {
  const pts = stroke.points
  if (!pts || pts.length < 2) return false
  for (let i = 0; i < pts.length - 1; i++) {
    if (pointToSegmentDistance(c, pts[i]!, pts[i + 1]!) <= worldRadius) return true
  }
  return false
}


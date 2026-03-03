import type { Point, Stroke } from './strokes'
import { DEFAULT_STROKE_WIDTH } from './strokes'

/**
 * 在世界坐标系下绘制网格。
 *
 * @param ctx       2D 渲染上下文
 * @param worldRect 当前视口对应的世界坐标矩形
 * @param spacing   网格间距（世界坐标单位）
 * @param gridColor 网格线颜色
 */
export function drawGridInWorld(
  ctx: CanvasRenderingContext2D,
  worldRect: { left: number; top: number; right: number; bottom: number },
  spacing: number,
  gridColor: string,
): void {
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

export interface DrawStrokesOptions {
  /**
   * 标记为“待删除”的笔画索引集合，用于渲染成灰色。
   */
  pendingIndexes?: Set<number>
  /**
   * 正常笔画颜色。
   */
  strokeColor: string
  /**
   * 待删除笔画的高亮颜色（一般为灰色半透明）。
   */
  pendingColor: string
  /**
   * 当 stroke.width 缺失时使用的默认线宽。
   */
  defaultLineWidth?: number
}

/**
 * 根据 Stroke 列表重绘所有笔画。
 *
 * 该函数只负责渲染，不修改 StrokeManager 内部状态。
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  options: DrawStrokesOptions,
): void {
  const pending = options.pendingIndexes ?? new Set<number>()
  const defaultWidth = options.defaultLineWidth ?? DEFAULT_STROKE_WIDTH

  ctx.save()
  ctx.lineCap = 'round'

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i]!
    const points = stroke.points
    if (!points || points.length < 2) continue
    ctx.lineWidth = stroke.width ?? defaultWidth
    ctx.strokeStyle = pending.has(i) ? options.pendingColor : options.strokeColor
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

/**
 * 绘制刷子预览圆圈（例如整轨擦除时的刷子范围）。
 *
 * @param ctx         2D 渲染上下文
 * @param center      圆心（世界坐标）
 * @param worldRadius 半径（世界坐标）
 * @param strokeStyle 圆圈颜色（已包含透明度）
 */
export function drawBrushCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  worldRadius: number,
  strokeStyle: string,
): void {
  ctx.save()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.arc(center.x, center.y, worldRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export interface DrawStrokeSegmentOptions {
  /**
   * 线条颜色。
   */
  strokeColor: string
  /**
   * 线宽（世界坐标单位）。
   */
  lineWidth: number
  /**
   * 设备像素比（window.devicePixelRatio || 1）。
   */
  dpr: number
  /**
   * 当前视图偏移（世界坐标 -> 屏幕坐标的平移量）。
   */
  offset: Point
  /**
   * 当前视图缩放。
   */
  scale: number
}

/**
 * 在当前视图下绘制一小段笔画（from -> to）。
 *
 * 该函数假设世界坐标系中的两点 from/to，内部会根据 dpr/offset/scale
 * 设置好变换矩阵后完成一次 stroke。
 */
export function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  options: DrawStrokeSegmentOptions,
): void {
  const { strokeColor, lineWidth, dpr, offset, scale } = options

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(offset.x, offset.y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}



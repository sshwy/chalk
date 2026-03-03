export type Point = { x: number; y: number }

export const DEFAULT_STROKE_WIDTH = 2

export type Stroke = {
  points: Point[]
  /** 线宽（世界坐标），旧数据可能缺失，渲染时用 DEFAULT_STROKE_WIDTH 回退 */
  width?: number
}

export type SerializedStrokeData = {
  strokes: Array<{ points: Point[]; width?: number }>
}

type UndoEntry =
  | { type: 'add'; stroke: Stroke }
  | { type: 'remove'; strokes: Stroke[]; indices: number[] }

function isRemoveEntry(e: UndoEntry): e is Extract<UndoEntry, { type: 'remove' }> {
  return e.type === 'remove'
}

export type StrokeManagerEvent = 'change'

export class StrokeManager {
  private strokes: Stroke[] = []
  private undoStack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private currentStroke: Stroke | null = null
  private changeListeners: Array<() => void> = []

  private notifyChange(): void {
    this.changeListeners.forEach((fn) => fn())
  }

  addEventListener(event: StrokeManagerEvent, listener: () => void): void {
    if (event === 'change') this.changeListeners.push(listener)
  }

  removeEventListener(event: StrokeManagerEvent, listener: () => void): void {
    if (event === 'change') {
      const i = this.changeListeners.indexOf(listener)
      if (i >= 0) this.changeListeners.splice(i, 1)
    }
  }

  beginStroke(startPoint: Point, width: number = DEFAULT_STROKE_WIDTH): void {
    const stroke: Stroke = { points: [startPoint], width }
    this.strokes.push(stroke)
    this.currentStroke = stroke
    this.redoStack = []
    this.notifyChange()
  }

  appendPoint(point: Point): void {
    if (!this.currentStroke) return
    this.currentStroke.points.push(point)
  }

  endStroke(): void {
    if (this.currentStroke) {
      this.undoStack.push({ type: 'add', stroke: this.currentStroke })
      this.currentStroke = null
      this.notifyChange()
    }
  }

  clear(): void {
    this.strokes = []
    this.undoStack = []
    this.redoStack = []
    this.currentStroke = null
    this.notifyChange()
  }

  removeStrokesByIndexes(indexes: number[], clearRedo = true): void {
    if (indexes.length === 0) return
    const sorted = [...new Set(indexes)].sort((a, b) => b - a)
    const removed: Stroke[] = []
    const indices: number[] = []
    for (const i of sorted) {
      if (i >= 0 && i < this.strokes.length) {
        const s = this.strokes[i]
        if (this.currentStroke === s) this.currentStroke = null
        removed.unshift(s)
        indices.unshift(i)
      }
    }
    for (const i of sorted) {
      if (i >= 0 && i < this.strokes.length) this.strokes.splice(i, 1)
    }
    if (removed.length === 0) return
    this.undoStack.push({ type: 'remove', strokes: removed, indices })
    if (clearRedo) this.redoStack = []
    this.notifyChange()
  }

  undo(): void {
    const entry = this.undoStack.pop()
    if (!entry) return
    if (isRemoveEntry(entry)) {
      const { strokes, indices } = entry
      const order = indices.map((_, k) => k).sort((a, b) => indices[b]! - indices[a]!)
      for (const k of order) {
        this.strokes.splice(indices[k]!, 0, strokes[k]!)
      }
      this.redoStack.push(entry)
      this.notifyChange()
      return
    }
    const idx = this.strokes.indexOf(entry.stroke)
    if (idx >= 0) {
      this.strokes.splice(idx, 1)
      if (this.currentStroke === entry.stroke) this.currentStroke = null
    }
    this.redoStack.push(entry)
    this.notifyChange()
  }

  redo(): void {
    const entry = this.redoStack.pop()
    if (!entry) return
    if (isRemoveEntry(entry)) {
      const sorted = entry.indices.slice().sort((a, b) => b - a)
      for (const i of sorted) {
        if (i >= 0 && i < this.strokes.length) {
          if (this.currentStroke === this.strokes[i]) this.currentStroke = null
          this.strokes.splice(i, 1)
        }
      }
      this.undoStack.push(entry)
      this.notifyChange()
      return
    }
    this.strokes.push(entry.stroke)
    this.undoStack.push(entry)
    this.notifyChange()
  }

  getStrokes(): readonly Stroke[] {
    return this.strokes
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  toJSON(): SerializedStrokeData {
    return {
      strokes: this.strokes.map((stroke) => ({
        points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
        width: stroke.width,
      })),
    }
  }

  static fromJSON(data: SerializedStrokeData): StrokeManager {
    const manager = new StrokeManager()
    if (!data || !Array.isArray(data.strokes)) {
      return manager
    }
    manager.strokes = data.strokes.map((stroke) => ({
      points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
      width: stroke.width != null ? stroke.width : DEFAULT_STROKE_WIDTH,
    }))
    return manager
  }
}


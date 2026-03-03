export type Point = { x: number; y: number }

export type Stroke = {
  points: Point[]
}

export type SerializedStrokeData = {
  strokes: Stroke[]
}

export class StrokeManager {
  private strokes: Stroke[] = []
  private redoStack: Stroke[] = []
  private currentStroke: Stroke | null = null

  beginStroke(startPoint: Point): void {
    const stroke: Stroke = { points: [startPoint] }
    this.strokes.push(stroke)
    this.currentStroke = stroke
    this.redoStack = []
  }

  appendPoint(point: Point): void {
    if (!this.currentStroke) return
    this.currentStroke.points.push(point)
  }

  endStroke(): void {
    this.currentStroke = null
  }

  clear(): void {
    this.strokes = []
    this.redoStack = []
    this.currentStroke = null
  }

  undo(): void {
    const stroke = this.strokes.pop()
    if (!stroke) return
    this.redoStack.push(stroke)
    if (this.currentStroke === stroke) {
      this.currentStroke = null
    }
  }

  redo(): void {
    const stroke = this.redoStack.pop()
    if (!stroke) return
    this.strokes.push(stroke)
  }

  getStrokes(): readonly Stroke[] {
    return this.strokes
  }

  toJSON(): SerializedStrokeData {
    return {
      strokes: this.strokes.map((stroke) => ({
        points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
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
    }))
    return manager
  }
}


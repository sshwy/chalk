export type Point = { x: number; y: number };

export const DEFAULT_STROKE_WIDTH = 2;

export type Stroke = {
  points: Point[];
  /** 线宽（世界坐标），旧数据可能缺失，渲染时用 DEFAULT_STROKE_WIDTH 回退 */
  width?: number;
};

export type SerializedStrokeData = {
  strokes: Array<{ points: Point[]; width?: number }>;
};

type UndoEntry =
  | { type: "add"; stroke: Stroke }
  | { type: "remove"; strokes: Stroke[]; indices: number[] };

function isRemoveEntry(e: UndoEntry): e is Extract<UndoEntry, { type: "remove" }> {
  return e.type === "remove";
}

export type StrokeAction =
  | { type: "beginStroke"; startPoint: Point; width?: number }
  | { type: "appendPoint"; point: Point }
  | { type: "endStroke" }
  | { type: "clear" }
  | { type: "removeByIndexes"; indexes: number[]; clearRedo?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "initFromSerialized"; data: SerializedStrokeData };

export type StrokeManagerEvent = "change";

export class StrokeManager {
  private strokes: Stroke[] = [];
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private currentStroke: Stroke | null = null;
  private changeListeners: Array<() => void> = [];

  private notifyChange(): void {
    this.changeListeners.forEach((fn) => fn());
  }

  addEventListener(event: StrokeManagerEvent, listener: () => void): void {
    if (event === "change") this.changeListeners.push(listener);
  }

  removeEventListener(event: StrokeManagerEvent, listener: () => void): void {
    if (event === "change") {
      const i = this.changeListeners.indexOf(listener);
      if (i >= 0) this.changeListeners.splice(i, 1);
    }
  }

  private beginStrokeInternal(startPoint: Point, width: number = DEFAULT_STROKE_WIDTH): void {
    const stroke: Stroke = { points: [startPoint], width };
    this.strokes.push(stroke);
    this.currentStroke = stroke;
    this.redoStack = [];
    this.notifyChange();
  }

  private appendPointInternal(point: Point): void {
    if (!this.currentStroke) return;
    this.currentStroke.points.push(point);
  }

  private endStrokeInternal(): void {
    if (this.currentStroke) {
      this.undoStack.push({ type: "add", stroke: this.currentStroke });
      this.currentStroke = null;
      this.notifyChange();
    }
  }

  private clearInternal(): void {
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.currentStroke = null;
    this.notifyChange();
  }

  private removeStrokesByIndexesInternal(indexes: number[], clearRedo = true): void {
    if (indexes.length === 0) return;
    const sorted = [...new Set(indexes)].sort((a, b) => b - a);
    const removed: Stroke[] = [];
    const indices: number[] = [];
    for (const i of sorted) {
      if (i >= 0 && i < this.strokes.length) {
        const s = this.strokes[i];
        if (this.currentStroke === s) this.currentStroke = null;
        removed.unshift(s);
        indices.unshift(i);
      }
    }
    for (const i of sorted) {
      if (i >= 0 && i < this.strokes.length) this.strokes.splice(i, 1);
    }
    if (removed.length === 0) return;
    this.undoStack.push({ type: "remove", strokes: removed, indices });
    if (clearRedo) this.redoStack = [];
    this.notifyChange();
  }

  private undoInternal(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    if (isRemoveEntry(entry)) {
      const { strokes, indices } = entry;
      const order = indices.map((_, k) => k).sort((a, b) => indices[b]! - indices[a]!);
      for (const k of order) {
        this.strokes.splice(indices[k]!, 0, strokes[k]!);
      }
      this.redoStack.push(entry);
      this.notifyChange();
      return;
    }
    const idx = this.strokes.indexOf(entry.stroke);
    if (idx >= 0) {
      this.strokes.splice(idx, 1);
      if (this.currentStroke === entry.stroke) this.currentStroke = null;
    }
    this.redoStack.push(entry);
    this.notifyChange();
  }

  private redoInternal(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    if (isRemoveEntry(entry)) {
      const sorted = entry.indices.slice().sort((a, b) => b - a);
      for (const i of sorted) {
        if (i >= 0 && i < this.strokes.length) {
          if (this.currentStroke === this.strokes[i]) this.currentStroke = null;
          this.strokes.splice(i, 1);
        }
      }
      this.undoStack.push(entry);
      this.notifyChange();
      return;
    }
    this.strokes.push(entry.stroke);
    this.undoStack.push(entry);
    this.notifyChange();
  }

  private initFromSerializedInternal(data: SerializedStrokeData): void {
    if (!data || !Array.isArray(data.strokes)) {
      this.clearInternal();
      return;
    }
    this.strokes = data.strokes.map((stroke) => ({
      points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
      width: stroke.width != null ? stroke.width : DEFAULT_STROKE_WIDTH,
    }));
    this.undoStack = [];
    this.redoStack = [];
    this.currentStroke = null;
    this.notifyChange();
  }

  update(action: StrokeAction): void {
    switch (action.type) {
      case "beginStroke":
        this.beginStrokeInternal(
          action.startPoint,
          action.width != null ? action.width : DEFAULT_STROKE_WIDTH,
        );
        return;
      case "appendPoint":
        this.appendPointInternal(action.point);
        return;
      case "endStroke":
        this.endStrokeInternal();
        return;
      case "clear":
        this.clearInternal();
        return;
      case "removeByIndexes":
        this.removeStrokesByIndexesInternal(action.indexes, action.clearRedo ?? true);
        return;
      case "undo":
        this.undoInternal();
        return;
      case "redo":
        this.redoInternal();
        return;
      case "initFromSerialized":
        this.initFromSerializedInternal(action.data);
        return;
    }
  }

  getStrokes(): readonly Stroke[] {
    return this.strokes;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  toJSON(): SerializedStrokeData {
    return {
      strokes: this.strokes.map((stroke) => ({
        points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
        width: stroke.width,
      })),
    };
  }

  static fromJSON(data: SerializedStrokeData): StrokeManager {
    const manager = new StrokeManager();
    if (!data || !Array.isArray(data.strokes)) {
      return manager;
    }
    manager.strokes = data.strokes.map((stroke) => ({
      points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
      width: stroke.width != null ? stroke.width : DEFAULT_STROKE_WIDTH,
    }));
    return manager;
  }
}

/**
 * 单次画板操作（将来用于多人协作时在网络间传输）。
 *
 * 当前阶段只在本地记录与回放，因此 id/userId 主要是为后续扩展预留。
 */
export type StrokeOp = {
  /** 本次操作的唯一 id（例如 UUID 或自增序号字符串） */
  id: string;
  /** 发起该操作的用户 id（本地测试阶段可以写死为 "local"） */
  userId: string;
  /** 发生时间戳，毫秒 */
  timestamp: number;
  /** 实际在 StrokeManager 上要执行的动作 */
  action: StrokeAction;
};

/**
 * 将一条 StrokeOp 应用到指定 StrokeManager 上。
 * 目前仅转发内部的 action，后续支持更多元数据时可在此集中处理。
 */
export function applyStrokeOp(manager: StrokeManager, op: StrokeOp): void {
  manager.update(op.action);
}

/**
 * 简单的操作日志容器，用于在本地记录一段绘制过程并回放到任意 StrokeManager。
 */
export class StrokeOpLog {
  private ops: StrokeOp[] = [];

  append(op: StrokeOp): void {
    this.ops.push(op);
  }

  getAll(): readonly StrokeOp[] {
    return this.ops;
  }

  clear(): void {
    this.ops = [];
  }

  /**
   * 依次把已经记录的操作应用到指定 StrokeManager。
   * 典型用法：把一个画板上的操作回放到另一个空画板上，检查结果是否一致。
   */
  replayInto(manager: StrokeManager): void {
    for (const op of this.ops) {
      manager.update(op.action);
    }
  }
}

<script setup lang="ts">
import { Eraser, Hand, Moon, PenTool, Pencil, Sun, Undo2, Redo2 } from "lucide-vue-next";
import { useMediaQuery } from "@vueuse/core";
import { ref } from "vue";
import ToolButton from "./ToolButton.vue";

type Tool = "drag" | "pen" | "brush";
type Mode = "light" | "dark";

const isTouchScreen = useMediaQuery("(pointer: coarse)");
const showBrushRadius = ref(false);
const showPenWidth = ref(false);

const props = defineProps<{
  tool: Tool;
  mode: Mode;
  penOnly: boolean;
  brushRadius: number;
  penWidth: number;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  (e: "update:tool", value: Tool): void;
  (e: "update:mode", value: Mode): void;
  (e: "update:penOnly", value: boolean): void;
  (e: "update:brushRadius", value: number): void;
  (e: "update:penWidth", value: number): void;
  (e: "undo"): void;
  (e: "redo"): void;
}>();

const setTool = (tool: Tool) => {
  if (tool === "brush") showPenWidth.value = false;
  if (tool === "pen") showBrushRadius.value = false;
  emit("update:tool", tool);
};

const handlePenClick = () => {
  if (props.tool === "pen") {
    showPenWidth.value = !showPenWidth.value;
  } else {
    emit("update:tool", "pen");
    showPenWidth.value = false;
  }
};

const handleBrushClick = () => {
  if (props.tool === "brush") {
    showBrushRadius.value = !showBrushRadius.value;
  } else {
    emit("update:tool", "brush");
    showBrushRadius.value = false;
  }
};

const BRUSH_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;
const PEN_WIDTH_OPTIONS = [2, 4, 6, 8, 10] as const;

const setBrushRadius = (r: number) => {
  emit("update:brushRadius", r);
};

const setPenWidth = (w: number) => {
  emit("update:penWidth", w);
};

const toggleMode = () => {
  const next: Mode = props.mode === "dark" ? "light" : "dark";
  emit("update:mode", next);
};

const handleUndoClick = () => {
  if (!props.canUndo) return;
  emit("undo");
};

const handleRedoClick = () => {
  if (!props.canRedo) return;
  emit("redo");
};
</script>

<template>
  <div
    class="pointer-events-auto inline-flex items-center gap-2 rounded-full backdrop-blur-sm shadow-lg px-3 py-2 transition-colors"
    :class="
      props.mode === 'dark'
        ? 'bg-slate-900/70 border border-white/20'
        : 'bg-white/70 border border-slate-200/80'
    "
  >
    <ToolButton
      :mode="props.mode"
      :selected="props.tool === 'drag'"
      variant="sky"
      aria-label="Drag mode"
      @click="setTool('drag')"
    >
      <Hand class="w-4 h-4" aria-hidden />
    </ToolButton>

    <div class="relative inline-flex">
      <ToolButton
        :mode="props.mode"
        :selected="props.tool === 'pen'"
        variant="sky"
        aria-label="Pen mode"
        @click="handlePenClick"
      >
        <Pencil class="w-4 h-4" aria-hidden />
      </ToolButton>
      <div
        v-if="showPenWidth && props.tool === 'pen'"
        class="absolute left-1/2 top-full mt-4 -translate-x-1/2 rounded-lg border px-3 py-3 shadow-lg"
        :class="
          props.mode === 'dark' ? 'bg-slate-800 border-white/20' : 'bg-white border-slate-200'
        "
      >
        <div class="flex flex-row items-center gap-3">
          <button
            v-for="w in PEN_WIDTH_OPTIONS"
            :key="w"
            type="button"
            class="rounded-full shrink-0 transition-[box-shadow,transform] hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
            :class="[
              props.mode === 'dark' ? 'bg-slate-200' : 'bg-slate-600',
              props.penWidth === w
                ? props.mode === 'dark'
                  ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-800'
                  : 'ring-2 ring-sky-500 ring-offset-2 ring-offset-white'
                : '',
            ]"
            :style="{
              width: `${w * 2 + 8}px`,
              height: `${w * 2 + 8}px`,
              minWidth: `${w * 2 + 8}px`,
              minHeight: `${w * 2 + 8}px`,
            }"
            :aria-label="`线宽 ${w}`"
            @click="setPenWidth(w)"
          />
        </div>
      </div>
    </div>

    <div class="relative inline-flex">
      <ToolButton
        :mode="props.mode"
        :selected="props.tool === 'brush'"
        variant="sky"
        aria-label="Brush (erase strokes)"
        @click="handleBrushClick"
      >
        <Eraser class="w-4 h-4" aria-hidden />
      </ToolButton>
      <div
        v-if="showBrushRadius && props.tool === 'brush'"
        class="absolute left-1/2 top-full mt-4 -translate-x-1/2 rounded-lg border px-3 py-3 shadow-lg"
        :class="
          props.mode === 'dark' ? 'bg-slate-800 border-white/20' : 'bg-white border-slate-200'
        "
      >
        <div class="flex flex-row items-center gap-3">
          <button
            v-for="size in BRUSH_SIZE_OPTIONS"
            :key="size"
            type="button"
            class="rounded-full shrink-0 transition-[box-shadow,transform] hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
            :class="[
              props.mode === 'dark' ? 'bg-slate-200' : 'bg-slate-600',
              props.brushRadius === size
                ? props.mode === 'dark'
                  ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-800'
                  : 'ring-2 ring-sky-500 ring-offset-2 ring-offset-white'
                : '',
            ]"
            :style="{
              width: `${size * 0.7 + 10}px`,
              height: `${size * 0.7 + 10}px`,
              minWidth: `${size * 0.7 + 10}px`,
              minHeight: `${size * 0.7 + 10}px`,
            }"
            :aria-label="`半径 ${size}`"
            @click="setBrushRadius(size)"
          />
        </div>
      </div>
    </div>

    <ToolButton
      :mode="props.mode"
      :disabled="!props.canUndo"
      aria-label="Undo"
      @click="handleUndoClick"
    >
      <Undo2 class="w-4 h-4" aria-hidden />
    </ToolButton>

    <ToolButton
      :mode="props.mode"
      :disabled="!props.canRedo"
      aria-label="Redo"
      @click="handleRedoClick"
    >
      <Redo2 class="w-4 h-4" aria-hidden />
    </ToolButton>

    <ToolButton
      v-if="isTouchScreen"
      :mode="props.mode"
      :selected="props.penOnly"
      variant="violet"
      :aria-label="props.penOnly ? 'Pen only (on)' : 'Pen only (off)'"
      @click="emit('update:penOnly', !props.penOnly)"
    >
      <PenTool class="w-4 h-4" aria-hidden />
    </ToolButton>

    <ToolButton
      :mode="props.mode"
      :selected="props.mode === 'dark'"
      variant="amber"
      aria-label="Toggle theme"
      @click="toggleMode"
    >
      <Sun v-if="props.mode === 'light'" class="w-4 h-4" aria-label="Light mode" />
      <Moon v-else class="w-4 h-4" aria-label="Dark mode" />
    </ToolButton>
  </div>
</template>

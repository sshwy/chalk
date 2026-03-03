<script setup lang="ts">
import { Eraser, Hand, Moon, PenTool, Pencil, Sun, Undo2, Redo2 } from 'lucide-vue-next'
import { useMediaQuery } from '@vueuse/core'
import { ref } from 'vue'

type Tool = 'drag' | 'pen' | 'brush'
type Mode = 'light' | 'dark'

const isTouchScreen = useMediaQuery('(pointer: coarse)')
const showBrushRadius = ref(false)

const props = defineProps<{
  tool: Tool
  mode: Mode
  penOnly: boolean
  brushRadius: number
}>()

const emit = defineEmits<{
  (e: 'update:tool', value: Tool): void
  (e: 'update:mode', value: Mode): void
  (e: 'update:penOnly', value: boolean): void
  (e: 'update:brushRadius', value: number): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const setTool = (tool: Tool) => {
  emit('update:tool', tool)
}

const handleBrushClick = () => {
  if (props.tool === 'brush') {
    showBrushRadius.value = !showBrushRadius.value
  } else {
    emit('update:tool', 'brush')
    showBrushRadius.value = false
  }
}

const BRUSH_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const

const setBrushRadius = (r: number) => {
  emit('update:brushRadius', r)
}

const toggleMode = () => {
  const next: Mode = props.mode === 'dark' ? 'light' : 'dark'
  emit('update:mode', next)
}

const handleUndoClick = () => {
  emit('undo')
}

const handleRedoClick = () => {
  emit('redo')
}
</script>

<template>
  <div class="pointer-events-none fixed top-4 inset-x-0 flex justify-center z-10">
    <div
      class="pointer-events-auto inline-flex items-center gap-2 rounded-full backdrop-blur shadow-lg px-3 py-2 transition-colors"
      :class="props.mode === 'dark'
          ? 'bg-slate-900/70 border border-white/20'
          : 'bg-white/70 border border-slate-200/80'
        ">
      <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="[
          props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700',
          props.tool === 'drag' ? (props.mode === 'dark' ? 'bg-white/10 ring-2 ring-sky-400' : 'bg-black/5 ring-2 ring-sky-500') : '',
        ]" @click="setTool('drag')">
        <Hand class="w-4 h-4" aria-label="Drag mode" />
      </button>

      <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="[
          props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700',
          props.tool === 'pen' ? (props.mode === 'dark' ? 'bg-white/10 ring-2 ring-sky-400' : 'bg-black/5 ring-2 ring-sky-500') : '',
        ]" @click="setTool('pen')">
        <Pencil class="w-4 h-4" aria-label="Pen mode" />
      </button>

      <div class="relative inline-flex">
        <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          :class="[
            props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700',
            props.tool === 'brush' ? (props.mode === 'dark' ? 'bg-white/10 ring-2 ring-sky-400' : 'bg-black/5 ring-2 ring-sky-500') : '',
          ]"
          aria-label="Brush (erase strokes)"
          @click="handleBrushClick"
        >
          <Eraser class="w-4 h-4" aria-hidden />
        </button>
        <div
          v-if="showBrushRadius && props.tool === 'brush'"
          class="absolute left-1/2 top-full mt-4 -translate-x-1/2 rounded-lg border px-3 py-3 shadow-lg"
          :class="props.mode === 'dark' ? 'bg-slate-800 border-white/20' : 'bg-white border-slate-200'"
        >
          <div class="flex flex-row items-center gap-3">
            <button
              v-for="size in BRUSH_SIZE_OPTIONS"
              :key="size"
              type="button"
              class="rounded-full flex-shrink-0 transition-[box-shadow,transform] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
              :class="[
                props.mode === 'dark' ? 'bg-slate-200' : 'bg-slate-600',
                props.brushRadius === size ? (props.mode === 'dark' ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-800' : 'ring-2 ring-sky-500 ring-offset-2 ring-offset-white') : '',
              ]"
              :style="{ width: `${size * 0.7 + 10}px`, height: `${size * 0.7 + 10}px`, minWidth: `${size * 0.7 + 10}px`, minHeight: `${size * 0.7 + 10}px` }"
              :aria-label="`半径 ${size}`"
              @click="setBrushRadius(size)"
            />
          </div>
        </div>
      </div>

      <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700'"
        @click="handleUndoClick">
        <Undo2 class="w-4 h-4" aria-label="Undo" />
      </button>

      <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700'"
        @click="handleRedoClick">
        <Redo2 class="w-4 h-4" aria-label="Redo" />
      </button>

      <button
        v-if="isTouchScreen"
        type="button"
        class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="[
          props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700',
          props.penOnly ? (props.mode === 'dark' ? 'bg-white/10 ring-2 ring-violet-400' : 'bg-black/5 ring-2 ring-violet-500') : '',
        ]"
        :aria-label="props.penOnly ? 'Pen only (on)' : 'Pen only (off)'"
        @click="emit('update:penOnly', !props.penOnly)"
      >
        <PenTool class="w-4 h-4" aria-hidden />
      </button>

      <button type="button" class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        :class="[
          props.mode === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-black/5 text-slate-700',
          props.mode === 'dark' ? 'bg-white/10 ring-2 ring-amber-400' : '',
        ]" @click="toggleMode">
        <Sun v-if="props.mode === 'light'" class="w-4 h-4" aria-label="Light mode" />
        <Moon v-else class="w-4 h-4" aria-label="Dark mode" />
      </button>
    </div>
  </div>
</template>

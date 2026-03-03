<script setup lang="ts">
import { Hand, Moon, Pencil, Sun, Undo2, Redo2 } from 'lucide-vue-next'

type Tool = 'drag' | 'pen'
type Mode = 'light' | 'dark'

const props = defineProps<{
  tool: Tool
  mode: Mode
}>()

const emit = defineEmits<{
  (e: 'update:tool', value: Tool): void
  (e: 'update:mode', value: Mode): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const setTool = (tool: Tool) => {
  emit('update:tool', tool)
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

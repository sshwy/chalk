<script setup lang="ts">
import { computed } from "vue";

type Mode = "light" | "dark";

const props = defineProps<{
  mode: Mode;
  ariaLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  /**
   * 选中态的样式变体：
   * - sky: 工具按钮（拖动/画笔/刷子）
   * - violet: 触控笔专用按钮
   * - amber: 主题切换按钮
   */
  variant?: "sky" | "violet" | "amber";
}>();

const baseClass = computed(() =>
  props.mode === "dark" ? "hover:bg-white/10 text-slate-200" : "hover:bg-black/5 text-slate-700",
);

const selectedClass = computed(() => {
  if (!props.selected) return "";
  const variant = props.variant ?? "sky";
  if (variant === "violet") {
    return props.mode === "dark"
      ? "bg-white/10 ring-2 ring-violet-400"
      : "bg-black/5 ring-2 ring-violet-500";
  }
  if (variant === "amber") {
    return props.mode === "dark" ? "bg-white/10 ring-2 ring-amber-400" : "";
  }
  // sky
  return props.mode === "dark"
    ? "bg-white/10 ring-2 ring-sky-400"
    : "bg-black/5 ring-2 ring-sky-500";
});
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    :class="[baseClass, selectedClass]"
    :disabled="disabled"
    :aria-label="ariaLabel"
  >
    <slot />
  </button>
</template>

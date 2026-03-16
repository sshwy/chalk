<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import FullCanvasBoard from "./components/FullCanvasBoard.vue";
import { useLocalStorage } from "@vueuse/core";
import {
  StrokeManager,
  type StrokeAction,
  StrokeOpLog,
  type StrokeOp,
  applyStrokeOp,
} from "../chalk-app/index";

const strokeManager = new StrokeManager();
const penOnly = useLocalStorage<boolean>("chalk:pen-only", false);

// 本地操作日志：记录左侧画板产生的 StrokeAction，稍后可回放到右侧画板。
const opLog = new StrokeOpLog();
const nextOpId = ref(1);

const myUserId = ref(Math.random().toString(36).slice(2, 10));

const roomId = computed(() => {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("room") ?? "default";
  } catch {
    return "default";
  }
});

const ws = ref<WebSocket | null>(null);
const isConnected = ref(false);

const WS_BASE_URL = "ws://localhost:3001";

const sendOp = (op: StrokeOp) => {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
  ws.value.send(JSON.stringify({ type: "op", op }));
};

const handleLeftBoardStrokeAction = (action: StrokeAction) => {
  const id = `local-${nextOpId.value++}`;
  const op: StrokeOp = {
    id,
    userId: myUserId.value,
    timestamp: Date.now(),
    action,
  };
  opLog.append(op);
  sendOp(op);
};

const handleIncomingOp = (op: StrokeOp) => {
  if (op.userId === myUserId.value) return;
  applyStrokeOp(strokeManager, op);
};

onMounted(() => {
  const socket = new WebSocket(
    `${WS_BASE_URL}?room=${encodeURIComponent(roomId.value)}&userId=${encodeURIComponent(
      myUserId.value,
    )}`,
  );
  ws.value = socket;

  socket.addEventListener("open", () => {
    isConnected.value = true;
  });

  socket.addEventListener("close", () => {
    isConnected.value = false;
  });

  socket.addEventListener("error", () => {
    isConnected.value = false;
  });

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      return;
    }
    const msg = parsed as { type: string; data?: any; op?: StrokeOp };
    console.log('msg', msg.type)
    if (msg.type === "init_state" && msg.data) {
      // 将服务器状态覆盖到本地 strokeManager
      strokeManager.update({ type: "initFromSerialized", data: msg.data });
    } else if (msg.type === "op" && msg.op) {
      handleIncomingOp(msg.op);
    }
  });
});

onBeforeUnmount(() => {
  if (ws.value) {
    ws.value.close();
    ws.value = null;
  }
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-white dark:bg-neutral-950 text-xs text-slate-500">
    <div class="flex-0 flex justify-center items-center gap-4 py-2">
      <span>
        {{ isConnected ? "已连接协作服务器" : "未连接协作服务器" }}
      </span>
      <span v-if="isConnected">房间：{{ roomId }}</span>
    </div>

    <div class="flex-1 flex gap-2">
      <FullCanvasBoard
        class="h-full flex-1"
        :stroke-manager="strokeManager"
        v-model:pen-only="penOnly"
        @stroke-action="handleLeftBoardStrokeAction"
      />
    </div>
  </div>
</template>

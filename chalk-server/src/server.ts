import { WebSocketServer, WebSocket } from "ws";
import {
  StrokeManager,
  type SerializedStrokeData,
  type StrokeOp,
} from "../../chalk-app/src/strokes";

type RoomId = string;

type RoomMessage =
  | { type: "init_state"; data: SerializedStrokeData }
  | { type: "op"; op: StrokeOp };

type ClientMeta = {
  ws: WebSocket;
  userId: string;
};

type Room = {
  clients: Set<ClientMeta>;
  manager: StrokeManager;
};

const rooms = new Map<RoomId, Room>();

const PORT = Number(process.env.PORT ?? 3001);

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      clients: new Set(),
      manager: new StrokeManager(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(room: Room, sender: WebSocket | null, message: RoomMessage) {
  const json = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.ws === sender) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(json);
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, request) => {
  const url = request.url ?? "/";
  const fullUrl = new URL(url, "ws://localhost");
  const roomId = fullUrl.searchParams.get("room") ?? "default";
  const userId = fullUrl.searchParams.get("userId") ?? "anonymous";

  const room = getOrCreateRoom(roomId);
  const clientMeta: ClientMeta = { ws, userId };
  room.clients.add(clientMeta);

  // 发送当前房间的初始状态
  const initMessage: RoomMessage = {
    type: "init_state",
    data: room.manager.toJSON(),
  };
  ws.send(JSON.stringify(initMessage));

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    const msg = parsed as RoomMessage;
    if (msg.type === "op") {
      const op = msg.op;
      room.manager.update(op.action);
      broadcastToRoom(room, ws, { type: "op", op });
    }
  });

  ws.on("close", () => {
    room.clients.delete(clientMeta);
    if (room.clients.size === 0) {
      rooms.delete(roomId);
    }
  });
});

// eslint-disable-next-line no-console
console.log(`WebSocket server listening on port ${PORT}`);

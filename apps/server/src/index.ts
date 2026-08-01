import type {
  BasicResponse,
  ClientToServerEvents,
  PublicGameState,
  ServerToClientEvents
} from "@getaway-cards/shared";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import morgan from "morgan";
import { Server } from "socket.io";
import { config } from "./config.js";
import { GameDatabase } from "./db.js";
import { RoomManager, normalizeRoomCode } from "./roomManager.js";

const app = express();
const httpServer = createServer(app);
const db = new GameDatabase(config.sqlitePath);

if (config.seedDemo) {
  db.seedDemoHistory();
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: config.clientOrigins,
    credentials: true
  }
});

const roomManager = new RoomManager(
  db,
  async (roomCode) => {
    await broadcastRoom(roomCode);
  },
  async (payload) => {
    io.to(payload.roomCode).emit("room:closed", payload);
    io.in(payload.roomCode).socketsLeave(payload.roomCode);
    emitRoomList();
  }
);

app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true
  })
);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "bhabhi-thulla-api",
    rooms: roomManager.listRooms().length,
    time: new Date().toISOString()
  });
});

app.get("/api/rooms", (_request, response) => {
  response.json({ rooms: roomManager.listRooms() });
});

app.get("/api/history", (_request, response) => {
  response.json({ history: db.listRecentHistory(24) });
});

io.on("connection", (socket) => {
  const withGameError = <T extends { ok: boolean; error?: string }>(response: T): T => {
    if (!response.ok) {
      socket.emit("gameError", response.error ?? "Action failed.");
    }
    return response;
  };

  socket.on("room:create", (payload, ack) => {
    const result = roomManager.createRoom(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(result);
    emitRoomList();
  });

  socket.on("room:quickPlay", (payload, ack) => {
    const result = roomManager.quickPlay(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(result);
    emitRoomList();
  });

  socket.on("room:playWithBots", (payload, ack) => {
    const result = roomManager.playWithBots(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(result);
    emitRoomList();
  });

  socket.on("room:startTournament", (payload, ack) => {
    const result = roomManager.startTournament(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(result);
    emitRoomList();
  });

  socket.on("room:join", (payload, ack) => {
    const result = roomManager.joinRoom(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(result);
    emitRoomList();
  });

  socket.on("createRoom", (payload, ack) => {
    const result = roomManager.createRoom(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(withGameError(result));
    emitRoomList();
  });

  socket.on("joinRoom", (payload, ack) => {
    const result = roomManager.joinRoom(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(withGameError(result));
    emitRoomList();
  });

  socket.on("reconnectPlayer", (payload, ack) => {
    const result = roomManager.joinRoom(payload);
    attachIfJoined(socket.id, result.roomCode, result.playerId);
    ack(withGameError(result));
    emitRoomList();
  });

  socket.on("room:list", (ack) => {
    ack(roomManager.listRooms());
  });

  socket.on("room:addBot", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.addBot(payload, seat.participantId));
    emitRoomList();
  });

  socket.on("playerReady", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    ack(withGameError(roomManager.setPlayerReady(payload.roomCode, seat.participantId, payload.ready)));
  });

  socket.on("room:quit", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    const response = roomManager.quitRoom(payload.roomCode, seat.participantId, Boolean(payload.replaceWithBot));
    if (response.ok && response.stayedAsSpectator) {
      attachIfJoined(socket.id, response.roomCode, response.playerId);
    } else if (response.ok) {
      socket.leave(seat.roomCode);
    }
    ack(response);
    emitRoomList();
  });

  socket.on("leaveRoom", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    const response = roomManager.quitRoom(payload.roomCode, seat.participantId, Boolean(payload.replaceWithBot));
    if (response.ok && response.stayedAsSpectator) {
      attachIfJoined(socket.id, response.roomCode, response.playerId);
    } else if (response.ok) {
      socket.leave(seat.roomCode);
    }
    ack(withGameError(response));
    emitRoomList();
  });

  socket.on("game:start", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.startGame(payload.roomCode, seat.participantId));
    emitRoomList();
  });

  socket.on("startGame", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    ack(withGameError(roomManager.startGame(payload.roomCode, seat.participantId)));
    emitRoomList();
  });

  socket.on("game:nextRound", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.nextRound(payload.roomCode, seat.participantId));
    emitRoomList();
  });

  socket.on("game:move", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.performMove(payload.roomCode, seat.participantId, payload.move));
  });

  socket.on("game:takeNextPlayerCards", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    ack(withGameError(roomManager.takeNextPlayerCards(payload.roomCode, seat.participantId)));
  });

  socket.on("playCard", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    ack(withGameError(roomManager.performMove(payload.roomCode, seat.participantId, {
      type: "play",
      cardIds: [payload.cardId],
      declaredSuit: payload.declaredSuit
    })));
  });

  socket.on("settings:update", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.updateSettings(payload, seat.participantId));
  });

  socket.on("chat:send", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    const message = roomManager.addChat(payload.roomCode, seat.participantId, payload.body);
    if (!message) {
      ack({ ok: false, error: "Message could not be sent." });
      return;
    }

    io.to(seat.roomCode).emit("chat:message", message);
    ack({ ok: true });
  });

  socket.on("reaction:send", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    const reaction = roomManager.addReaction(payload.roomCode, seat.participantId, payload.emoji);
    if (!reaction) {
      ack({ ok: false, error: "Reaction could not be sent." });
      return;
    }

    io.to(seat.roomCode).emit("reaction:message", reaction);
    ack({ ok: true });
  });

  socket.on("disconnect", () => {
    const roomCode = roomManager.disconnectSocket(socket.id);
    if (roomCode) {
      emitRoomList();
    }
  });
});

httpServer.listen(config.port, () => {
  console.log(`Bhabhi Thulla API listening on http://localhost:${config.port}`);
  console.log(`Allowed client origins: ${config.clientOrigins.join(", ")}`);
});

if (process.env.BHABHI_DETACHED === "1") {
  process.on("SIGINT", () => undefined);
  process.on("SIGTERM", () => undefined);
} else {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function broadcastRoom(roomCode: string): Promise<void> {
  const sockets = await io.in(roomCode).fetchSockets();
  for (const remoteSocket of sockets) {
    const seat = roomManager.getSocketSeat(remoteSocket.id);
    const state = roomManager.getPublicState(roomCode, seat?.participantId);
    if (state) {
      remoteSocket.emit("room:state", state);
      remoteSocket.emit("roomState", toRoomStateEvent(state));
      const viewer = state.players.find((player) => player.isYou && player.hand);
      if (viewer?.hand) {
        remoteSocket.emit("privateHand", {
          roomCode: state.roomCode,
          playerId: viewer.id,
          hand: viewer.hand
        });
      }
    }
  }

  emitRoomList();
}

function emitStateToSocket(socketId: string, roomCode: string): void {
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    return;
  }

  const seat = roomManager.getSocketSeat(socketId);
  const state = roomManager.getPublicState(roomCode, seat?.participantId);
  if (!state) {
    return;
  }

  socket.emit("room:state", state);
  socket.emit("roomState", toRoomStateEvent(state));
  const viewer = state.players.find((player) => player.isYou && player.hand);
  if (viewer?.hand) {
    socket.emit("privateHand", {
      roomCode: state.roomCode,
      playerId: viewer.id,
      hand: viewer.hand
    });
  }
}

function toRoomStateEvent(state: PublicGameState): PublicGameState {
  return {
    ...state,
    players: state.players.map((player) => {
      const { hand: _hand, ...safePlayer } = player;
      return safePlayer;
    })
  };
}

function attachIfJoined(
  socketId: string,
  roomCode: string | undefined,
  participantId: string | undefined
): void {
  if (!roomCode || !participantId) {
    return;
  }

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    return;
  }

  const previousSeat = roomManager.getSocketSeat(socketId);
  if (previousSeat && previousSeat.roomCode !== normalizeRoomCode(roomCode)) {
    socket.leave(previousSeat.roomCode);
  }

  socket.join(roomCode);
  roomManager.attachSocket(socketId, roomCode, participantId);
  emitStateToSocket(socketId, roomCode);
}

function requireSeat(
  socketId: string,
  roomCode: string
): BasicResponse & { participantId: string; roomCode: string } {
  const seat = roomManager.getSocketSeat(socketId);
  if (!seat) {
    return {
      ok: false,
      error: "Join a room before taking that action.",
      participantId: "",
      roomCode: ""
    };
  }

  if (seat.roomCode !== normalizeRoomCode(roomCode)) {
    return {
      ok: false,
      error: "That action targets a different room.",
      participantId: "",
      roomCode: seat.roomCode
    };
  }

  return { ok: true, participantId: seat.participantId, roomCode: seat.roomCode };
}

function emitRoomList(): void {
  io.emit("room:list", roomManager.listRooms());
}

function shutdown(): void {
  db.close();
  httpServer.close(() => {
    process.exit(0);
  });
}

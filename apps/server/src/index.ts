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
import { createProfileRouter } from "./profileRoutes.js";
import { trustedPlayerPayload } from "./auth.js";
import { RoomManager, normalizeRoomCode } from "./roomManager.js";
import { VoiceSignalingService } from "./voiceSignaling.js";
import { FriendsService } from "./friendsService.js";

const app = express();
app.set("trust proxy", 1);
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

let voiceSignaling: VoiceSignalingService;
let friendsService: FriendsService;
const roomManager = new RoomManager(
  db,
  async (roomCode) => {
    voiceSignaling?.syncRoom(roomCode);
    await broadcastRoom(roomCode);
  },
  async (payload) => {
    voiceSignaling?.closeRoom(payload.roomCode);
    io.to(payload.roomCode).emit("room:closed", payload);
    io.in(payload.roomCode).socketsLeave(payload.roomCode);
    friendsService?.refreshAllPresence();
    emitRoomList();
  }
);
voiceSignaling = new VoiceSignalingService(io, roomManager, config.voice);
friendsService = new FriendsService(io, db, roomManager, attachIfJoined);

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

app.use("/api", createProfileRouter(db));

io.on("connection", (socket) => {
  const withGameError = <T extends { ok: boolean; error?: string }>(response: T): T => {
    if (!response.ok) {
      socket.emit("gameError", response.error ?? "Action failed.");
    }
    return response;
  };

  socket.on("room:create", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.createRoom({ ...payload, ...trusted }));
  });

  socket.on("room:quickPlay", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.quickPlay({ ...payload, ...trusted }));
  });

  socket.on("room:playWithBots", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.playWithBots({ ...payload, ...trusted }));
  });

  socket.on("room:startTournament", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.startTournament({ ...payload, ...trusted }));
  });

  socket.on("room:join", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.joinRoom({ ...payload, ...trusted }));
  });

  socket.on("createRoom", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.createRoom({ ...payload, ...trusted }), true);
  });

  socket.on("joinRoom", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.joinRoom({ ...payload, ...trusted }), true);
  });

  socket.on("reconnectPlayer", async (payload, ack) => {
    await handlePlayerEntry(payload, ack, (trusted) => roomManager.joinRoom({ ...payload, ...trusted }), true);
  });

  async function handlePlayerEntry(
    payload: Parameters<typeof trustedPlayerPayload>[1],
    ack: (response: ReturnType<RoomManager["createRoom"]>) => void,
    action: (trusted: Awaited<ReturnType<typeof trustedPlayerPayload>>) => ReturnType<RoomManager["createRoom"]>,
    legacy = false
  ): Promise<void> {
    try {
      const trusted = await trustedPlayerPayload(db, payload);
      const result = action(trusted);
      attachIfJoined(socket.id, result.roomCode, result.playerId);
      ack(legacy ? withGameError(result) : result);
      emitRoomList();
    } catch (error) {
      const result = { ok: false, error: error instanceof Error ? error.message : "Could not verify player identity." };
      ack(legacy ? withGameError(result) : result);
    }
  }

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

    voiceSignaling.leaveSocket(socket.id);
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

    voiceSignaling.leaveSocket(socket.id);
    const response = roomManager.quitRoom(payload.roomCode, seat.participantId, Boolean(payload.replaceWithBot));
    if (response.ok && response.stayedAsSpectator) {
      attachIfJoined(socket.id, response.roomCode, response.playerId);
    } else if (response.ok) {
      socket.leave(seat.roomCode);
    }
    ack(withGameError(response));
    emitRoomList();
  });

  socket.on("room:reclaimSeat", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    const response = roomManager.reclaimBotSeat(payload.roomCode, seat.participantId);
    if (response.ok) {
      attachIfJoined(socket.id, response.roomCode, response.playerId);
    }
    ack(withGameError(response));
    emitRoomList();
  });

  socket.on("player:takeControl", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.takeControl(payload.roomCode, seat.participantId, payload.turnId));
  });

  socket.on("player:setAutoPlay", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    ack(roomManager.setAutoPlay(payload.roomCode, seat.participantId, payload.enabled));
  });

  socket.on("player:findActiveGame", async (payload, ack) => {
    try {
      const trusted = await trustedPlayerPayload(db, payload);
      if (trusted.accountType !== "registered" || !trusted.profileId) {
        ack({ ok: false, error: "Sign in to recover games across devices." });
        return;
      }
      ack({ ok: true, game: roomManager.findActiveGame(trusted.profileId) });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "Could not check active games." });
    }
  });

  socket.on("player:rejoinActive", async (payload, ack) => {
    await handlePlayerEntry(
      payload,
      ack,
      (trusted) => roomManager.rejoinActive({ ...payload, ...trusted })
    );
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

    ack(roomManager.performMove(payload.roomCode, seat.participantId, payload.move, payload.turnId));
  });

  socket.on("game:takeNextPlayerCards", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(withGameError(seat));
      return;
    }

    ack(withGameError(roomManager.takeNextPlayerCards(payload.roomCode, seat.participantId, payload.turnId)));
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
    }, payload.turnId)));
  });

  socket.on("settings:update", (payload, ack) => {
    const seat = requireSeat(socket.id, payload.roomCode);
    if (!seat.ok) {
      ack(seat);
      return;
    }

    const response = roomManager.updateSettings(payload, seat.participantId);
    ack(response);
    if (response.ok) voiceSignaling.syncRoom(seat.roomCode);
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

  socket.on("voice:join", (payload, ack) => {
    ack(voiceSignaling.join(socket, payload));
  });

  socket.on("voice:leave", (payload, ack) => {
    ack(voiceSignaling.leave(socket, payload));
  });

  socket.on("voice:offer", (payload, ack) => {
    ack(voiceSignaling.forwardSession(socket, "voice:offer", payload));
  });

  socket.on("voice:answer", (payload, ack) => {
    ack(voiceSignaling.forwardSession(socket, "voice:answer", payload));
  });

  socket.on("voice:ice-candidate", (payload, ack) => {
    ack(voiceSignaling.forwardIce(socket, payload));
  });

  socket.on("voice:mute-state", (payload, ack) => {
    ack(voiceSignaling.updateMute(socket, payload));
  });

  socket.on("voice:connection-state", (payload, ack) => {
    ack(voiceSignaling.updateConnection(socket, payload));
  });

  socket.on("voice:report", (payload, ack) => {
    ack(voiceSignaling.report(socket, payload));
  });

  socket.on("friends:authenticate", async (payload, ack) => {
    ack(await friendsService.authenticate(socket, payload.authToken));
  });

  socket.on("friends:refresh", (ack) => {
    ack(friendsService.refresh(socket));
  });

  socket.on("friends:disconnect", (ack) => {
    ack(friendsService.signOut(socket));
  });

  socket.on("friends:search", (payload, ack) => {
    ack(friendsService.search(socket, payload.query));
  });

  socket.on("friends:request", (payload, ack) => {
    ack(friendsService.requestFriend(socket, payload.profileId));
  });

  socket.on("friends:acceptRequest", (payload, ack) => {
    ack(friendsService.acceptRequest(socket, payload.requestId));
  });

  socket.on("friends:declineRequest", (payload, ack) => {
    ack(friendsService.declineRequest(socket, payload.requestId));
  });

  socket.on("friends:cancelRequest", (payload, ack) => {
    ack(friendsService.cancelRequest(socket, payload.requestId));
  });

  socket.on("friends:remove", (payload, ack) => {
    ack(friendsService.removeFriend(socket, payload.profileId));
  });

  socket.on("friends:block", (payload, ack) => {
    ack(friendsService.blockPlayer(socket, payload.profileId));
  });

  socket.on("friends:unblock", (payload, ack) => {
    ack(friendsService.unblockPlayer(socket, payload.profileId));
  });

  socket.on("friends:invite", (payload, ack) => {
    ack(friendsService.inviteFriend(socket, payload.profileId));
    emitRoomList();
  });

  socket.on("friends:acceptInvite", (payload, ack) => {
    ack(friendsService.acceptInvite(socket, payload.inviteId));
  });

  socket.on("friends:declineInvite", (payload, ack) => {
    ack(friendsService.declineInvite(socket, payload.inviteId));
  });

  socket.on("friends:joinFriend", (payload, ack) => {
    ack(friendsService.joinFriend(socket, payload.profileId));
  });

  socket.on("friends:setAway", (payload, ack) => {
    ack(friendsService.setAway(socket, payload.away));
  });

  socket.on("disconnect", () => {
    voiceSignaling.leaveSocket(socket.id);
    const roomCode = roomManager.disconnectSocket(socket.id);
    friendsService.disconnect(socket.id);
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
  friendsService?.refreshRoom(roomCode);
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
    voiceSignaling.leaveSocket(socketId);
    socket.leave(previousSeat.roomCode);
  }

  socket.join(roomCode);
  roomManager.attachSocket(socketId, roomCode, participantId);
  friendsService?.syncSocket(socketId);
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

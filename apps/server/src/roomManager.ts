import {
  AVATAR_PRESETS,
  BOT_NAMES,
  NATION_OPTIONS,
  TRICK_REVEAL_MS,
  applyMove,
  applyTemporaryBotMove,
  applyTakeNextPlayerCards,
  applyTimeoutAutoPlay,
  canStartGame,
  chooseBotMove,
  createGameState,
  createId,
  createPlayer,
  normalizeSettings,
  startRound,
  toPublicGameState,
  type AddBotPayload,
  type ActiveGameSummary,
  type BasicResponse,
  type BotDifficulty,
  type Card,
  type ChatMessage,
  type CreateRoomPayload,
  type GameState,
  type JoinRoomPayload,
  type PlayWithBotsPayload,
  type PublicGameState,
  type QuickPlayPayload,
  type QuitRoomResponse,
  type ReactionMessage,
  type RoomClosedPayload,
  type RoomJoinResponse,
  type RoomListItem,
  type RoomVisibility,
  type SettingsPayload,
  type StartTournamentPayload,
  type TournamentNation,
  type TournamentStage,
  type TournamentStageSlot
} from "@getaway-cards/shared";
import { randomBytes, randomUUID } from "node:crypto";
import type { GameDatabase } from "./db.js";

interface ManagedRoom {
  state: GameState;
  visibility: RoomVisibility;
  botTimer?: ReturnType<typeof setTimeout>;
  celebrationTimer?: ReturnType<typeof setTimeout>;
  cleanupAt?: number;
  cleanupReason?: RoomClosedPayload["reason"];
  cleanupTimer?: ReturnType<typeof setTimeout>;
  trickClearTimer?: ReturnType<typeof setTimeout>;
  turnTimer?: ReturnType<typeof setTimeout>;
}

interface SocketSeat {
  roomCode: string;
  participantId: string;
}

export interface SocialRoomInfo {
  roomCode: string;
  visibility: RoomVisibility;
  status: GameState["status"];
  roomMode: GameState["roomMode"];
  joinable: boolean;
  playerCount: number;
  maxPlayers: number;
  registeredProfileIds: string[];
}

export interface ReservedProfileRoom {
  room: SocialRoomInfo;
  connectionState: GameState["players"][number]["connectionState"];
  controlState: GameState["players"][number]["controlState"];
}

type RoomChangedHandler = (roomCode: string) => void | Promise<void>;
type RoomClosedHandler = (payload: RoomClosedPayload) => void | Promise<void>;
type RoomDatabase = Pick<GameDatabase, "recordSnapshot" | "deleteRoomSnapshot"> & {
  getRelationship?: GameDatabase["getRelationship"];
};

export interface RoomLifecycleOptions {
  matchResultsMs?: number;
  reconnectGraceMs?: number;
  playerReconnectGraceMs?: number;
  afkTimeoutsBeforeBot?: number;
  botActionDelayMs?: number;
}

export interface RoomCleanupPlan {
  delayMs: number;
  message: string;
  reason: RoomClosedPayload["reason"];
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WIN_CELEBRATION_MS = 2000;
const MATCH_RESULTS_MS = 12_000;
const RECONNECT_GRACE_MS = 5 * 60_000;
const PLAYER_RECONNECT_GRACE_MS = 120_000;
const AFK_TIMEOUTS_BEFORE_BOT = 2;
const TOURNAMENT_STAGE_DEFS = [
  { id: "group_stage", name: "Group Stage" },
  { id: "quarter_final", name: "Quarter Final" },
  { id: "semi_final", name: "Semi Final" },
  { id: "final", name: "Final" }
] as const;

export function getRoomCleanupPlan(
  state: GameState,
  options: RoomLifecycleOptions = {}
): RoomCleanupPlan | undefined {
  const matchComplete =
    state.status === "game_over" && state.tournament?.status !== "active";
  if (matchComplete) {
    return {
      delayMs: options.matchResultsMs ?? MATCH_RESULTS_MS,
      reason: "match_complete",
      message: "Match complete. The room closed automatically."
    };
  }

  const hasConnectedGuest =
    state.players.some((player) => !player.isBot && player.connected) ||
    state.spectators.some((spectator) => spectator.connected);
  if (!hasConnectedGuest) {
    return {
      delayMs: options.reconnectGraceMs ?? RECONNECT_GRACE_MS,
      reason: "abandoned",
      message: "The room closed after everyone disconnected."
    };
  }

  return undefined;
}

export class RoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly socketSeats = new Map<string, SocketSeat>();

  constructor(
    private readonly db: RoomDatabase,
    private readonly onRoomChanged: RoomChangedHandler,
    private readonly onRoomClosed: RoomClosedHandler = () => undefined,
    private readonly lifecycleOptions: RoomLifecycleOptions = {}
  ) {}

  createRoom(payload: CreateRoomPayload): RoomJoinResponse {
    const now = Date.now();
    const sessionId = payload.sessionId ?? randomUUID();
    const player = createPlayer({
      id: payload.identityId ?? randomUUID(),
      sessionId,
      username: payload.username,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      profileFrameId: payload.profileFrameId,
      profileImageVisibility: payload.profileImageVisibility,
      level: payload.level,
      accountType: payload.accountType,
      profileId: payload.profileId,
      rankBadge: payload.rankBadge
    }, now);
    const roomCode = this.generateUniqueRoomCode();
    const state = createGameState(roomCode, player, payload.settings, now);

    this.rooms.set(roomCode, {
      state,
      visibility: payload.visibility === "public" ? "public" : "private"
    });
    this.commitExisting(roomCode);

    return this.joinResponse(roomCode, player.id, sessionId);
  }

  quickPlay(payload: QuickPlayPayload): RoomJoinResponse {
    const response = this.createRoom({
      username: payload.username,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      profileFrameId: payload.profileFrameId,
      profileImageVisibility: payload.profileImageVisibility,
      level: payload.level,
      accountType: payload.accountType,
      profileId: payload.profileId,
      identityId: payload.identityId,
      rankBadge: payload.rankBadge,
      sessionId: payload.sessionId,
      settings: {
        ...payload.settings,
        maxPlayers: 4,
        targetScore: payload.settings?.targetScore ?? 5,
        turnSeconds: payload.settings?.turnSeconds ?? 20
      }
    });

    if (!response.ok || !response.roomCode || !response.playerId) {
      return response;
    }

    const room = this.rooms.get(response.roomCode);
    if (!room) {
      return { ok: false, error: "Room disappeared before quick play could start." };
    }

    room.state.roomMode = "quick";
    this.addBotsToRoom(room.state, 3, payload.difficulty ?? "normal");
    this.commitState(response.roomCode, startRound(room.state));

    return this.joinResponse(response.roomCode, response.playerId, response.sessionId);
  }

  playWithBots(payload: PlayWithBotsPayload): RoomJoinResponse {
    const botCount = Math.min(5, Math.max(1, Math.round(payload.botCount)));
    const response = this.createRoom({
      username: payload.username,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      profileFrameId: payload.profileFrameId,
      profileImageVisibility: payload.profileImageVisibility,
      level: payload.level,
      accountType: payload.accountType,
      profileId: payload.profileId,
      identityId: payload.identityId,
      rankBadge: payload.rankBadge,
      sessionId: payload.sessionId,
      settings: {
        ...payload.settings,
        maxPlayers: botCount + 1,
        targetScore: payload.settings?.targetScore ?? 5,
        turnSeconds: payload.settings?.turnSeconds ?? 20
      }
    });

    if (!response.ok || !response.roomCode || !response.playerId) {
      return response;
    }

    const room = this.rooms.get(response.roomCode);
    if (!room) {
      return { ok: false, error: "Room disappeared before bot play could start." };
    }

    room.state.roomMode = "bots";
    this.addBotsToRoom(room.state, botCount, payload.difficulty);
    this.commitState(response.roomCode, startRound(room.state));

    return this.joinResponse(response.roomCode, response.playerId, response.sessionId);
  }

  startTournament(payload: StartTournamentPayload): RoomJoinResponse {
    const now = Date.now();
    const nation = findTournamentNation(payload.nationCode) ?? NATION_OPTIONS[0]!;
    const sessionId = payload.sessionId ?? randomUUID();
    const player = createPlayer({
      id: payload.identityId ?? randomUUID(),
      sessionId,
      username: payload.username,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      profileFrameId: payload.profileFrameId,
      profileImageVisibility: payload.profileImageVisibility,
      level: payload.level,
      accountType: payload.accountType,
      profileId: payload.profileId,
      rankBadge: payload.rankBadge
    }, now);
    const roomCode = this.generateUniqueRoomCode();
    const state = createGameState(roomCode, player, {
      maxPlayers: 4,
      targetScore: 1,
      turnSeconds: Math.max(10, Math.min(30, Math.round(payload.turnSeconds ?? 20))),
      allowSpectators: true
    }, now);

    state.roomMode = "tournament";
    state.tournament = createTournamentState(player.id, nation, payload.difficulty, now, {
      eventId: payload.eventId,
      eventName: payload.eventName,
      reward: payload.reward,
      offline: payload.offline
    });
    this.prepareTournamentStage(state, now);

    this.rooms.set(roomCode, { state, visibility: "private" });
    if (payload.offline) {
      this.commitState(roomCode, startRound(state));
    } else {
      this.commitExisting(roomCode);
    }

    return this.joinResponse(roomCode, player.id, sessionId);
  }

  joinRoom(payload: JoinRoomPayload): RoomJoinResponse {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "No room exists for that code." };
    }

    const now = Date.now();
    const requestedSessionId = payload.sessionId;
    const existingPlayer =
      (requestedSessionId
        ? room.state.players.find((player) => player.sessionId === requestedSessionId)
        : undefined) ??
      (payload.profileId
        ? room.state.players.find((player) => player.profileId === payload.profileId)
        : undefined);
    const existingSpectator = requestedSessionId
      ? room.state.spectators.find((spectator) => spectator.sessionId === requestedSessionId)
      : undefined;

    if (existingPlayer) {
      if (existingPlayer.accountType === "registered" && existingPlayer.profileId !== payload.profileId) {
        return { ok: false, error: "Sign in to the original account to reclaim this seat." };
      }
      const wasDisconnected = !existingPlayer.connected;
      existingPlayer.connected = true;
      existingPlayer.connectionState = room.state.status === "playing" ? "reconnecting" : "online";
      existingPlayer.controlState = room.state.status === "playing" ? "temporary-bot" : "human";
      existingPlayer.reconnectDeadline = undefined;
      if (wasDisconnected) {
        existingPlayer.reliability.reconnects += 1;
      }
      existingPlayer.lastSeenAt = now;
      existingPlayer.username = payload.username.trim().slice(0, 24) || existingPlayer.username;
      existingPlayer.avatar = payload.avatar.trim().slice(0, 24) || existingPlayer.avatar;
      existingPlayer.avatarUrl = payload.avatarUrl ?? existingPlayer.avatarUrl;
      existingPlayer.profileFrameId = payload.profileFrameId ?? existingPlayer.profileFrameId;
      existingPlayer.profileImageVisibility = payload.profileImageVisibility ?? existingPlayer.profileImageVisibility;
      existingPlayer.level = payload.level ?? existingPlayer.level;
      existingPlayer.rankBadge = payload.rankBadge ?? existingPlayer.rankBadge;
      room.state.updatedAt = now;
      this.commitExisting(roomCode);
      return this.joinResponse(roomCode, existingPlayer.id, existingPlayer.sessionId);
    }

    if (existingSpectator) {
      existingSpectator.connected = true;
      existingSpectator.lastSeenAt = now;
      room.state.updatedAt = now;
      this.commitExisting(roomCode);
      return this.joinResponse(roomCode, existingSpectator.id, existingSpectator.sessionId);
    }

    if (room.state.status === "game_over" && room.state.tournament?.status !== "active") {
      return { ok: false, error: "That match is complete and the room is closing." };
    }

    const hasConnectedGuest =
      room.state.players.some((player) => !player.isBot && player.connected) ||
      room.state.spectators.some((spectator) => spectator.connected);
    if (!hasConnectedGuest) {
      return {
        ok: false,
        error: "That room is reserved for its disconnected players to reconnect."
      };
    }

    const sessionId = requestedSessionId ?? randomUUID();
    const shouldSpectate =
      payload.asSpectator ||
      room.state.status === "playing" ||
      room.state.players.length >= room.state.settings.maxPlayers;

    if (shouldSpectate) {
      if (!room.state.settings.allowSpectators) {
        return { ok: false, error: "Spectators are disabled in this room." };
      }

      const spectator = {
        id: randomUUID(),
        sessionId,
        profileId: payload.profileId,
        username: payload.username.trim().slice(0, 18) || "Spectator",
        avatar: payload.avatar.trim().slice(0, 24) || "Aero",
        avatarUrl: payload.avatarUrl,
        profileFrameId: payload.profileFrameId,
        profileImageVisibility: payload.profileImageVisibility ?? "everyone",
        level: payload.level,
        connected: true,
        joinedAt: now,
        lastSeenAt: now
      };
      room.state.spectators.push(spectator);
      this.pushEvent(room.state, "join", `${spectator.username} is watching the table.`, spectator.id, now);
      this.commitExisting(roomCode);
      return this.joinResponse(roomCode, spectator.id, sessionId);
    }

    const player = createPlayer({
      id: payload.identityId ?? randomUUID(),
      sessionId,
      username: payload.username,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      profileFrameId: payload.profileFrameId,
      profileImageVisibility: payload.profileImageVisibility,
      level: payload.level,
      accountType: payload.accountType,
      profileId: payload.profileId,
      rankBadge: payload.rankBadge
    }, now);
    room.state.players.push(player);
    this.pushEvent(room.state, "join", `${player.username} joined the room.`, player.id, now);
    this.commitExisting(roomCode);

    return this.joinResponse(roomCode, player.id, sessionId);
  }

  attachSocket(socketId: string, roomCode: string, participantId: string): void {
    const previousSeat = this.socketSeats.get(socketId);
    if (
      previousSeat &&
      (previousSeat.roomCode !== roomCode || previousSeat.participantId !== participantId)
    ) {
      this.disconnectSocket(socketId);
    }

    for (const [otherSocketId, seat] of this.socketSeats) {
      if (
        otherSocketId !== socketId &&
        seat.roomCode === roomCode &&
        seat.participantId === participantId
      ) {
        this.socketSeats.delete(otherSocketId);
      }
    }

    this.socketSeats.set(socketId, {
      roomCode,
      participantId
    });
  }

  disconnectSocket(socketId: string): string | undefined {
    const seat = this.socketSeats.get(socketId);
    if (!seat) {
      return undefined;
    }

    this.socketSeats.delete(socketId);
    const participantStillConnected = [...this.socketSeats.values()].some(
      (candidate) =>
        candidate.roomCode === seat.roomCode &&
        candidate.participantId === seat.participantId
    );
    if (participantStillConnected) {
      return seat.roomCode;
    }

    const room = this.rooms.get(seat.roomCode);
    if (!room) {
      return undefined;
    }

    const now = Date.now();
    const player = room.state.players.find((candidate) => candidate.id === seat.participantId);
    const spectator = room.state.spectators.find((candidate) => candidate.id === seat.participantId);

    if (player && !player.isBot) {
      player.connected = false;
      player.connectionState = "disconnected";
      player.controlState = "temporary-bot";
      player.autoPlayEnabled = false;
      player.reconnectDeadline = now + (this.lifecycleOptions.playerReconnectGraceMs ?? PLAYER_RECONNECT_GRACE_MS);
      player.reliability.disconnects += 1;
      player.ready = false;
      player.lastSeenAt = now;
      this.pushEvent(room.state, "leave", `${player.username} disconnected - bot playing temporarily.`, player.id, now);
      room.state.updatedAt = now;
      this.commitExisting(seat.roomCode);
      return seat.roomCode;
    }

    if (spectator) {
      spectator.connected = false;
      spectator.lastSeenAt = now;
      room.state.updatedAt = now;
      this.commitExisting(seat.roomCode);
      return seat.roomCode;
    }

    return undefined;
  }

  getSocketSeat(socketId: string): SocketSeat | undefined {
    return this.socketSeats.get(socketId);
  }

  getPublicState(roomCode: string, viewerId?: string): PublicGameState | undefined {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    return room
      ? toPublicGameState(
          room.state,
          viewerId,
          (ownerId, viewerProfileId) => this.db.getRelationship?.(viewerProfileId, ownerId) === "friends"
        )
      : undefined;
  }

  findActiveGame(profileId: string): ActiveGameSummary | undefined {
    for (const room of this.rooms.values()) {
      if (room.state.status === "game_over") continue;
      const player = room.state.players.find(
        (candidate) => !candidate.isBot && candidate.profileId === profileId
      );
      if (!player) continue;
      return {
        roomCode: room.state.roomCode,
        status: room.state.status,
        playerCount: room.state.players.length,
        maxPlayers: room.state.settings.maxPlayers,
        controlState: player.controlState,
        connectionState: player.connectionState
      };
    }
    return undefined;
  }

  rejoinActive(payload: Omit<JoinRoomPayload, "roomCode">): RoomJoinResponse {
    if (!payload.profileId) {
      return { ok: false, error: "Sign in to recover an active game from another device." };
    }
    const active = this.findActiveGame(payload.profileId);
    if (!active) {
      return { ok: false, error: "No active game was found for this account." };
    }
    return this.joinRoom({ ...payload, roomCode: active.roomCode });
  }

  getSocialRoomInfo(roomCode: string): SocialRoomInfo | undefined {
    const normalized = normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalized);
    if (!room) return undefined;
    const humanPlayers = room.state.players.filter((player) => !player.isBot);
    return {
      roomCode: normalized,
      visibility: room.visibility,
      status: room.state.status,
      roomMode: room.state.roomMode,
      joinable:
        room.state.status === "lobby" &&
        humanPlayers.length < room.state.settings.maxPlayers &&
        humanPlayers.some((player) => player.connected),
      playerCount: humanPlayers.length,
      maxPlayers: room.state.settings.maxPlayers,
      registeredProfileIds: humanPlayers
        .map((player) => player.profileId)
        .filter((profileId): profileId is string => Boolean(profileId))
    };
  }

  getReservedProfileRoom(profileId: string): ReservedProfileRoom | undefined {
    for (const room of this.rooms.values()) {
      const player = room.state.players.find(
        (candidate) => !candidate.isBot && candidate.profileId === profileId
      );
      if (!player || room.state.status === "game_over") continue;
      const socialRoom = this.getSocialRoomInfo(room.state.roomCode);
      if (!socialRoom) continue;
      return {
        room: socialRoom,
        connectionState: player.connectionState,
        controlState: player.controlState
      };
    }
    return undefined;
  }

  getSocketProfileId(socketId: string): string | undefined {
    const seat = this.socketSeats.get(socketId);
    if (!seat) return undefined;
    const room = this.rooms.get(seat.roomCode);
    return room?.state.players.find((player) => player.id === seat.participantId)?.profileId;
  }

  listRooms(): RoomListItem[] {
    return [...this.rooms.values()]
      .filter(({ state, visibility }) =>
        visibility === "public" &&
        state.status !== "game_over" &&
        (state.players.some((player) => !player.isBot && player.connected) ||
          state.spectators.some((spectator) => spectator.connected))
      )
      .map(({ state }) => ({
        roomCode: state.roomCode,
        status: state.status,
        playerCount: state.players.length,
        maxPlayers: state.settings.maxPlayers,
        spectatorCount: state.spectators.length,
        round: state.round
      }))
      .sort((left, right) => left.roomCode.localeCompare(right.roomCode));
  }

  addBot(payload: AddBotPayload, actorId: string): BasicResponse {
    const room = this.rooms.get(normalizeRoomCode(payload.roomCode));
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.hostId !== actorId) {
      return { ok: false, error: "Only the host can add bots." };
    }

    if (room.state.status === "playing") {
      return { ok: false, error: "Bots can be added between rounds." };
    }

    if (room.state.players.length >= room.state.settings.maxPlayers) {
      return { ok: false, error: "The room is already full." };
    }

    this.addBotsToRoom(room.state, 1, payload.difficulty);
    this.commitExisting(room.state.roomCode);
    return { ok: true };
  }

  setPlayerReady(roomCodeInput: string, actorId: string, ready: boolean): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.status !== "lobby") {
      return { ok: false, error: "Ready can only be changed in the lobby." };
    }

    const player = room.state.players.find((candidate) => candidate.id === actorId);
    if (!player) {
      return { ok: false, error: "Only seated players can ready up." };
    }

    if (player.isBot) {
      return { ok: false, error: "Bot seats are always ready." };
    }

    const now = Date.now();
    player.ready = ready;
    player.connected = true;
    player.lastSeenAt = now;
    room.state.updatedAt = now;
    this.pushEvent(room.state, "room", `${player.username} is ${ready ? "ready" : "not ready"}.`, actorId, now);
    this.commitExisting(roomCode);
    return { ok: true };
  }

  startGame(roomCodeInput: string, actorId: string): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.hostId !== actorId) {
      return { ok: false, error: "Only the host can start the game." };
    }

    const check = canStartGame(room.state);
    if (!check.valid) {
      return { ok: false, error: check.reason };
    }

    this.commitState(roomCode, startRound(room.state));
    return { ok: true };
  }

  nextRound(roomCodeInput: string, actorId: string): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.hostId !== actorId) {
      return { ok: false, error: "Only the host can continue the match." };
    }

    if (room.state.status === "playing") {
      return { ok: false, error: "The current round is still active." };
    }

    if (room.state.tournament) {
      if (room.state.tournament.status !== "active") {
        return {
          ok: false,
          error: room.state.tournament.status === "won"
            ? "Tournament complete. You are the champion."
            : "Tournament over. Start a new tournament from the home screen."
        };
      }

      this.prepareTournamentStage(room.state);
      room.state.roundSummaries = [];
      this.commitState(roomCode, startRound(room.state));
      return { ok: true };
    }

    if (room.state.status === "game_over") {
      return {
        ok: false,
        error: "The match is complete. Start a new table from the home screen."
      };
    }

    this.commitState(roomCode, startRound(room.state));
    return { ok: true };
  }

  takeNextPlayerCards(roomCodeInput: string, actorId: string, turnId?: string): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.winCelebration && room.state.winCelebration.endsAt > Date.now()) {
      return { ok: false, error: "Celebrating the safe player. Play resumes in a moment." };
    }

    if (room.state.turnId && turnId !== room.state.turnId) {
      return { ok: false, error: "That turn has already been completed." };
    }

    const actor = room.state.players.find((player) => player.id === actorId);
    if (actor && !actor.isBot && actor.controlState === "temporary-bot") {
      return { ok: false, error: "Bot control is active. Take control before taking another hand." };
    }

    try {
      this.commitState(roomCode, applyTakeNextPlayerCards(room.state, actorId));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "The hand transfer was rejected by the rules engine."
      };
    }
  }

  performMove(
    roomCodeInput: string,
    actorId: string,
    move: Parameters<typeof applyMove>[2],
    turnId?: string
  ): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.winCelebration && room.state.winCelebration.endsAt > Date.now()) {
      return { ok: false, error: "Celebrating the winner. Play resumes in a moment." };
    }

    if (room.state.turnId && turnId !== room.state.turnId) {
      return { ok: false, error: "That turn has already been completed." };
    }

    const actor = room.state.players.find((player) => player.id === actorId);
    if (actor && !actor.isBot && actor.controlState === "temporary-bot") {
      return { ok: false, error: "Bot control is active. Take control before playing a card." };
    }

    try {
      this.commitState(roomCode, applyMove(room.state, actorId, move));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Move rejected by the rules engine."
      };
    }
  }

  takeControl(roomCodeInput: string, actorId: string, turnId?: string): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    const player = room.state.players.find((candidate) => candidate.id === actorId);
    if (!player || player.isBot) {
      return { ok: false, error: "Only the human assigned to this seat can take control." };
    }
    if (!player.connected) {
      return { ok: false, error: "Reconnect to the room before taking control." };
    }
    if (turnId && room.state.turnId && turnId !== room.state.turnId) {
      return { ok: false, error: "The table moved to a new turn. Try Take Control again." };
    }

    const now = Date.now();
    player.controlState = "human";
    player.connectionState = "online";
    player.autoPlayEnabled = false;
    player.consecutiveTimeouts = 0;
    player.missedTurnStreak = 0;
    player.reconnectDeadline = undefined;
    if (room.state.status === "playing" && room.state.activePlayerId === actorId) {
      this.resetTurnClock(room.state, now);
    }
    this.pushEvent(room.state, "join", `${player.username} took control of the seat.`, player.id, now);
    this.commitExisting(roomCode);
    return { ok: true };
  }

  setAutoPlay(roomCodeInput: string, actorId: string, enabled: boolean): BasicResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    const player = room.state.players.find((candidate) => candidate.id === actorId);
    if (!player || player.isBot || !player.connected) {
      return { ok: false, error: "Auto Play is available only for your connected human seat." };
    }

    if (!enabled) {
      return this.takeControl(roomCode, actorId);
    }

    const now = Date.now();
    player.autoPlayEnabled = true;
    player.controlState = "temporary-bot";
    player.connectionState = "afk";
    player.reliability.temporaryBotActivations += 1;
    this.pushEvent(room.state, "bot", `${player.username} enabled Auto Play.`, player.id, now);
    this.commitExisting(roomCode);
    return { ok: true };
  }

  updateSettings(payload: SettingsPayload, actorId: string): BasicResponse {
    const room = this.rooms.get(normalizeRoomCode(payload.roomCode));
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.hostId !== actorId) {
      return { ok: false, error: "Only the host can change settings." };
    }

    if (room.state.status === "playing") {
      return { ok: false, error: "Settings can be changed between rounds." };
    }

    room.state.settings = normalizeSettings({
      ...room.state.settings,
      ...payload.settings
    });
    this.pushEvent(room.state, "settings", "Room settings were updated.", actorId);
    this.commitExisting(room.state.roomCode);
    return { ok: true };
  }

  quitRoom(roomCodeInput: string, actorId: string, replaceWithBot = false): QuitRoomResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    const now = Date.now();
    const spectatorIndex = room.state.spectators.findIndex((spectator) => spectator.id === actorId);
    if (spectatorIndex >= 0) {
      const [spectator] = room.state.spectators.splice(spectatorIndex, 1);
      this.removeSocketSeatsForParticipant(roomCode, actorId);
      this.pushEvent(room.state, "leave", `${spectator?.username ?? "A spectator"} left the rail.`, actorId, now);
      this.commitExisting(roomCode);
      return { ok: true };
    }

    const playerIndex = room.state.players.findIndex((player) => player.id === actorId);
    const player = room.state.players[playerIndex];
    if (!player) {
      return { ok: false, error: "Only seated players can quit the game." };
    }

    if (replaceWithBot) {
      if (room.state.status === "game_over") {
        return { ok: false, error: "The match has finished, so this seat can no longer be replaced." };
      }

      const originalName = player.username;
      const originalAvatar = player.avatar;
      const spectatorSessionId = player.sessionId ?? randomUUID();
      player.sessionId = undefined;
      player.username = originalName.endsWith(" Bot") ? originalName : `${originalName} Bot`;
      player.connected = true;
      player.connectionState = "online";
      player.controlState = "human";
      player.autoPlayEnabled = false;
      player.consecutiveTimeouts = 0;
      player.reconnectDeadline = undefined;
      player.ready = true;
      player.isBot = true;
      player.botDifficulty = player.botDifficulty ?? "normal";
      player.lastSeenAt = now;
      this.removeSocketSeatsForParticipant(roomCode, actorId);

      const spectator = {
        id: randomUUID(),
        sessionId: spectatorSessionId,
        replacedPlayerId: player.id,
        profileId: player.profileId,
        username: originalName,
        avatar: originalAvatar,
        avatarUrl: player.avatarUrl,
        profileFrameId: player.profileFrameId,
        profileImageVisibility: player.profileImageVisibility,
        level: player.level,
        connected: true,
        joinedAt: now,
        lastSeenAt: now
      };
      room.state.spectators.push(spectator);

      if (room.state.hostId === actorId) {
        room.state.hostId =
          room.state.players.find((candidate) => !candidate.isBot && candidate.id !== actorId)?.id ??
          player.id;
      }

      this.pushEvent(
        room.state,
        "bot",
        `${originalName} handed the seat to a bot. The hand continues.`,
        player.id,
        now
      );
      this.commitExisting(roomCode);
      const spectatorState = this.getPublicState(roomCode, spectator.id);
      return {
        ok: Boolean(spectatorState),
        roomCode,
        playerId: spectator.id,
        sessionId: spectatorSessionId,
        state: spectatorState,
        stayedAsSpectator: true,
        error: spectatorState ? undefined : "Room not found."
      };
    }

    const quitterName = player.username;
    room.state.players.splice(playerIndex, 1);
    room.state.escapeOrder = room.state.escapeOrder.filter((playerId) => playerId !== actorId);
    room.state.timedOutPlayerIds = (room.state.timedOutPlayerIds ?? []).filter((playerId) => playerId !== actorId);
    room.state.trick = room.state.trick.filter((play) => play.playerId !== actorId);
    room.state.recentPlayedCardKeys = Object.fromEntries(
      Object.entries(room.state.recentPlayedCardKeys ?? {}).filter(([playerId]) => playerId !== actorId)
    );
    if (room.state.recentPickup?.playerId === actorId) {
      room.state.recentPickup = undefined;
    }
    this.removeSocketSeatsForParticipant(roomCode, actorId);

    if (room.state.players.length === 0) {
      this.closeRoom(roomCode, {
        roomCode,
        reason: "empty",
        message: "The room closed because no players remain."
      });
      return { ok: true };
    }

    if (room.state.hostId === actorId) {
      room.state.hostId = room.state.players.find((candidate) => !candidate.isBot)?.id ?? room.state.players[0]!.id;
    }

    this.pushEvent(
      room.state,
      "leave",
      `${quitterName} quit the game and is Bhabhi for leaving the table.`,
      actorId,
      now
    );

    if (room.state.status === "playing") {
      this.recoverAfterPlayerExit(room.state, playerIndex, now);
    }

    room.state.updatedAt = now;
    this.commitExisting(roomCode);
    return { ok: true };
  }

  reclaimBotSeat(roomCodeInput: string, actorId: string): QuitRoomResponse {
    const roomCode = normalizeRoomCode(roomCodeInput);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.state.status === "game_over") {
      return { ok: false, error: "The match has finished. This seat can no longer be rejoined." };
    }

    const spectatorIndex = room.state.spectators.findIndex(
      (spectator) => spectator.id === actorId
    );
    const spectator = room.state.spectators[spectatorIndex];
    if (!spectator?.replacedPlayerId) {
      return { ok: false, error: "You do not have a bot-controlled seat to reclaim." };
    }

    const player = room.state.players.find(
      (candidate) => candidate.id === spectator.replacedPlayerId
    );
    if (!player?.isBot) {
      return { ok: false, error: "That seat is no longer controlled by a bot." };
    }

    const now = Date.now();
    const sessionId = spectator.sessionId ?? randomUUID();
    player.sessionId = sessionId;
    player.username = spectator.username;
    player.avatar = spectator.avatar;
    player.connected = true;
    player.connectionState = "online";
    player.controlState = "human";
    player.autoPlayEnabled = false;
    player.consecutiveTimeouts = 0;
    player.reconnectDeadline = undefined;
    player.ready = false;
    player.isBot = false;
    player.botDifficulty = undefined;
    player.missedTurnStreak = 0;
    player.lastSeenAt = now;

    room.state.spectators.splice(spectatorIndex, 1);
    this.removeSocketSeatsForParticipant(roomCode, actorId);

    if (room.state.status === "playing" && room.state.activePlayerId === player.id) {
      this.resetTurnClock(room.state, now);
    }

    room.state.updatedAt = now;
    this.pushEvent(
      room.state,
      "join",
      `${player.username} reclaimed the seat from the bot.`,
      player.id,
      now
    );
    this.commitExisting(roomCode);

    return this.joinResponse(roomCode, player.id, sessionId);
  }

  addChat(roomCodeInput: string, actorId: string, body: string): ChatMessage | undefined {
    const room = this.rooms.get(normalizeRoomCode(roomCodeInput));
    if (!room) {
      return undefined;
    }

    const sender = this.findParticipant(room.state, actorId);
    const trimmed = body.trim().slice(0, 240);
    if (!sender || trimmed.length === 0) {
      return undefined;
    }

    const message: ChatMessage = {
      id: createId("chat"),
      at: Date.now(),
      playerId: actorId,
      username: sender.username,
      avatar: sender.avatar,
      body: trimmed
    };
    room.state.chatMessages = [message, ...room.state.chatMessages].slice(0, 60);
    room.state.updatedAt = message.at;
    this.commitExisting(room.state.roomCode);
    return message;
  }

  addReaction(roomCodeInput: string, actorId: string, emoji: string): ReactionMessage | undefined {
    const room = this.rooms.get(normalizeRoomCode(roomCodeInput));
    if (!room) {
      return undefined;
    }

    const sender = this.findParticipant(room.state, actorId);
    const trimmed = emoji.trim().slice(0, 16);
    if (!sender || trimmed.length === 0) {
      return undefined;
    }

    const reaction: ReactionMessage = {
      id: createId("reaction"),
      at: Date.now(),
      playerId: actorId,
      username: sender.username,
      emoji: trimmed
    };
    room.state.reactions = [reaction, ...room.state.reactions].slice(0, 20);
    room.state.updatedAt = reaction.at;
    this.commitExisting(room.state.roomCode);
    return reaction;
  }

  private commitState(roomCode: string, state: GameState): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    room.state = state;
    this.advanceTournamentIfNeeded(room.state);
    this.commitExisting(roomCode);
  }

  private commitExisting(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    this.db.recordSnapshot(room.state);
    this.scheduleRoom(roomCode);
    this.scheduleCleanup(roomCode);
    void this.onRoomChanged(roomCode);
  }

  private scheduleCleanup(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    const plan = getRoomCleanupPlan(room.state, this.lifecycleOptions);
    if (!plan) {
      this.clearCleanupTimer(room);
      return;
    }

    if (room.cleanupReason !== plan.reason || room.cleanupAt === undefined) {
      this.clearCleanupTimer(room);
      room.cleanupReason = plan.reason;
      room.cleanupAt = Date.now() + plan.delayMs;
    }

    if (room.cleanupTimer) {
      return;
    }

    room.cleanupTimer = setTimeout(() => {
      const latest = this.rooms.get(roomCode);
      if (!latest) {
        return;
      }

      latest.cleanupTimer = undefined;
      const latestPlan = getRoomCleanupPlan(latest.state, this.lifecycleOptions);
      if (!latestPlan || latestPlan.reason !== latest.cleanupReason) {
        this.clearCleanupTimer(latest);
        return;
      }

      this.closeRoom(roomCode, {
        roomCode,
        reason: latestPlan.reason,
        message: latestPlan.message
      });
    }, Math.max(0, room.cleanupAt - Date.now()));
  }

  private clearCleanupTimer(room: ManagedRoom): void {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }
    room.cleanupTimer = undefined;
    room.cleanupAt = undefined;
    room.cleanupReason = undefined;
  }

  private closeRoom(roomCode: string, payload: RoomClosedPayload): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    for (const timer of [
      room.botTimer,
      room.celebrationTimer,
      room.cleanupTimer,
      room.trickClearTimer,
      room.turnTimer
    ]) {
      if (timer) {
        clearTimeout(timer);
      }
    }

    for (const [socketId, seat] of this.socketSeats) {
      if (seat.roomCode === roomCode) {
        this.socketSeats.delete(socketId);
      }
    }

    this.rooms.delete(roomCode);
    this.db.deleteRoomSnapshot(roomCode);
    void this.onRoomClosed(payload);
  }

  private scheduleRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = undefined;
    }

    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = undefined;
    }

    if (room.celebrationTimer) {
      clearTimeout(room.celebrationTimer);
      room.celebrationTimer = undefined;
    }

    if (room.trickClearTimer) {
      clearTimeout(room.trickClearTimer);
      room.trickClearTimer = undefined;
    }

    if (room.state.lastTrick) {
      const trickId = room.state.lastTrick.id;
      const clearDelay = Math.max(0, TRICK_REVEAL_MS - (Date.now() - room.state.lastTrick.resolvedAt));
      room.trickClearTimer = setTimeout(() => {
        const latest = this.rooms.get(roomCode);
        if (!latest || latest.state.lastTrick?.id !== trickId) {
          return;
        }

        latest.state.lastTrick = undefined;
        latest.state.updatedAt = Date.now();
        this.commitExisting(roomCode);
      }, clearDelay);
    }

    if (room.state.winCelebration) {
      const celebrationId = room.state.winCelebration.id;
      const celebrationDelay = Math.max(0, room.state.winCelebration.endsAt - Date.now());
      if (celebrationDelay > 0) {
        room.celebrationTimer = setTimeout(() => {
          const latest = this.rooms.get(roomCode);
          if (!latest || latest.state.winCelebration?.id !== celebrationId) {
            return;
          }

          latest.state.winCelebration = undefined;
          latest.state.updatedAt = Date.now();
          this.commitExisting(roomCode);
        }, celebrationDelay);
        return;
      }

      room.state.winCelebration = undefined;
    }

    if (room.state.status !== "playing" || !room.state.activePlayerId) {
      return;
    }

    const activePlayer = room.state.players.find((player) => player.id === room.state.activePlayerId);
    if (!activePlayer) {
      return;
    }

    const now = Date.now();
    const turnId = room.state.turnId ?? createId("turn");
    room.state.turnId = turnId;
    room.state.turnDeadline = room.state.turnDeadline ?? room.state.turnEndsAt;
    const turnDelay = Math.max(300, (room.state.turnDeadline ?? room.state.turnEndsAt ?? now + 1000) - now);

    room.turnTimer = setTimeout(() => {
      const latest = this.rooms.get(roomCode);
      if (!latest || latest.state.status !== "playing") {
        return;
      }

      if (latest.state.activePlayerId !== activePlayer.id || latest.state.turnId !== turnId) {
        return;
      }

      const nextState = applyTimeoutAutoPlay(
        latest.state,
        activePlayer.id,
        this.lifecycleOptions.afkTimeoutsBeforeBot ?? AFK_TIMEOUTS_BEFORE_BOT
      );
      this.commitState(roomCode, nextState);
    }, turnDelay + 50);

    const temporaryController =
      !activePlayer.isBot &&
      (activePlayer.controlState === "temporary-bot" || !activePlayer.connected || activePlayer.autoPlayEnabled);
    if (activePlayer.isBot || temporaryController) {
      const dealDelay = room.state.dealEndsAt
        ? Math.max(0, room.state.dealEndsAt - now)
        : 0;
      const revealDelay = room.state.lastTrick
        ? Math.max(0, TRICK_REVEAL_MS - (now - room.state.lastTrick.resolvedAt))
        : 0;
      const configuredBotDelay = this.lifecycleOptions.botActionDelayMs;
      const botDelay = configuredBotDelay ?? Math.min(
        turnDelay - 100,
        dealDelay + revealDelay + 850 + Math.floor(Math.random() * 900)
      );
      room.botTimer = setTimeout(() => {
        const latest = this.rooms.get(roomCode);
        if (!latest || latest.state.status !== "playing" || latest.state.turnId !== turnId) {
          return;
        }

        if (latest.state.dealEndsAt && Date.now() < latest.state.dealEndsAt) {
          this.scheduleRoom(roomCode);
          return;
        }

        const bot = latest.state.players.find((player) => player.id === latest.state.activePlayerId);
        const botControlsSeat = Boolean(
          bot && (bot.isBot || bot.controlState === "temporary-bot" || !bot.connected || bot.autoPlayEnabled)
        );
        if (!bot || !botControlsSeat) {
          return;
        }

        try {
          const move = chooseBotMove(latest.state, bot.id, bot.botDifficulty ?? "normal");
          const nextState = bot.isBot
            ? applyMove(latest.state, bot.id, move)
            : applyTemporaryBotMove(latest.state, bot.id, move);
          this.commitState(roomCode, nextState);
        } catch {
          this.commitState(
            roomCode,
            applyTimeoutAutoPlay(
              latest.state,
              bot.id,
              this.lifecycleOptions.afkTimeoutsBeforeBot ?? AFK_TIMEOUTS_BEFORE_BOT
            )
          );
        }
      }, Math.max(250, botDelay));
    }
  }

  private recoverAfterPlayerExit(state: GameState, previousIndex: number, now: number): void {
    if (state.players.length <= 1) {
      this.finishRoundAfterExit(state, state.players[0], now);
      state.status = "game_over";
      state.championId = state.players[0]?.id;
      return;
    }

    if (state.trick.length > 0 && this.trickHasNoPendingPlayers(state)) {
      this.resolveTrickAfterExit(state, now);
      return;
    }

    const playedIds = new Set([
      ...state.trick.map((play) => play.playerId),
      ...(state.timedOutPlayerIds ?? [])
    ]);
    const activePlayer = state.players.find((player) => player.id === state.activePlayerId);
    const activeCannotPlay =
      !activePlayer ||
      activePlayer.hand.length === 0 ||
      (state.trick.length > 0 && playedIds.has(activePlayer.id));

    if (activeCannotPlay) {
      const previousSeat = previousIndex - state.direction;
      const pendingPlayer = this.nextPlayerAfterIndex(
        state,
        previousSeat,
        (player) => player.hand.length > 0 && !playedIds.has(player.id)
      );
      const fallbackPlayer = this.nextPlayerAfterIndex(
        state,
        previousSeat,
        (player) => player.hand.length > 0
      );
      state.activePlayerId = pendingPlayer?.id ?? fallbackPlayer?.id;
    }

    if (!state.activePlayerId) {
      this.finishRoundAfterExit(state, undefined, now);
      return;
    }

    this.setTurnClockAfterExit(state, now);
  }

  private trickHasNoPendingPlayers(state: GameState): boolean {
    const playedIds = new Set([
      ...state.trick.map((play) => play.playerId),
      ...(state.timedOutPlayerIds ?? [])
    ]);
    return state.players.every((player) => player.hand.length === 0 || playedIds.has(player.id));
  }

  private resolveTrickAfterExit(state: GameState, now: number): void {
    const leadSuit = state.leadSuit ?? state.trick[0]?.card.suit;
    if (!leadSuit || state.trick.length === 0) {
      state.trick = [];
      state.timedOutPlayerIds = [];
      state.leadSuit = undefined;
      state.activePlayerId = this.nextPlayerAfterIndex(state, -state.direction, (player) => player.hand.length > 0)?.id;
      this.setTurnClockAfterExit(state, now);
      return;
    }

    const ledSuitPlays = state.trick.filter((play) => play.card.suit === leadSuit);
    const highPlay = (ledSuitPlays.length > 0 ? ledSuitPlays : state.trick).reduce((best, play) =>
      rankValue(play.card.rank) > rankValue(best.card.rank) ? play : best
    );
    const hasThulla = state.trick.some((play) => play.offSuit);
    const trickCards = state.trick.map((play) => play.card);

    state.lastTrick = {
      id: createId("trick"),
      plays: state.trick.map((play) => ({ ...play, card: { ...play.card } })),
      leadSuit,
      winnerId: highPlay.playerId,
      winnerName: highPlay.username,
      hasThulla,
      cleared: !hasThulla,
      pickedUpById: hasThulla ? highPlay.playerId : undefined,
      pickedUpByName: hasThulla ? highPlay.username : undefined,
      cardCount: trickCards.length,
      resolvedAt: now
    };

    if (hasThulla) {
      const punished = state.players.find((player) => player.id === highPlay.playerId);
      if (punished) {
        punished.hand = sortCards([...punished.hand, ...trickCards]);
        state.recentPickup = {
          playerId: punished.id,
          cardIds: trickCards.map((card) => card.id),
          at: now
        };
        this.pushEvent(
          state,
          "penalty",
          `Dhulla! ${punished.username} picked up ${trickCards.length} card${trickCards.length === 1 ? "" : "s"}.`,
          punished.id,
          now
        );
      }
    } else {
      state.discardPile.push(...trickCards);
      state.recentPickup = undefined;
      this.pushEvent(
        state,
        "play",
        `${highPlay.username} cleared the trick after the table change.`,
        highPlay.playerId,
        now
      );
    }

    state.trick = [];
    state.timedOutPlayerIds = [];
    state.leadSuit = undefined;
    state.trickLeaderId = undefined;
    this.markEscapesAfterExit(state, now);

    const stillHolding = state.players.filter((player) => player.hand.length > 0);
    if (stillHolding.length <= 1) {
      this.finishRoundAfterExit(state, stillHolding[0], now);
      return;
    }

    const leader = state.players.find((player) => player.id === highPlay.playerId && player.hand.length > 0);
    state.activePlayerId =
      leader?.id ??
      this.nextPlayerAfterId(state, highPlay.playerId, (player) => player.hand.length > 0)?.id ??
      stillHolding[0]!.id;
    this.setTurnClockAfterExit(state, now);
  }

  private finishRoundAfterExit(state: GameState, loser: GameState["players"][number] | undefined, now: number): void {
    if (state.players.length === 0) {
      return;
    }

    this.markEscapesAfterExit(state, now);
    const bhabhi = loser ?? state.players.find((player) => player.hand.length > 0) ?? state.players[0]!;
    const escapedIds = new Set(state.escapeOrder);

    for (const player of state.players) {
      player.ready = player.isBot;
      if (player.id !== bhabhi.id) {
        player.score += 1;
        player.roundWins += 1;
      }
    }

    state.bhabhiId = bhabhi.id;
    state.winnerId =
      state.escapeOrder[0] ??
      state.players.find((player) => player.id !== bhabhi.id)?.id ??
      bhabhi.id;
    state.activePlayerId = undefined;
    state.turnStartedAt = undefined;
    state.turnDeadline = undefined;
    state.turnEndsAt = undefined;
    state.turnId = undefined;
    state.dealEndsAt = undefined;
    state.pendingDraw = 0;
    state.declaredSuit = undefined;
    state.leadSuit = undefined;
    state.trickLeaderId = undefined;
    state.timedOutPlayerIds = [];

    const summary = {
      id: createId("round"),
      round: state.round,
      at: now,
      winnerId: state.winnerId,
      winnerName: state.players.find((player) => player.id === state.winnerId)?.username ?? "Escaped players",
      pointsAwarded: 1,
      scoreLines: state.players.map((player) => ({
        playerId: player.id,
        username: player.username,
        cardsLeft: player.hand.length,
        pointsLeft: player.hand.length,
        escaped: escapedIds.has(player.id) || player.id !== bhabhi.id,
        isBhabhi: player.id === bhabhi.id
      }))
    };

    state.roundSummaries = [summary, ...state.roundSummaries].slice(0, 20);

    const escapeRanks = new Map(state.escapeOrder.map((playerId, index) => [playerId, index]));
    const champion = state.players
      .slice()
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        const leftEscapeRank = escapeRanks.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightEscapeRank = escapeRanks.get(right.id) ?? Number.POSITIVE_INFINITY;
        return leftEscapeRank - rightEscapeRank;
      })[0];

    if (champion && (champion.score >= state.settings.targetScore || state.players.length <= 1)) {
      state.status = "game_over";
      state.championId = champion.id;
      this.pushEvent(state, "game", `${champion.username} won the match after a player quit.`, champion.id, now);
    } else {
      state.status = "round_over";
      this.pushEvent(
        state,
        "round",
        `${bhabhi.username} is Bhabhi with ${bhabhi.hand.length} card${bhabhi.hand.length === 1 ? "" : "s"} left.`,
        bhabhi.id,
        now
      );
    }
  }

  private markEscapesAfterExit(state: GameState, now: number): void {
    const escaped = new Set(state.escapeOrder);
    for (const player of state.players) {
      if (player.hand.length === 0 && !escaped.has(player.id)) {
        state.escapeOrder.push(player.id);
        escaped.add(player.id);
        if (!state.winCelebration || state.winCelebration.endsAt <= now) {
          state.winCelebration = {
            id: createId("win"),
            playerId: player.id,
            username: player.username,
            rank: state.escapeOrder.length,
            startedAt: now,
            endsAt: now + WIN_CELEBRATION_MS
          };
        }
        this.pushEvent(state, "round", `${player.username} escaped the hand.`, player.id, now);
      }
    }
  }

  private nextPlayerAfterId(
    state: GameState,
    playerId: string,
    predicate: (player: GameState["players"][number]) => boolean
  ): GameState["players"][number] | undefined {
    const index = state.players.findIndex((player) => player.id === playerId);
    return this.nextPlayerAfterIndex(state, index, predicate);
  }

  private nextPlayerAfterIndex(
    state: GameState,
    fromIndex: number,
    predicate: (player: GameState["players"][number]) => boolean
  ): GameState["players"][number] | undefined {
    if (state.players.length === 0) {
      return undefined;
    }

    for (let step = 1; step <= state.players.length; step += 1) {
      const candidate = state.players[modulo(fromIndex + step * state.direction, state.players.length)];
      if (candidate && predicate(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private setTurnClockAfterExit(state: GameState, now: number): void {
    const startAt = Math.max(
      now,
      state.winCelebration?.endsAt ?? 0,
      state.dealEndsAt ?? 0,
      state.lastTrick ? state.lastTrick.resolvedAt + TRICK_REVEAL_MS : 0
    );
    state.turnStartedAt = startAt;
    state.turnDeadline = startAt + state.settings.turnSeconds * 1000;
    state.turnEndsAt = state.turnDeadline;
    state.turnId = createId("turn");
  }

  private resetTurnClock(state: GameState, now: number): void {
    state.turnStartedAt = now;
    state.turnDeadline = now + state.settings.turnSeconds * 1000;
    state.turnEndsAt = state.turnDeadline;
    state.turnId = createId("turn");
  }

  private removeSocketSeatsForParticipant(roomCode: string, participantId: string): void {
    for (const [socketId, seat] of this.socketSeats) {
      if (seat.roomCode === roomCode && seat.participantId === participantId) {
        this.socketSeats.delete(socketId);
      }
    }
  }

  private addBotsToRoom(state: GameState, count: number, difficulty: BotDifficulty): void {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      if (state.players.length >= state.settings.maxPlayers) {
        return;
      }

      const botNumber = state.players.filter((player) => player.isBot).length;
      const name = BOT_NAMES[botNumber % BOT_NAMES.length] ?? "Bot";
      const avatar = AVATAR_PRESETS[(botNumber + 2) % AVATAR_PRESETS.length] ?? "Bolt";
      const bot = createPlayer({
        id: randomUUID(),
        username: `${name} Bot`,
        avatar,
        isBot: true,
        botDifficulty: difficulty
      }, now);
      state.players.push(bot);
      this.pushEvent(state, "bot", `${bot.username} joined as a ${difficulty} bot.`, bot.id, now);
    }
  }

  private prepareTournamentStage(state: GameState, now = Date.now()): void {
    const tournament = state.tournament;
    if (!tournament) {
      return;
    }

    const stage = tournament.stages[tournament.stageIndex];
    const human =
      state.players.find((player) => player.id === tournament.playerId && !player.isBot) ??
      state.players.find((player) => !player.isBot) ??
      state.players[0];
    if (!stage || !human) {
      return;
    }

    const playerNation = findTournamentNation(tournament.playerNationCode) ?? {
      code: tournament.playerNationCode,
      name: tournament.playerNationName,
      flag: "🏳️"
    };
    if (stage.slots.length < 4) {
      stage.slots = createTournamentStageSlots(tournament, stage.stageNumber - 1, playerNation, human.id, now);
    }

    const resetHuman: GameState["players"][number] = {
      ...human,
      hand: [],
      score: 0,
      roundWins: 0,
      connected: true,
      connectionState: "online",
      controlState: "human",
      autoPlayEnabled: false,
      consecutiveTimeouts: 0,
      reconnectDeadline: undefined,
      ready: false,
      lastSeenAt: now
    };
    tournament.playerId = resetHuman.id;
    state.hostId = resetHuman.id;

    stage.slots = stage.slots.map((slot) =>
      slot.isUser
        ? {
            ...slot,
            playerId: resetHuman.id,
            username: resetHuman.username
          }
        : slot
    );

    const players: GameState["players"] = [resetHuman];
    stage.slots = stage.slots.map((slot) => {
      if (slot.isUser) {
        return {
          ...slot,
          playerId: resetHuman.id,
          username: resetHuman.username
        };
      }

      const bot = createPlayer({
        id: randomUUID(),
        username: `${slot.name} Bot`,
        avatar: slot.code,
        isBot: true,
        botDifficulty: tournament.difficulty
      }, now);
      players.push(bot);
      return {
        ...slot,
        playerId: bot.id,
        username: bot.username
      };
    });

    state.players = players;
    state.settings = normalizeSettings({
      maxPlayers: 4,
      targetScore: 1,
      turnSeconds: state.settings.turnSeconds,
      allowSpectators: true
    });
    tournament.updatedAt = now;
    this.pushEvent(
      state,
      "start",
      `${stage.name}: ${tournament.playerNationName} enters the table.`,
      resetHuman.id,
      now
    );
  }

  private advanceTournamentIfNeeded(state: GameState, now = Date.now()): void {
    const tournament = state.tournament;
    if (!tournament || tournament.status !== "active" || state.status === "playing" || !state.winnerId) {
      return;
    }

    const stage = tournament.stages[tournament.stageIndex];
    if (!stage || stage.status !== "active") {
      return;
    }

    const winner = state.players.find((player) => player.id === state.winnerId);
    if (!winner) {
      return;
    }

    const winnerSlot =
      stage.slots.find((slot) => slot.playerId === winner.id) ??
      stage.slots.find((slot) => slot.isUser && winner.id === tournament.playerId);
    stage.winnerNationCode = winnerSlot?.code;
    stage.winnerName = winner.username;
    stage.completedAt = now;

    if (winner.id === tournament.playerId) {
      stage.status = "complete";
      if (tournament.stageIndex >= tournament.stages.length - 1) {
        tournament.status = "won";
        this.pushEvent(state, "game", `${winner.username} won the tournament for ${tournament.playerNationName}.`, winner.id, now);
      } else {
        tournament.stageIndex += 1;
        const nextStage = tournament.stages[tournament.stageIndex];
        if (nextStage) {
          nextStage.status = "active";
        }
        this.pushEvent(state, "game", `${winner.username} advanced to ${nextStage?.name ?? "the next stage"}.`, winner.id, now);
      }
    } else {
      stage.status = "eliminated";
      tournament.status = "eliminated";
      this.pushEvent(state, "game", `${winner.username} eliminated ${tournament.playerNationName} from the tournament.`, winner.id, now);
    }

    tournament.updatedAt = now;
  }

  private findParticipant(
    state: GameState,
    participantId: string
  ): { username: string; avatar: string } | undefined {
    return (
      state.players.find((player) => player.id === participantId) ??
      state.spectators.find((spectator) => spectator.id === participantId)
    );
  }

  private joinResponse(
    roomCode: string,
    participantId: string,
    sessionId?: string
  ): RoomJoinResponse {
    const state = this.getPublicState(roomCode, participantId);
    return {
      ok: Boolean(state),
      roomCode,
      playerId: participantId,
      sessionId,
      state,
      error: state ? undefined : "Room not found."
    };
  }

  private pushEvent(
    state: GameState,
    type: GameState["history"][number]["type"],
    message: string,
    playerId?: string,
    now = Date.now()
  ): void {
    state.history = [
      {
        id: createId("event"),
        at: now,
        type,
        message,
        playerId
      },
      ...state.history
    ].slice(0, 80);
    state.updatedAt = now;
  }

  private generateUniqueRoomCode(): string {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    return code;
  }
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function createTournamentState(
  playerId: string,
  playerNation: TournamentNation,
  difficulty: BotDifficulty,
  now: number,
  event: Pick<StartTournamentPayload, "eventId" | "eventName" | "reward" | "offline"> = {}
): NonNullable<GameState["tournament"]> {
  const tournament: NonNullable<GameState["tournament"]> = {
    id: `tournament_${now.toString(36)}_${randomBytes(3).toString("hex")}`,
    eventId: event.eventId?.trim().slice(0, 64),
    eventName: event.eventName?.trim().slice(0, 64),
    reward: event.reward?.trim().slice(0, 96),
    offline: event.offline,
    status: "active",
    playerId,
    playerNationCode: playerNation.code,
    playerNationName: playerNation.name,
    difficulty,
    stageIndex: 0,
    stages: [],
    startedAt: now,
    updatedAt: now
  };

  tournament.stages = TOURNAMENT_STAGE_DEFS.map((definition, stageIndex) => ({
    id: definition.id,
    name: definition.name,
    stageNumber: stageIndex + 1,
    status: stageIndex === 0 ? "active" : "locked",
    slots: stageIndex === 0
      ? createTournamentStageSlots(tournament, stageIndex, playerNation, playerId, now)
      : []
  }));

  return tournament;
}

function createTournamentStageSlots(
  tournament: NonNullable<GameState["tournament"]>,
  stageIndex: number,
  playerNation: TournamentNation,
  playerId: string,
  now: number
): TournamentStageSlot[] {
  const usedCodes = new Set(
    tournament.stages
      .flatMap((stage) => stage.slots)
      .filter((slot) => !slot.isUser)
      .map((slot) => slot.code)
  );
  const freshOpponents = NATION_OPTIONS.filter((nation) =>
    nation.code !== playerNation.code && !usedCodes.has(nation.code)
  );
  const fallbackOpponents = NATION_OPTIONS.filter((nation) => nation.code !== playerNation.code);
  const pool = freshOpponents.length >= 3 ? freshOpponents : fallbackOpponents;
  const opponents = rotateNations(
    pool,
    (now + stageIndex * 7 + tournament.id.length) % Math.max(1, pool.length)
  );
  const stageOpponents = Array.from({ length: 3 }, (_, index) =>
    opponents[index % opponents.length]!
  );

  return [
    {
      ...playerNation,
      seed: 1,
      isUser: true,
      playerId
    },
    ...stageOpponents.map((nation, index) => ({
      ...nation,
      seed: index + 2,
      isUser: false
    }))
  ];
}

function rotateNations(nations: TournamentNation[], offset: number): TournamentNation[] {
  if (nations.length === 0) {
    return nations;
  }

  const start = offset % nations.length;
  return [...nations.slice(start), ...nations.slice(0, start)];
}

function findTournamentNation(code: string): TournamentNation | undefined {
  const normalized = code.trim().toUpperCase();
  return NATION_OPTIONS.find((nation) => nation.code === normalized);
}

function generateRoomCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ROOM_CODE_ALPHABET[bytes[index]! % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function sortCards(cards: Card[]): Card[] {
  const suitOrder = {
    spades: 0,
    hearts: 1,
    diamonds: 2,
    clubs: 3
  } as const;

  return cards.slice().sort((left, right) => {
    const suitDiff = suitOrder[left.suit] - suitOrder[right.suit];
    return suitDiff === 0 ? rankValue(left.rank) - rankValue(right.rank) : suitDiff;
  });
}

function rankValue(rank: Card["rank"]): number {
  const values: Record<Card["rank"], number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  };
  return values[rank];
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

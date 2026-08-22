import type {
  BasicResponse,
  ClientToServerEvents,
  ServerToClientEvents,
  VoiceConnectionState,
  VoiceConnectionStatePayload,
  VoiceIceCandidateData,
  VoiceIceServer,
  VoiceIceSignalPayload,
  VoiceJoinResponse,
  VoiceMuteStatePayload,
  VoiceParticipantState,
  VoiceReportPayload,
  VoiceRoomPayload,
  VoiceSessionDescription,
  VoiceSessionSignalPayload
} from "@getaway-cards/shared";
import { createHmac } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type { RoomManager } from "./roomManager.js";
import { normalizeRoomCode } from "./roomManager.js";

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface VoiceServerConfig {
  stunUrls: string[];
  turnUrls: string[];
  turnUsername?: string;
  turnCredential?: string;
  turnRestSecret?: string;
  turnCredentialTtlSeconds: number;
}

interface VoiceParticipantRecord extends VoiceParticipantState {
  roomId: string;
  socketId: string;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

const MAX_SDP_LENGTH = 48_000;
const MAX_ICE_CANDIDATE_LENGTH = 4_096;
const MAX_PLAYER_ID_LENGTH = 160;
const SIGNAL_WINDOW_MS = 10_000;
const MAX_SIGNALS_PER_WINDOW = 100;
const MAX_JOINS_PER_WINDOW = 8;
const ALLOWED_CONNECTION_STATES = new Set<VoiceConnectionState>([
  "disconnected",
  "connecting",
  "connected",
  "reconnecting",
  "failed"
]);

export class VoiceSignalingService {
  private readonly participantsBySocket = new Map<string, VoiceParticipantRecord>();
  private readonly rateWindows = new Map<string, RateWindow>();

  constructor(
    private readonly io: GameServer,
    private readonly roomManager: RoomManager,
    private readonly voiceConfig: VoiceServerConfig
  ) {}

  join(socket: GameSocket, payload: VoiceRoomPayload): VoiceJoinResponse {
    if (!this.withinRateLimit(socket.id, "join", MAX_JOINS_PER_WINDOW)) {
      return { ok: false, error: "Too many voice join attempts. Please wait a moment." };
    }

    const verified = this.verifyHumanSeat(socket.id, payload.roomId);
    if (!verified.ok) return verified;

    const previous = this.participantsBySocket.get(socket.id);
    if (previous && (previous.roomId !== verified.roomId || previous.playerId !== verified.playerId)) {
      this.leaveSocket(socket.id);
    }

    for (const [otherSocketId, participant] of this.participantsBySocket) {
      if (
        otherSocketId !== socket.id &&
        participant.roomId === verified.roomId &&
        participant.playerId === verified.playerId
      ) {
        this.leaveSocket(otherSocketId);
      }
    }

    const participant: VoiceParticipantRecord = {
      roomId: verified.roomId,
      socketId: socket.id,
      playerId: verified.playerId,
      displayName: verified.displayName,
      isHuman: true,
      isVoiceEnabled: true,
      isSelfMuted: false,
      connectionState: "connected"
    };
    this.participantsBySocket.set(socket.id, participant);
    const participants = this.publicParticipants(verified.roomId);
    // Let the join acknowledgement reach the new client before peers can offer.
    // Otherwise a fast existing peer can send SDP while the new client is still
    // in its pre-join state and that first offer is lost.
    queueMicrotask(() => {
      const current = this.participantsBySocket.get(socket.id);
      if (current?.roomId === verified.roomId && current.playerId === verified.playerId) {
        this.broadcastParticipants(verified.roomId);
      }
    });

    return {
      ok: true,
      participant: this.toPublicParticipant(participant),
      participants,
      iceServers: this.createIceServers(verified.playerId)
    };
  }

  leave(socket: GameSocket, payload: VoiceRoomPayload): BasicResponse {
    const verified = this.verifySocketRoom(socket.id, payload.roomId);
    if (!verified.ok) return verified;
    this.leaveSocket(socket.id);
    return { ok: true };
  }

  leaveSocket(socketId: string): void {
    const participant = this.participantsBySocket.get(socketId);
    if (!participant) return;
    this.participantsBySocket.delete(socketId);
    this.io.to(participant.roomId).emit("voice:peer-left", {
      roomId: participant.roomId,
      senderPlayerId: participant.playerId,
      connectionState: "disconnected"
    });
    this.broadcastParticipants(participant.roomId);
  }

  closeRoom(roomIdInput: string): void {
    const roomId = normalizeRoomCode(roomIdInput);
    for (const [socketId, participant] of this.participantsBySocket) {
      if (participant.roomId === roomId) {
        this.participantsBySocket.delete(socketId);
      }
    }
  }

  syncRoom(roomIdInput: string): void {
    const roomId = normalizeRoomCode(roomIdInput);
    const state = this.roomManager.getPublicState(roomId);
    const roomSupportsVoice = Boolean(
      state?.settings.voiceEnabled &&
      this.isOnlineMultiplayerRoom(state.roomMode, state.tournament?.offline)
    );
    const socketIds = [...this.participantsBySocket]
      .filter(([, participant]) => {
        if (participant.roomId !== roomId) return false;
        const player = state?.players.find((candidate) => candidate.id === participant.playerId);
        return !roomSupportsVoice || !player || player.isBot || !player.connected;
      })
      .map(([socketId]) => socketId);
    for (const socketId of socketIds) {
      if (!roomSupportsVoice) {
        this.io.sockets.sockets.get(socketId)?.emit("voice:error", "Voice was disabled for this room.");
      }
      this.leaveSocket(socketId);
    }
  }

  forwardSession(
    socket: GameSocket,
    event: "voice:offer" | "voice:answer",
    payload: VoiceSessionSignalPayload
  ): BasicResponse {
    const sender = this.verifyVoiceSender(socket.id, payload.roomId);
    if (!sender.ok) return sender;
    if (!this.withinRateLimit(socket.id, "signal", MAX_SIGNALS_PER_WINDOW)) {
      return { ok: false, error: "Voice signalling rate limit reached." };
    }
    if (!validRecipient(payload.intendedRecipientPlayerId) || !validDescription(payload.description, event)) {
      return { ok: false, error: "Malformed voice session description." };
    }
    const recipient = this.findRecipient(sender.roomId, payload.intendedRecipientPlayerId);
    if (!recipient) return { ok: false, error: "Voice recipient is not connected." };

    this.io.sockets.sockets.get(recipient.socketId)?.emit(event, {
      roomId: sender.roomId,
      senderPlayerId: sender.playerId,
      intendedRecipientPlayerId: recipient.playerId,
      description: payload.description
    });
    return { ok: true };
  }

  forwardIce(socket: GameSocket, payload: VoiceIceSignalPayload): BasicResponse {
    const sender = this.verifyVoiceSender(socket.id, payload.roomId);
    if (!sender.ok) return sender;
    if (!this.withinRateLimit(socket.id, "signal", MAX_SIGNALS_PER_WINDOW)) {
      return { ok: false, error: "Voice signalling rate limit reached." };
    }
    if (!validRecipient(payload.intendedRecipientPlayerId) || !validIceCandidate(payload.candidate)) {
      return { ok: false, error: "Malformed ICE candidate." };
    }
    const recipient = this.findRecipient(sender.roomId, payload.intendedRecipientPlayerId);
    if (!recipient) return { ok: false, error: "Voice recipient is not connected." };

    this.io.sockets.sockets.get(recipient.socketId)?.emit("voice:ice-candidate", {
      roomId: sender.roomId,
      senderPlayerId: sender.playerId,
      intendedRecipientPlayerId: recipient.playerId,
      candidate: payload.candidate
    });
    return { ok: true };
  }

  updateMute(socket: GameSocket, payload: VoiceMuteStatePayload): BasicResponse {
    const sender = this.verifyVoiceSender(socket.id, payload.roomId);
    if (!sender.ok) return sender;
    sender.participant.isSelfMuted = Boolean(payload.isSelfMuted);
    this.io.to(sender.roomId).emit("voice:mute-state", {
      roomId: sender.roomId,
      senderPlayerId: sender.playerId,
      isSelfMuted: sender.participant.isSelfMuted
    });
    this.broadcastParticipants(sender.roomId);
    return { ok: true };
  }

  updateConnection(socket: GameSocket, payload: VoiceConnectionStatePayload): BasicResponse {
    const sender = this.verifyVoiceSender(socket.id, payload.roomId);
    if (!sender.ok) return sender;
    if (!ALLOWED_CONNECTION_STATES.has(payload.connectionState)) {
      return { ok: false, error: "Invalid voice connection state." };
    }
    sender.participant.connectionState = payload.connectionState;
    this.io.to(sender.roomId).emit("voice:connection-state", {
      roomId: sender.roomId,
      senderPlayerId: sender.playerId,
      connectionState: payload.connectionState
    });
    return { ok: true };
  }

  report(socket: GameSocket, payload: VoiceReportPayload): BasicResponse {
    const sender = this.verifyVoiceSender(socket.id, payload.roomId);
    if (!sender.ok) return sender;
    if (!validRecipient(payload.intendedRecipientPlayerId)) {
      return { ok: false, error: "Invalid report target." };
    }
    const recipient = this.findRecipient(sender.roomId, payload.intendedRecipientPlayerId);
    if (!recipient || recipient.playerId === sender.playerId) {
      return { ok: false, error: "That voice participant cannot be reported." };
    }
    console.warn("Voice report", {
      roomId: sender.roomId,
      reporterPlayerId: sender.playerId,
      reportedPlayerId: recipient.playerId,
      reason: payload.reason,
      at: new Date().toISOString()
    });
    return { ok: true };
  }

  private verifyHumanSeat(socketId: string, roomIdInput: string):
    | { ok: true; roomId: string; playerId: string; displayName: string }
    | { ok: false; error: string } {
    const seat = this.roomManager.getSocketSeat(socketId);
    const roomId = normalizeRoomCode(roomIdInput);
    if (!seat || seat.roomCode !== roomId) {
      return { ok: false, error: "Join this room before enabling voice." };
    }
    const state = this.roomManager.getPublicState(roomId, seat.participantId);
    const player = state?.players.find((candidate) => candidate.id === seat.participantId);
    if (!state || !player || player.isBot) {
      return { ok: false, error: "Voice is available only to seated human players." };
    }
    if (!state.settings.voiceEnabled) {
      return { ok: false, error: "Voice is disabled for this room." };
    }
    if (!this.isOnlineMultiplayerRoom(state.roomMode, state.tournament?.offline)) {
      return { ok: false, error: "Voice is unavailable in bot-only or offline games." };
    }
    return { ok: true, roomId, playerId: player.id, displayName: player.username };
  }

  private verifySocketRoom(socketId: string, roomIdInput: string): BasicResponse & { roomId?: string } {
    const participant = this.participantsBySocket.get(socketId);
    const roomId = normalizeRoomCode(roomIdInput);
    if (!participant || participant.roomId !== roomId) {
      return { ok: false, error: "You are not connected to that voice room." };
    }
    return { ok: true, roomId };
  }

  private verifyVoiceSender(socketId: string, roomIdInput: string):
    | { ok: true; roomId: string; playerId: string; participant: VoiceParticipantRecord }
    | { ok: false; error: string } {
    const human = this.verifyHumanSeat(socketId, roomIdInput);
    if (!human.ok) return human;
    const participant = this.participantsBySocket.get(socketId);
    if (!participant || participant.roomId !== human.roomId || participant.playerId !== human.playerId) {
      return { ok: false, error: "Enable voice before sending signalling messages." };
    }
    return { ok: true, roomId: human.roomId, playerId: human.playerId, participant };
  }

  private isOnlineMultiplayerRoom(roomMode: string | undefined, tournamentOffline: boolean | undefined): boolean {
    return roomMode !== "quick" && roomMode !== "bots" && tournamentOffline !== true;
  }

  private findRecipient(roomId: string, playerId: string): VoiceParticipantRecord | undefined {
    return [...this.participantsBySocket.values()].find(
      (participant) => participant.roomId === roomId && participant.playerId === playerId
    );
  }

  private publicParticipants(roomId: string): VoiceParticipantState[] {
    return [...this.participantsBySocket.values()]
      .filter((participant) => participant.roomId === roomId)
      .map((participant) => this.toPublicParticipant(participant));
  }

  private toPublicParticipant(participant: VoiceParticipantRecord): VoiceParticipantState {
    return {
      playerId: participant.playerId,
      displayName: participant.displayName,
      isHuman: true,
      isVoiceEnabled: true,
      isSelfMuted: participant.isSelfMuted,
      connectionState: participant.connectionState
    };
  }

  private broadcastParticipants(roomId: string): void {
    const payload = { roomId, participants: this.publicParticipants(roomId) };
    for (const participant of this.participantsBySocket.values()) {
      if (participant.roomId === roomId) {
        this.io.sockets.sockets.get(participant.socketId)?.emit("voice:participants", payload);
      }
    }
  }

  private createIceServers(playerId: string): VoiceIceServer[] {
    const servers: VoiceIceServer[] = [];
    if (this.voiceConfig.stunUrls.length > 0) {
      servers.push({ urls: this.voiceConfig.stunUrls });
    }
    if (this.voiceConfig.turnUrls.length === 0) return servers;

    if (this.voiceConfig.turnRestSecret) {
      const expiry = Math.floor(Date.now() / 1000) + Math.max(300, this.voiceConfig.turnCredentialTtlSeconds);
      const username = `${expiry}:${playerId}`;
      const credential = createHmac("sha1", this.voiceConfig.turnRestSecret)
        .update(username)
        .digest("base64");
      servers.push({ urls: this.voiceConfig.turnUrls, username, credential });
    } else if (this.voiceConfig.turnUsername && this.voiceConfig.turnCredential) {
      servers.push({
        urls: this.voiceConfig.turnUrls,
        username: this.voiceConfig.turnUsername,
        credential: this.voiceConfig.turnCredential
      });
    }
    return servers;
  }

  private withinRateLimit(socketId: string, category: "join" | "signal", limit: number): boolean {
    const key = `${socketId}:${category}`;
    const now = Date.now();
    const current = this.rateWindows.get(key);
    if (!current || now - current.startedAt >= SIGNAL_WINDOW_MS) {
      this.rateWindows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  }
}

function validRecipient(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PLAYER_ID_LENGTH;
}

function validDescription(
  value: VoiceSessionDescription,
  event: "voice:offer" | "voice:answer"
): boolean {
  const expectedType = event === "voice:offer" ? "offer" : "answer";
  return value?.type === expectedType && typeof value.sdp === "string" && value.sdp.length > 0 && value.sdp.length <= MAX_SDP_LENGTH;
}

function validIceCandidate(value: VoiceIceCandidateData): boolean {
  return Boolean(
    value &&
    typeof value.candidate === "string" &&
    value.candidate.length > 0 &&
    value.candidate.length <= MAX_ICE_CANDIDATE_LENGTH &&
    (value.sdpMid === null || typeof value.sdpMid === "string") &&
    (value.sdpMLineIndex === null || Number.isInteger(value.sdpMLineIndex))
  );
}

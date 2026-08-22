import type {
  VoiceConnectionState,
  VoiceForwardedIceSignal,
  VoiceForwardedSessionSignal,
  VoiceIceCandidateData,
  VoiceIceServer,
  VoiceJoinResponse,
  VoiceParticipantState,
  VoiceParticipantsPayload
} from "@getaway-cards/shared";
import type { GameSocket } from "../store/gameStore.js";

export type VoiceUiStatus =
  | "available"
  | "permission"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "muted"
  | "permission-blocked"
  | "no-device"
  | "unavailable"
  | "failed";

export interface VoicePreferences {
  inputDeviceId?: string;
  outputDeviceId?: string;
  pushToTalk: boolean;
  pushToTalkKey: string;
  sensitivity: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  masterVolume: number;
}

export interface VoiceDevice {
  deviceId: string;
  label: string;
}

export interface LocalVoiceParticipant extends VoiceParticipantState {
  isSpeaking: boolean;
  isLocallyMuted: boolean;
  volume: number;
}

export interface VoiceSnapshot {
  status: VoiceUiStatus;
  enabled: boolean;
  selfMuted: boolean;
  deafened: boolean;
  inputLevel: number;
  participants: LocalVoiceParticipant[];
  inputDevices: VoiceDevice[];
  outputDevices: VoiceDevice[];
  preferences: VoicePreferences;
  error?: string;
  notice?: string;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  negotiationTimer?: number;
  negotiationAttempts: number;
}

interface AudioAnalysis {
  analyser: AnalyserNode;
  samples: Uint8Array<ArrayBuffer>;
  lastSpokeAt: number;
}

const PREFERENCES_KEY = "bhabhi-thulla-voice-preferences";
const SPEAKING_RELEASE_MS = 520;
const SIGNAL_TIMEOUT_MS = 8_000;
const NEGOTIATION_RETRY_MS = 2_400;
const MAX_NEGOTIATION_ATTEMPTS = 5;
const MAX_PENDING_SIGNALS = 64;
const BACKUP_TURN_TTL_SECONDS = 60 * 60;
const BACKUP_TURN_SECRET = "openrelayprojectsecret";
const BACKUP_TURN_URLS = [
  "turn:staticauth.openrelay.metered.ca:80?transport=udp",
  "turn:staticauth.openrelay.metered.ca:80?transport=tcp",
  "turns:staticauth.openrelay.metered.ca:443?transport=tcp"
];

const DEFAULT_PREFERENCES: VoicePreferences = {
  pushToTalk: false,
  pushToTalkKey: "Space",
  sensitivity: 0.16,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  masterVolume: 0.8
};

export class VoiceChatManager {
  private localStream?: MediaStream;
  private readonly peers = new Map<string, PeerRecord>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly remoteAudio = new Map<string, HTMLAudioElement>();
  private readonly analyses = new Map<string, AudioAnalysis>();
  private readonly locallyMuted = new Set<string>();
  private readonly playerVolumes = new Map<string, number>();
  private participants = new Map<string, VoiceParticipantState>();
  private audioContext?: AudioContext;
  private animationFrame?: number;
  private destroyed = false;
  private joined = false;
  private selfMuted = false;
  private deafened = false;
  private inputLevel = 0;
  private inputDevices: VoiceDevice[] = [];
  private outputDevices: VoiceDevice[] = [];
  private status: VoiceUiStatus = "available";
  private error?: string;
  private notice?: string;
  private iceServers: RTCIceServer[] = [];
  private preferences = loadPreferences();
  private pttPressed = false;
  private rejoinTimer?: number;
  private playbackUnlockPending = false;
  private relayAvailable = false;
  private readonly pendingSessions: Array<{
    kind: "offer" | "answer";
    payload: VoiceForwardedSessionSignal;
  }> = [];
  private readonly pendingIceSignals: VoiceForwardedIceSignal[] = [];

  constructor(
    private readonly socket: GameSocket,
    readonly roomId: string,
    readonly playerId: string,
    private readonly onSnapshot: (snapshot: VoiceSnapshot) => void
  ) {
    this.bindSocketEvents();
    navigator.mediaDevices?.addEventListener?.("devicechange", this.handleDeviceChange);
    window.addEventListener("keydown", this.handlePushToTalkDown);
    window.addEventListener("keyup", this.handlePushToTalkUp);
    this.publish();
  }

  async join(): Promise<void> {
    if (this.destroyed || this.joined || this.status === "permission" || this.status === "connecting") return;
    if (!supportsVoice()) {
      this.setStatus("unavailable", voiceSupportMessage());
      return;
    }

    this.setStatus("permission");
    try {
      await this.unlockAudioPlayback();
      this.localStream = await this.captureMicrophone();
      if (this.preferences.pushToTalk) {
        this.selfMuted = true;
        for (const track of this.localStream.getAudioTracks()) track.enabled = false;
      }
      this.installLocalAnalysis();
      await this.refreshDevices();
      this.setStatus("connecting");
      await this.joinSignaling();
    } catch (error) {
      this.stopLocalStream();
      this.handleMediaError(error);
    }
  }

  async leave(): Promise<void> {
    if (this.joined && this.socket.connected) {
      this.socket.emit("voice:leave", { roomId: this.roomId }, () => undefined);
    }
    this.joined = false;
    this.closeConnections();
    this.stopLocalStream();
    this.participants.clear();
    this.pendingSessions.length = 0;
    this.pendingIceSignals.length = 0;
    this.relayAvailable = false;
    this.selfMuted = false;
    this.deafened = false;
    this.setStatus("available");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.joined && this.socket.connected) {
      this.socket.emit("voice:leave", { roomId: this.roomId }, () => undefined);
    }
    this.unbindSocketEvents();
    navigator.mediaDevices?.removeEventListener?.("devicechange", this.handleDeviceChange);
    window.removeEventListener("keydown", this.handlePushToTalkDown);
    window.removeEventListener("keyup", this.handlePushToTalkUp);
    this.closeConnections();
    this.stopLocalStream();
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.rejoinTimer) window.clearTimeout(this.rejoinTimer);
    document.removeEventListener("pointerdown", this.handlePlaybackUnlock, true);
    void this.audioContext?.close();
  }

  toggleSelfMute(): void {
    if (!this.joined || !this.localStream) return;
    this.setSelfMuted(!this.selfMuted);
  }

  toggleDeafen(): void {
    this.deafened = !this.deafened;
    this.applyAllAudioPreferences();
    this.publish();
  }

  setParticipantMuted(playerId: string, muted: boolean): void {
    if (muted) this.locallyMuted.add(playerId);
    else this.locallyMuted.delete(playerId);
    this.applyAudioPreference(playerId);
    this.publish();
  }

  setParticipantVolume(playerId: string, volume: number): void {
    this.playerVolumes.set(playerId, clamp(volume));
    this.applyAudioPreference(playerId);
    this.publish();
  }

  reportParticipant(playerId: string, reason: "abuse" | "harassment" | "noise" | "other" = "other"): void {
    if (!this.joined) return;
    this.socket.emit("voice:report", {
      roomId: this.roomId,
      intendedRecipientPlayerId: playerId,
      reason
    }, (response) => {
      this.notice = response.ok ? "Voice report sent to moderation." : response.error;
      this.publish();
    });
  }

  async updatePreferences(next: Partial<VoicePreferences>): Promise<void> {
    const previous = this.preferences;
    this.preferences = {
      ...this.preferences,
      ...next,
      sensitivity: clamp(next.sensitivity ?? this.preferences.sensitivity, 0.04, 0.5),
      masterVolume: clamp(next.masterVolume ?? this.preferences.masterVolume)
    };
    savePreferences(this.preferences);
    this.applyAllAudioPreferences();
    this.publish();

    const mediaChanged =
      previous.inputDeviceId !== this.preferences.inputDeviceId ||
      previous.noiseSuppression !== this.preferences.noiseSuppression ||
      previous.echoCancellation !== this.preferences.echoCancellation ||
      previous.autoGainControl !== this.preferences.autoGainControl;
    if (mediaChanged && this.joined) await this.replaceInputTrack();
    if (previous.outputDeviceId !== this.preferences.outputDeviceId) await this.applyOutputDevice();
    if (previous.pushToTalk !== this.preferences.pushToTalk && this.preferences.pushToTalk) {
      this.setSelfMuted(true);
    } else if (previous.pushToTalk && !this.preferences.pushToTalk && this.selfMuted) {
      this.setSelfMuted(false);
    }
  }

  clearNotice(): void {
    this.notice = undefined;
    this.publish();
  }

  private readonly handleParticipants = (payload: VoiceParticipantsPayload): void => {
    if (payload.roomId !== this.roomId || !this.joined) return;
    const next = new Map(payload.participants.map((participant) => [participant.playerId, participant]));
    this.participants = next;
    for (const playerId of [...this.peers.keys()]) {
      if (!next.has(playerId)) this.closePeer(playerId);
    }
    for (const participant of next.values()) {
      if (participant.playerId === this.playerId) continue;
      const isNewPeer = !this.peers.has(participant.playerId);
      this.ensurePeer(participant.playerId);
      if (isNewPeer && this.playerId.localeCompare(participant.playerId) < 0) {
        void this.createAndSendOffer(participant.playerId);
      } else if (isNewPeer) {
        this.scheduleNegotiationRetry(participant.playerId);
      }
    }
    this.publish();
  };

  private readonly handleOffer = (payload: VoiceForwardedSessionSignal): void => {
    if (!this.isSignalForThisPlayer(payload.roomId, payload.intendedRecipientPlayerId)) return;
    if (!this.joined) {
      this.queueSession("offer", payload);
      return;
    }
    void this.receiveOffer(payload);
  };

  private readonly handleAnswer = (payload: VoiceForwardedSessionSignal): void => {
    if (!this.isSignalForThisPlayer(payload.roomId, payload.intendedRecipientPlayerId)) return;
    if (!this.joined) {
      this.queueSession("answer", payload);
      return;
    }
    void this.receiveAnswer(payload);
  };

  private readonly handleIce = (payload: VoiceForwardedIceSignal): void => {
    if (!this.isSignalForThisPlayer(payload.roomId, payload.intendedRecipientPlayerId)) return;
    if (!this.joined) {
      if (this.pendingIceSignals.length >= MAX_PENDING_SIGNALS) this.pendingIceSignals.shift();
      this.pendingIceSignals.push(payload);
      return;
    }
    void this.receiveIce(payload.senderPlayerId, payload.candidate);
  };

  private readonly handlePeerLeft = (payload: { roomId: string; senderPlayerId: string }): void => {
    if (payload.roomId !== this.roomId) return;
    this.participants.delete(payload.senderPlayerId);
    this.closePeer(payload.senderPlayerId);
    this.publish();
  };

  private readonly handleMuteState = (payload: { roomId: string; senderPlayerId: string; isSelfMuted?: boolean }): void => {
    if (payload.roomId !== this.roomId || typeof payload.isSelfMuted !== "boolean") return;
    const participant = this.participants.get(payload.senderPlayerId);
    if (participant) {
      this.participants.set(payload.senderPlayerId, { ...participant, isSelfMuted: payload.isSelfMuted });
      this.publish();
    }
  };

  private readonly handleConnectionState = (payload: { roomId: string; senderPlayerId: string; connectionState?: VoiceConnectionState }): void => {
    if (payload.roomId !== this.roomId || !payload.connectionState) return;
    const participant = this.participants.get(payload.senderPlayerId);
    if (participant) {
      this.participants.set(payload.senderPlayerId, { ...participant, connectionState: payload.connectionState });
      this.publish();
    }
  };

  private readonly handleVoiceError = (message: string): void => {
    if (!this.joined) return;
    this.error = message;
    this.status = "failed";
    this.publish();
  };

  private readonly handleSocketDisconnect = (): void => {
    if (!this.joined) return;
    this.status = "reconnecting";
    this.publish();
  };

  private readonly handleSocketConnect = (): void => {
    if (!this.joined || this.status !== "reconnecting") return;
    this.scheduleSignalingRejoin(180);
  };

  private readonly handleRoomState = (): void => {
    if (!this.joined || this.status !== "reconnecting" || !this.socket.connected) return;
    this.scheduleSignalingRejoin(250);
  };

  private readonly handlePlaybackUnlock = (): void => {
    this.playbackUnlockPending = false;
    void this.unlockAudioPlayback();
  };

  private readonly handleDeviceChange = (): void => {
    void this.refreshDevices().then(() => {
      if (!this.joined || !this.localStream) return;
      const current = this.localStream.getAudioTracks()[0]?.getSettings().deviceId;
      if (current && !this.inputDevices.some((device) => device.deviceId === current)) {
        this.notice = "Your microphone disconnected. Switching to an available input.";
        void this.replaceInputTrack();
      }
    });
  };

  private readonly handlePushToTalkDown = (event: KeyboardEvent): void => {
    if (!this.preferences.pushToTalk || event.code !== this.preferences.pushToTalkKey || isTypingTarget(event.target)) return;
    event.preventDefault();
    if (!event.repeat) {
      this.pttPressed = true;
      this.setSelfMuted(false);
    }
  };

  private readonly handlePushToTalkUp = (event: KeyboardEvent): void => {
    if (!this.preferences.pushToTalk || event.code !== this.preferences.pushToTalkKey || isTypingTarget(event.target)) return;
    event.preventDefault();
    this.pttPressed = false;
    this.setSelfMuted(true);
  };

  private bindSocketEvents(): void {
    this.socket.on("voice:participants", this.handleParticipants);
    this.socket.on("voice:offer", this.handleOffer);
    this.socket.on("voice:answer", this.handleAnswer);
    this.socket.on("voice:ice-candidate", this.handleIce);
    this.socket.on("voice:peer-left", this.handlePeerLeft);
    this.socket.on("voice:mute-state", this.handleMuteState);
    this.socket.on("voice:connection-state", this.handleConnectionState);
    this.socket.on("voice:error", this.handleVoiceError);
    this.socket.on("connect", this.handleSocketConnect);
    this.socket.on("disconnect", this.handleSocketDisconnect);
    this.socket.on("room:state", this.handleRoomState);
  }

  private unbindSocketEvents(): void {
    this.socket.off("voice:participants", this.handleParticipants);
    this.socket.off("voice:offer", this.handleOffer);
    this.socket.off("voice:answer", this.handleAnswer);
    this.socket.off("voice:ice-candidate", this.handleIce);
    this.socket.off("voice:peer-left", this.handlePeerLeft);
    this.socket.off("voice:mute-state", this.handleMuteState);
    this.socket.off("voice:connection-state", this.handleConnectionState);
    this.socket.off("voice:error", this.handleVoiceError);
    this.socket.off("connect", this.handleSocketConnect);
    this.socket.off("disconnect", this.handleSocketDisconnect);
    this.socket.off("room:state", this.handleRoomState);
  }

  private async joinSignaling(): Promise<void> {
    if (!this.socket.connected) throw new Error("The game server is reconnecting. Try voice again in a moment.");
    const response = await this.requestVoiceJoin();
    if (!response.ok) throw new Error(response.error ?? "Voice could not join this room.");
    const configuredIceServers = toRtcIceServers(response.iceServers ?? []);
    const usedBackupRelay = !hasTurnRelay(configuredIceServers);
    if (usedBackupRelay) {
      const backupRelay = await createBackupTurnServer(this.playerId);
      if (backupRelay) configuredIceServers.push(backupRelay);
    }
    this.iceServers = configuredIceServers;
    this.relayAvailable = hasTurnRelay(this.iceServers);
    this.participants = new Map((response.participants ?? []).map((participant) => [participant.playerId, participant]));
    this.joined = true;
    this.error = undefined;
    const hasRemoteParticipants = [...this.participants.keys()].some((id) => id !== this.playerId);
    this.status = hasRemoteParticipants ? "connecting" : this.selfMuted ? "muted" : "connected";
    this.notice = hasRemoteParticipants && usedBackupRelay && this.relayAvailable
      ? "Voice is connecting through the backup network relay."
      : hasRemoteParticipants && !this.relayAvailable
        ? "The network relay could not be prepared. Refresh the table and rejoin voice."
        : undefined;
    this.socket.emit("voice:connection-state", { roomId: this.roomId, connectionState: "connected" }, () => undefined);
    if (this.selfMuted) {
      this.socket.emit("voice:mute-state", { roomId: this.roomId, isSelfMuted: true }, () => undefined);
    }
    for (const participant of this.participants.values()) {
      if (participant.playerId === this.playerId) continue;
      this.ensurePeer(participant.playerId);
      if (this.playerId.localeCompare(participant.playerId) < 0) {
        await this.createAndSendOffer(participant.playerId);
      } else {
        this.scheduleNegotiationRetry(participant.playerId);
      }
    }
    await this.drainPendingSignals();
    this.publish();
  }

  private async rejoinSignaling(): Promise<void> {
    if (!this.localStream || this.destroyed) return;
    try {
      this.closeConnections();
      this.joined = false;
      await this.joinSignaling();
    } catch (error) {
      this.status = "reconnecting";
      this.error = error instanceof Error ? error.message : "Voice is reconnecting.";
      this.publish();
      this.scheduleSignalingRejoin(1800);
    }
  }

  private requestVoiceJoin(): Promise<VoiceJoinResponse> {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: "Voice server did not respond. Check your connection and try again." });
      }, SIGNAL_TIMEOUT_MS);
      this.socket.emit("voice:join", { roomId: this.roomId }, (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  private queueSession(kind: "offer" | "answer", payload: VoiceForwardedSessionSignal): void {
    if (!this.localStream || this.destroyed) return;
    if (this.pendingSessions.length >= MAX_PENDING_SIGNALS) this.pendingSessions.shift();
    this.pendingSessions.push({ kind, payload });
  }

  private async drainPendingSignals(): Promise<void> {
    const sessions = this.pendingSessions.splice(0);
    for (const signal of sessions) {
      if (signal.kind === "offer") await this.receiveOffer(signal.payload);
      else await this.receiveAnswer(signal.payload);
    }
    const candidates = this.pendingIceSignals.splice(0);
    for (const signal of candidates) {
      await this.receiveIce(signal.senderPlayerId, signal.candidate);
    }
  }

  private scheduleSignalingRejoin(delay: number): void {
    if (this.rejoinTimer) window.clearTimeout(this.rejoinTimer);
    this.rejoinTimer = window.setTimeout(() => {
      this.rejoinTimer = undefined;
      if (!this.destroyed && this.status === "reconnecting" && this.socket.connected) {
        void this.rejoinSignaling();
      }
    }, delay);
  }

  private ensurePeer(remotePlayerId: string): PeerRecord {
    const existing = this.peers.get(remotePlayerId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: "max-bundle",
      iceCandidatePoolSize: 4
    });
    const record: PeerRecord = { connection, pendingCandidates: [], negotiationAttempts: 0 };
    this.peers.set(remotePlayerId, record);
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      connection.addTrack(track, this.localStream!);
    }
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      this.socket.emit("voice:ice-candidate", {
        roomId: this.roomId,
        intendedRecipientPlayerId: remotePlayerId,
        candidate: {
          candidate: candidate.candidate ?? "",
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          usernameFragment: candidate.usernameFragment ?? null
        }
      }, () => undefined);
    };
    connection.ontrack = (event) => this.attachRemoteStream(remotePlayerId, event.streams[0] ?? new MediaStream([event.track]));
    connection.onconnectionstatechange = () => this.handlePeerConnectionState(remotePlayerId, connection.connectionState);
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === "connected" || connection.iceConnectionState === "completed") {
        this.handlePeerConnectionState(remotePlayerId, "connected");
      } else if (connection.iceConnectionState === "failed") {
        this.handlePeerConnectionState(remotePlayerId, "failed");
      } else if (connection.iceConnectionState === "disconnected") {
        this.handlePeerConnectionState(remotePlayerId, "disconnected");
      }
    };
    return record;
  }

  private async createAndSendOffer(remotePlayerId: string, iceRestart = false): Promise<void> {
    const peer = this.ensurePeer(remotePlayerId);
    if (peer.connection.signalingState !== "stable") return;
    try {
      peer.negotiationAttempts += 1;
      const offer = await peer.connection.createOffer({ iceRestart });
      await peer.connection.setLocalDescription(offer);
      if (!offer.sdp) return;
      this.socket.emit("voice:offer", {
        roomId: this.roomId,
        intendedRecipientPlayerId: remotePlayerId,
        description: { type: "offer", sdp: offer.sdp }
      }, (response) => {
        if (!response.ok) this.notePeerError(response.error);
        this.scheduleNegotiationRetry(remotePlayerId);
      });
    } catch (error) {
      this.notePeerError(error);
      this.scheduleNegotiationRetry(remotePlayerId);
    }
  }

  private async receiveOffer(payload: VoiceForwardedSessionSignal): Promise<void> {
    try {
      const peer = this.ensurePeer(payload.senderPlayerId);
      await peer.connection.setRemoteDescription(payload.description);
      await this.flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      if (!answer.sdp) return;
      this.socket.emit("voice:answer", {
        roomId: this.roomId,
        intendedRecipientPlayerId: payload.senderPlayerId,
        description: { type: "answer", sdp: answer.sdp }
      }, (response) => {
        if (!response.ok) this.notePeerError(response.error);
      });
    } catch (error) {
      this.notePeerError(error);
    }
  }

  private async receiveAnswer(payload: VoiceForwardedSessionSignal): Promise<void> {
    const peer = this.peers.get(payload.senderPlayerId);
    if (!peer) return;
    try {
      await peer.connection.setRemoteDescription(payload.description);
      await this.flushCandidates(peer);
    } catch (error) {
      this.notePeerError(error);
    }
  }

  private async receiveIce(remotePlayerId: string, value: VoiceIceCandidateData): Promise<void> {
    const peer = this.ensurePeer(remotePlayerId);
    const candidate: RTCIceCandidateInit = value;
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (error) {
      this.notePeerError(error);
    }
  }

  private async flushCandidates(peer: PeerRecord): Promise<void> {
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) await peer.connection.addIceCandidate(candidate);
  }

  private scheduleNegotiationRetry(remotePlayerId: string, delay = NEGOTIATION_RETRY_MS): void {
    const peer = this.peers.get(remotePlayerId);
    if (!peer || !this.joined || this.destroyed || peer.connection.connectionState === "connected") return;
    if (peer.negotiationTimer) window.clearTimeout(peer.negotiationTimer);
    if (peer.negotiationAttempts >= MAX_NEGOTIATION_ATTEMPTS) {
      this.markPeerFailed(remotePlayerId);
      return;
    }
    peer.negotiationTimer = window.setTimeout(() => {
      peer.negotiationTimer = undefined;
      if (!this.joined || this.destroyed || peer.connection.connectionState === "connected") return;
      if (this.playerId.localeCompare(remotePlayerId) < 0) {
        const previousAttempts = peer.negotiationAttempts;
        this.closePeer(remotePlayerId);
        const replacement = this.ensurePeer(remotePlayerId);
        replacement.negotiationAttempts = previousAttempts;
        void this.createAndSendOffer(remotePlayerId, true);
      } else {
        peer.negotiationAttempts += 1;
        this.scheduleNegotiationRetry(remotePlayerId);
      }
    }, delay);
  }

  private clearNegotiationRetry(remotePlayerId: string): void {
    const peer = this.peers.get(remotePlayerId);
    if (!peer) return;
    if (peer.negotiationTimer) window.clearTimeout(peer.negotiationTimer);
    peer.negotiationTimer = undefined;
    peer.negotiationAttempts = 0;
  }

  private markPeerFailed(remotePlayerId: string): void {
    const participant = this.participants.get(remotePlayerId);
    if (participant) this.participants.set(remotePlayerId, { ...participant, connectionState: "failed" });
    this.status = "failed";
    this.error = this.relayAvailable
      ? `Could not establish voice with ${participant?.displayName ?? "this player"}. Try leaving and rejoining voice.`
      : "Voice could not cross this network because no TURN relay is configured.";
    this.publish();
  }

  private handlePeerConnectionState(remotePlayerId: string, state: RTCPeerConnectionState): void {
    if (state === "connected") {
      this.clearNegotiationRetry(remotePlayerId);
      const participant = this.participants.get(remotePlayerId);
      if (participant) this.participants.set(remotePlayerId, { ...participant, connectionState: "connected" });
      this.error = undefined;
      this.notice = undefined;
      this.status = this.selfMuted ? "muted" : "connected";
    } else if (state === "disconnected" || state === "connecting") {
      const participant = this.participants.get(remotePlayerId);
      if (participant) this.participants.set(remotePlayerId, { ...participant, connectionState: "reconnecting" });
      this.status = "reconnecting";
      this.scheduleNegotiationRetry(remotePlayerId);
    } else if (state === "failed") {
      const participant = this.participants.get(remotePlayerId);
      if (participant) this.participants.set(remotePlayerId, { ...participant, connectionState: "failed" });
      this.status = "reconnecting";
      this.scheduleNegotiationRetry(remotePlayerId, 900);
    } else if (state === "closed") {
      this.closePeer(remotePlayerId);
    }
    this.publish();
  }

  private attachRemoteStream(playerId: string, stream: MediaStream): void {
    this.remoteStreams.set(playerId, stream);
    let audio = this.remoteAudio.get(playerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.muted = false;
      audio.setAttribute("playsinline", "true");
      audio.className = "voice-remote-audio";
      audio.setAttribute("aria-hidden", "true");
      document.body.append(audio);
      this.remoteAudio.set(playerId, audio);
    }
    audio.srcObject = stream;
    this.applyAudioPreference(playerId);
    void this.setAudioSink(audio);
    void audio.play().catch(() => {
      this.notice = "Tap the voice control once to allow remote audio playback.";
      if (!this.playbackUnlockPending) {
        this.playbackUnlockPending = true;
        document.addEventListener("pointerdown", this.handlePlaybackUnlock, { once: true, capture: true });
      }
      this.publish();
    });
    this.installAnalysis(playerId, stream);
  }

  private async unlockAudioPlayback(): Promise<void> {
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === "suspended") await this.audioContext.resume();
    } catch {
      // Audio elements can still play when Web Audio is unavailable.
    }
    await Promise.all([...this.remoteAudio.values()].map(async (audio) => {
      try {
        await audio.play();
      } catch {
        // A later pointer gesture will retry playback.
      }
    }));
    if (this.remoteAudio.size > 0) {
      this.notice = undefined;
      this.publish();
    }
  }

  private installLocalAnalysis(): void {
    if (!this.localStream) return;
    this.installAnalysis(this.playerId, this.localStream);
  }

  private installAnalysis(playerId: string, stream: MediaStream): void {
    try {
      this.audioContext ??= new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.76;
      source.connect(analyser);
      this.analyses.set(playerId, {
        analyser,
        samples: new Uint8Array(analyser.frequencyBinCount),
        lastSpokeAt: 0
      });
      if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.analyseAudio);
    } catch {
      // Voice remains usable when Web Audio analysis is unavailable.
    }
  }

  private readonly analyseAudio = (): void => {
    if (this.destroyed) return;
    const now = performance.now();
    let changed = false;
    for (const [playerId, analysis] of this.analyses) {
      analysis.analyser.getByteTimeDomainData(analysis.samples);
      let sum = 0;
      for (const sample of analysis.samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.sqrt(sum / analysis.samples.length);
      if (playerId === this.playerId && Math.abs(this.inputLevel - level) > 0.012) {
        this.inputLevel = level;
        changed = true;
      }
      const threshold = 0.012 + this.preferences.sensitivity * 0.12;
      const active = level >= threshold && !(playerId === this.playerId && this.selfMuted);
      if (active) analysis.lastSpokeAt = now;
      const previous = (analysis as AudioAnalysis & { speaking?: boolean }).speaking ?? false;
      const speaking = active || now - analysis.lastSpokeAt < SPEAKING_RELEASE_MS;
      if (previous !== speaking) {
        (analysis as AudioAnalysis & { speaking?: boolean }).speaking = speaking;
        changed = true;
      }
    }
    if (changed) this.publish();
    this.animationFrame = requestAnimationFrame(this.analyseAudio);
  };

  private setSelfMuted(muted: boolean): void {
    if (!this.localStream) return;
    this.selfMuted = muted;
    for (const track of this.localStream.getAudioTracks()) track.enabled = !muted;
    this.status = muted ? "muted" : "connected";
    if (this.joined) {
      this.socket.emit("voice:mute-state", { roomId: this.roomId, isSelfMuted: muted }, () => undefined);
    }
    this.publish();
  }

  private async replaceInputTrack(): Promise<void> {
    try {
      const stream = await this.captureMicrophone();
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("No microphone track was available.");
      track.enabled = !this.selfMuted;
      for (const peer of this.peers.values()) {
        const sender = peer.connection.getSenders().find((item) => item.track?.kind === "audio");
        if (sender) await sender.replaceTrack(track);
      }
      this.localStream?.getTracks().forEach((item) => item.stop());
      this.localStream = stream;
      this.analyses.delete(this.playerId);
      this.installLocalAnalysis();
      await this.refreshDevices();
      this.notice = "Microphone updated.";
      this.publish();
    } catch (error) {
      this.handleMediaError(error);
    }
  }

  private async captureMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints() });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const staleDevice = Boolean(
        this.preferences.inputDeviceId &&
        (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotFoundError")
      );
      if (!staleDevice) throw error;
      this.preferences = { ...this.preferences, inputDeviceId: undefined };
      savePreferences(this.preferences);
      this.notice = "The saved microphone was unavailable. Using the default microphone instead.";
      return navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints() });
    }
  }

  private audioConstraints(): MediaTrackConstraints {
    return {
      deviceId: this.preferences.inputDeviceId ? { exact: this.preferences.inputDeviceId } : undefined,
      noiseSuppression: this.preferences.noiseSuppression,
      echoCancellation: this.preferences.echoCancellation,
      autoGainControl: this.preferences.autoGainControl,
      channelCount: 1
    };
  }

  private async refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.inputDevices = devices.filter((item) => item.kind === "audioinput").map((item, index) => ({
      deviceId: item.deviceId,
      label: item.label || `Microphone ${index + 1}`
    }));
    this.outputDevices = devices.filter((item) => item.kind === "audiooutput").map((item, index) => ({
      deviceId: item.deviceId,
      label: item.label || `Speaker ${index + 1}`
    }));
    this.publish();
  }

  private applyAudioPreference(playerId: string): void {
    const audio = this.remoteAudio.get(playerId);
    if (!audio) return;
    audio.muted = this.deafened || this.locallyMuted.has(playerId);
    audio.volume = clamp((this.playerVolumes.get(playerId) ?? 1) * this.preferences.masterVolume);
  }

  private applyAllAudioPreferences(): void {
    for (const playerId of this.remoteAudio.keys()) this.applyAudioPreference(playerId);
  }

  private async applyOutputDevice(): Promise<void> {
    await Promise.all([...this.remoteAudio.values()].map((audio) => this.setAudioSink(audio)));
  }

  private async setAudioSink(audio: HTMLAudioElement): Promise<void> {
    const element = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
    if (this.preferences.outputDeviceId && element.setSinkId) {
      try {
        await element.setSinkId(this.preferences.outputDeviceId);
      } catch {
        this.notice = "This browser could not switch the output device.";
      }
    }
  }

  private isSignalForThisPlayer(roomId: string, recipientId: string): boolean {
    return roomId === this.roomId && recipientId === this.playerId;
  }

  private closePeer(playerId: string): void {
    const peer = this.peers.get(playerId);
    if (peer?.negotiationTimer) window.clearTimeout(peer.negotiationTimer);
    this.peers.delete(playerId);
    peer?.connection.close();
    this.remoteStreams.delete(playerId);
    this.analyses.delete(playerId);
    const audio = this.remoteAudio.get(playerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    this.remoteAudio.delete(playerId);
  }

  private closeConnections(): void {
    for (const playerId of [...this.peers.keys()]) this.closePeer(playerId);
  }

  private stopLocalStream(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = undefined;
    this.analyses.delete(this.playerId);
    this.inputLevel = 0;
  }

  private handleMediaError(error: unknown): void {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      this.setStatus("permission-blocked", "Microphone permission is blocked. Allow it in your browser site settings, then try again.");
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      this.setStatus("no-device", "No microphone was found. Connect one and try again.");
    } else {
      this.setStatus("failed", error instanceof Error ? error.message : "Voice chat could not start.");
    }
  }

  private notePeerError(error: unknown): void {
    this.error = typeof error === "string" ? error : error instanceof Error ? error.message : "A voice connection failed.";
    this.publish();
  }

  private setStatus(status: VoiceUiStatus, error?: string): void {
    this.status = status;
    this.error = error;
    this.publish();
  }

  private publish(): void {
    if (this.destroyed) return;
    const participants = [...this.participants.values()].map((participant) => {
      const analysis = this.analyses.get(participant.playerId) as (AudioAnalysis & { speaking?: boolean }) | undefined;
      return {
        ...participant,
        isSpeaking: Boolean(analysis?.speaking),
        isLocallyMuted: this.locallyMuted.has(participant.playerId),
        volume: this.playerVolumes.get(participant.playerId) ?? 1
      };
    });
    this.onSnapshot({
      status: this.status,
      enabled: this.joined,
      selfMuted: this.selfMuted,
      deafened: this.deafened,
      inputLevel: this.inputLevel,
      participants,
      inputDevices: this.inputDevices,
      outputDevices: this.outputDevices,
      preferences: this.preferences,
      error: this.error,
      notice: this.notice
    });
  }
}

function supportsVoice(): boolean {
  return Boolean(
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    (window.isSecureContext || window.location.hostname === "localhost")
  );
}

function voiceSupportMessage(): string {
  if (!window.isSecureContext && window.location.hostname !== "localhost") return "Voice requires HTTPS.";
  return "This browser does not support live WebRTC voice chat.";
}

function loadPreferences(): VoicePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}") as Partial<VoicePreferences>;
    return { ...DEFAULT_PREFERENCES, ...saved };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(preferences: VoicePreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

function toRtcIceServers(servers: VoiceIceServer[]): RTCIceServer[] {
  return servers.map((server) => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential
  }));
}

function hasTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });
}

async function createBackupTurnServer(playerId: string): Promise<RTCIceServer | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  try {
    const username = `${Math.floor(Date.now() / 1_000) + BACKUP_TURN_TTL_SECONDS}:${playerId}`;
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(BACKUP_TURN_SECRET),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
    const credential = bytesToBase64(new Uint8Array(signature));
    return { urls: BACKUP_TURN_URLS, username, credential };
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

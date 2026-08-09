import type {
  BotDifficulty,
  BotSeatConfig,
  Card,
  GameSettings,
  MoveAction,
  PublicGameState,
  ReactionMessage,
  ChatMessage,
  RoomListItem,
  RoomVisibility,
  Suit,
  VoiceConnectionState,
  VoiceParticipantState
} from "./types.js";
import type { AccountType } from "./profile.js";
import type {
  FriendActionResponse,
  FriendInviteActionPayload,
  FriendNotification,
  FriendPresencePayload,
  FriendRequestActionPayload,
  FriendSearchPayload,
  FriendSearchResponse,
  FriendsAuthPayload,
  FriendsAuthResponse,
  FriendsAwayPayload,
  FriendsSnapshot,
  FriendTargetPayload
} from "./social.js";

export interface PlayerProfilePayload {
  username: string;
  avatar: string;
  sessionId?: string;
  guestId?: string;
  accountType?: Exclude<AccountType, "bot">;
  authToken?: string;
  profileId?: string;
  rankBadge?: string;
  identityId?: string;
}

export interface CreateRoomPayload extends PlayerProfilePayload {
  settings?: Partial<GameSettings>;
  visibility?: RoomVisibility;
}

export interface JoinRoomPayload extends PlayerProfilePayload {
  roomCode: string;
  asSpectator?: boolean;
}

export interface QuickPlayPayload extends PlayerProfilePayload {
  difficulty?: BotDifficulty;
  settings?: Partial<GameSettings>;
}

export interface PlayWithBotsPayload extends PlayerProfilePayload {
  difficulty: BotDifficulty;
  botCount: number;
  settings?: Partial<GameSettings>;
}

export interface StartTournamentPayload extends PlayerProfilePayload {
  nationCode: string;
  difficulty: BotDifficulty;
  eventId?: string;
  eventName?: string;
  reward?: string;
  offline?: boolean;
  turnSeconds?: number;
}

export interface AddBotPayload {
  roomCode: string;
  difficulty: BotDifficulty;
}

export interface RoomActionPayload {
  roomCode: string;
}

export interface PlayerReadyPayload extends RoomActionPayload {
  ready: boolean;
}

export interface QuitRoomPayload extends RoomActionPayload {
  replaceWithBot?: boolean;
}

export interface PlayCardPayload extends RoomActionPayload {
  cardId: string;
  declaredSuit?: Suit;
}

export interface MovePayload extends RoomActionPayload {
  move: MoveAction;
}

export interface ChatPayload extends RoomActionPayload {
  body: string;
}

export interface ReactionPayload extends RoomActionPayload {
  emoji: string;
}

export interface SettingsPayload extends RoomActionPayload {
  settings: Partial<GameSettings>;
}

export interface RoomJoinResponse {
  ok: boolean;
  roomCode?: string;
  playerId?: string;
  sessionId?: string;
  state?: PublicGameState;
  error?: string;
}

export interface BasicResponse {
  ok: boolean;
  error?: string;
}

export interface QuitRoomResponse extends BasicResponse {
  roomCode?: string;
  playerId?: string;
  sessionId?: string;
  state?: PublicGameState;
  stayedAsSpectator?: boolean;
}

export interface PrivateHandPayload {
  roomCode: string;
  playerId: string;
  hand: Card[];
}

export interface VoiceRoomPayload {
  roomId: string;
}

export interface VoiceTargetPayload extends VoiceRoomPayload {
  intendedRecipientPlayerId: string;
}

export interface VoiceSessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface VoiceSessionSignalPayload extends VoiceTargetPayload {
  description: VoiceSessionDescription;
}

export interface VoiceIceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export interface VoiceIceSignalPayload extends VoiceTargetPayload {
  candidate: VoiceIceCandidateData;
}

export interface VoiceMuteStatePayload extends VoiceRoomPayload {
  isSelfMuted: boolean;
}

export interface VoiceConnectionStatePayload extends VoiceRoomPayload {
  connectionState: VoiceConnectionState;
}

export interface VoiceReportPayload extends VoiceTargetPayload {
  reason: "abuse" | "harassment" | "noise" | "other";
}

export interface VoiceForwardedSessionSignal extends VoiceSessionSignalPayload {
  senderPlayerId: string;
}

export interface VoiceForwardedIceSignal extends VoiceIceSignalPayload {
  senderPlayerId: string;
}

export interface VoicePeerStatePayload extends VoiceRoomPayload {
  senderPlayerId: string;
  isSelfMuted?: boolean;
  connectionState?: VoiceConnectionState;
}

export interface VoiceParticipantsPayload extends VoiceRoomPayload {
  participants: VoiceParticipantState[];
}

export interface VoiceIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface VoiceJoinResponse extends BasicResponse {
  participant?: VoiceParticipantState;
  participants?: VoiceParticipantState[];
  iceServers?: VoiceIceServer[];
}

export interface RoomClosedPayload {
  roomCode: string;
  reason: "match_complete" | "abandoned" | "empty";
  message: string;
}

export interface ServerToClientEvents {
  "room:state": (state: PublicGameState) => void;
  "room:error": (message: string) => void;
  "room:closed": (payload: RoomClosedPayload) => void;
  "room:list": (rooms: RoomListItem[]) => void;
  "chat:message": (message: ChatMessage) => void;
  "reaction:message": (reaction: ReactionMessage) => void;
  "voice:participants": (payload: VoiceParticipantsPayload) => void;
  "voice:peer-left": (payload: VoicePeerStatePayload) => void;
  "voice:offer": (payload: VoiceForwardedSessionSignal) => void;
  "voice:answer": (payload: VoiceForwardedSessionSignal) => void;
  "voice:ice-candidate": (payload: VoiceForwardedIceSignal) => void;
  "voice:mute-state": (payload: VoicePeerStatePayload) => void;
  "voice:connection-state": (payload: VoicePeerStatePayload) => void;
  "voice:error": (message: string) => void;
  "friends:snapshot": (snapshot: FriendsSnapshot) => void;
  "friends:presence": (payload: FriendPresencePayload) => void;
  "friends:request": (notification: FriendNotification) => void;
  "friends:requestAccepted": (notification: FriendNotification) => void;
  "friends:removed": (payload: FriendTargetPayload) => void;
  "friends:invite": (notification: FriendNotification) => void;
  "friends:inviteAccepted": (notification: FriendNotification) => void;
  "friends:inviteDeclined": (notification: FriendNotification) => void;
  "friends:notification": (notification: FriendNotification) => void;
  roomState: (state: PublicGameState) => void;
  privateHand: (payload: PrivateHandPayload) => void;
  gameError: (message: string) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (response: RoomJoinResponse) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (response: RoomJoinResponse) => void) => void;
  "room:quickPlay": (payload: QuickPlayPayload, ack: (response: RoomJoinResponse) => void) => void;
  "room:playWithBots": (payload: PlayWithBotsPayload, ack: (response: RoomJoinResponse) => void) => void;
  "room:startTournament": (payload: StartTournamentPayload, ack: (response: RoomJoinResponse) => void) => void;
  "room:list": (ack: (rooms: RoomListItem[]) => void) => void;
  "room:addBot": (payload: AddBotPayload, ack: (response: BasicResponse) => void) => void;
  "room:quit": (payload: QuitRoomPayload, ack: (response: QuitRoomResponse) => void) => void;
  "room:reclaimSeat": (payload: RoomActionPayload, ack: (response: QuitRoomResponse) => void) => void;
  "game:start": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "game:nextRound": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "game:move": (payload: MovePayload, ack: (response: BasicResponse) => void) => void;
  "game:takeNextPlayerCards": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "chat:send": (payload: ChatPayload, ack: (response: BasicResponse) => void) => void;
  "reaction:send": (payload: ReactionPayload, ack: (response: BasicResponse) => void) => void;
  "voice:join": (payload: VoiceRoomPayload, ack: (response: VoiceJoinResponse) => void) => void;
  "voice:leave": (payload: VoiceRoomPayload, ack: (response: BasicResponse) => void) => void;
  "voice:offer": (payload: VoiceSessionSignalPayload, ack: (response: BasicResponse) => void) => void;
  "voice:answer": (payload: VoiceSessionSignalPayload, ack: (response: BasicResponse) => void) => void;
  "voice:ice-candidate": (payload: VoiceIceSignalPayload, ack: (response: BasicResponse) => void) => void;
  "voice:mute-state": (payload: VoiceMuteStatePayload, ack: (response: BasicResponse) => void) => void;
  "voice:connection-state": (payload: VoiceConnectionStatePayload, ack: (response: BasicResponse) => void) => void;
  "voice:report": (payload: VoiceReportPayload, ack: (response: BasicResponse) => void) => void;
  "friends:authenticate": (payload: FriendsAuthPayload, ack: (response: FriendsAuthResponse) => void) => void;
  "friends:disconnect": (ack: (response: BasicResponse) => void) => void;
  "friends:refresh": (ack: (response: FriendsAuthResponse) => void) => void;
  "friends:search": (payload: FriendSearchPayload, ack: (response: FriendSearchResponse) => void) => void;
  "friends:request": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:acceptRequest": (payload: FriendRequestActionPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:declineRequest": (payload: FriendRequestActionPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:cancelRequest": (payload: FriendRequestActionPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:remove": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:block": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:unblock": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:invite": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:acceptInvite": (payload: FriendInviteActionPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:declineInvite": (payload: FriendInviteActionPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:joinFriend": (payload: FriendTargetPayload, ack: (response: FriendActionResponse) => void) => void;
  "friends:setAway": (payload: FriendsAwayPayload, ack: (response: BasicResponse) => void) => void;
  "settings:update": (payload: SettingsPayload, ack: (response: BasicResponse) => void) => void;
  createRoom: (payload: CreateRoomPayload, ack: (response: RoomJoinResponse) => void) => void;
  joinRoom: (payload: JoinRoomPayload, ack: (response: RoomJoinResponse) => void) => void;
  reconnectPlayer: (payload: JoinRoomPayload, ack: (response: RoomJoinResponse) => void) => void;
  playerReady: (payload: PlayerReadyPayload, ack: (response: BasicResponse) => void) => void;
  startGame: (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  playCard: (payload: PlayCardPayload, ack: (response: BasicResponse) => void) => void;
  leaveRoom: (payload: QuitRoomPayload, ack: (response: QuitRoomResponse) => void) => void;
}

export type BotRosterRequest = BotSeatConfig[];

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
  Suit
} from "./types.js";

export interface PlayerProfilePayload {
  username: string;
  avatar: string;
  sessionId?: string;
}

export interface CreateRoomPayload extends PlayerProfilePayload {
  settings?: Partial<GameSettings>;
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

export interface ServerToClientEvents {
  "room:state": (state: PublicGameState) => void;
  "room:error": (message: string) => void;
  "room:list": (rooms: RoomListItem[]) => void;
  "chat:message": (message: ChatMessage) => void;
  "reaction:message": (reaction: ReactionMessage) => void;
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
  "game:start": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "game:nextRound": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "game:move": (payload: MovePayload, ack: (response: BasicResponse) => void) => void;
  "game:takeNextPlayerCards": (payload: RoomActionPayload, ack: (response: BasicResponse) => void) => void;
  "chat:send": (payload: ChatPayload, ack: (response: BasicResponse) => void) => void;
  "reaction:send": (payload: ReactionPayload, ack: (response: BasicResponse) => void) => void;
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

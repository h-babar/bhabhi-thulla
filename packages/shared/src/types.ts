export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type BotDifficulty = "easy" | "normal" | "hard";

export type GameStatus = "lobby" | "playing" | "round_over" | "game_over";

export type FunMode = "classic" | "turbo" | "marathon" | "reverse";

export type RoomMode = "private" | "quick" | "bots" | "tournament";

import type { AccountType } from "./profile.js";

export type TournamentStatus = "active" | "won" | "eliminated";

export type TournamentStageId = "group_stage" | "quarter_final" | "semi_final" | "final";

export type TournamentStageStatus = "locked" | "active" | "complete" | "eliminated";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface GameSettings {
  maxPlayers: number;
  handSize: number;
  targetScore: number;
  turnSeconds: number;
  allowSpectators: boolean;
  funMode: FunMode;
}

export interface TournamentNation {
  code: string;
  name: string;
  flag: string;
}

export interface NewPlayerInput {
  id: string;
  sessionId?: string;
  username: string;
  avatar: string;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  accountType?: AccountType;
  profileId?: string;
  rankBadge?: string;
}

export interface PlayerState {
  id: string;
  sessionId?: string;
  username: string;
  avatar: string;
  hand: Card[];
  score: number;
  roundWins: number;
  connected: boolean;
  ready: boolean;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  accountType: AccountType;
  profileId?: string;
  rankBadge?: string;
  missedTurnStreak?: number;
  joinedAt: number;
  lastSeenAt: number;
}

export interface SpectatorState {
  id: string;
  sessionId?: string;
  replacedPlayerId?: string;
  username: string;
  avatar: string;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface GameEvent {
  id: string;
  at: number;
  type:
    | "room"
    | "join"
    | "leave"
    | "start"
    | "play"
    | "draw"
    | "penalty"
    | "round"
    | "game"
    | "bot"
    | "settings";
  message: string;
  playerId?: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  playerId: string;
  username: string;
  avatar: string;
  body: string;
}

export interface ReactionMessage {
  id: string;
  at: number;
  playerId: string;
  username: string;
  emoji: string;
}

export interface RoundScoreLine {
  playerId: string;
  username: string;
  cardsLeft: number;
  pointsLeft: number;
  escaped: boolean;
  isBhabhi: boolean;
}

export interface RoundSummary {
  id: string;
  round: number;
  at: number;
  winnerId: string;
  winnerName: string;
  pointsAwarded: number;
  scoreLines: RoundScoreLine[];
}

export interface GameState {
  roomCode: string;
  roomMode?: RoomMode;
  hostId: string;
  status: GameStatus;
  settings: GameSettings;
  players: PlayerState[];
  spectators: SpectatorState[];
  deck: Card[];
  discardPile: Card[];
  trick: TrickPlay[];
  timedOutPlayerIds: string[];
  lastTrick?: ResolvedTrick;
  winCelebration?: WinCelebration;
  recentPickup?: RecentPickup;
  cardTakeUsedById?: string;
  recentPlayedCardKeys?: Record<string, string[]>;
  leadSuit?: Suit;
  trickLeaderId?: string;
  openingLeadRequired?: boolean;
  escapeOrder: string[];
  activePlayerId?: string;
  direction: 1 | -1;
  dealerIndex: number;
  pendingDraw: number;
  declaredSuit?: Suit;
  dealEndsAt?: number;
  turnStartedAt?: number;
  turnEndsAt?: number;
  round: number;
  roundSummaries: RoundSummary[];
  history: GameEvent[];
  chatMessages: ChatMessage[];
  reactions: ReactionMessage[];
  winnerId?: string;
  bhabhiId?: string;
  championId?: string;
  tournament?: TournamentState;
  updatedAt: number;
}

export interface TrickPlay {
  playerId: string;
  username: string;
  card: Card;
  offSuit: boolean;
}

export interface ResolvedTrick {
  id: string;
  plays: TrickPlay[];
  leadSuit: Suit;
  winnerId: string;
  winnerName: string;
  hasThulla: boolean;
  cleared: boolean;
  pickedUpById?: string;
  pickedUpByName?: string;
  cardCount: number;
  resolvedAt: number;
}

export interface RecentPickup {
  playerId: string;
  cardIds: string[];
  at: number;
}

export interface WinCelebration {
  id: string;
  playerId: string;
  username: string;
  rank: number;
  startedAt: number;
  endsAt: number;
}

export interface TournamentStageSlot extends TournamentNation {
  seed: number;
  isUser: boolean;
  playerId?: string;
  username?: string;
}

export interface TournamentStage {
  id: TournamentStageId;
  name: string;
  stageNumber: number;
  status: TournamentStageStatus;
  slots: TournamentStageSlot[];
  winnerNationCode?: string;
  winnerName?: string;
  completedAt?: number;
}

export interface TournamentState {
  id: string;
  eventId?: string;
  eventName?: string;
  reward?: string;
  offline?: boolean;
  status: TournamentStatus;
  playerId: string;
  playerNationCode: string;
  playerNationName: string;
  difficulty: BotDifficulty;
  stageIndex: number;
  stages: TournamentStage[];
  startedAt: number;
  updatedAt: number;
}

export interface PublicPlayerState
  extends Omit<PlayerState, "hand" | "sessionId" | "profileId"> {
  handCount: number;
  hand?: Card[];
  isYou: boolean;
}

export interface PublicSpectatorState
  extends Omit<SpectatorState, "sessionId"> {
  isYou: boolean;
}

export interface PublicGameState
  extends Omit<GameState, "players" | "spectators" | "deck"> {
  players: PublicPlayerState[];
  spectators: PublicSpectatorState[];
  deckCount: number;
}

export type MoveAction =
  | {
      type: "play";
      cardIds: string[];
      declaredSuit?: Suit;
    }
  | {
      type: "draw";
    };

export interface MoveValidation {
  valid: boolean;
  reason?: string;
}

export interface BotSeatConfig {
  username?: string;
  avatar?: string;
  difficulty: BotDifficulty;
}

export interface RoomListItem {
  roomCode: string;
  status: GameStatus;
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  round: number;
}

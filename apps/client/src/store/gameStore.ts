import type {
  AccountType,
  ActiveGameSummary,
  BasicResponse,
  BotDifficulty,
  ChatMessage,
  ClientToServerEvents,
  GameSettings,
  PublicGameState,
  QuitRoomResponse,
  ReactionMessage,
  RoomJoinResponse,
  RoomListItem,
  RoomMode,
  RoomVisibility,
  ServerToClientEvents,
  Suit
} from "@getaway-cards/shared";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { API_URL } from "../lib/api.js";
import type { ShareableMatchResult } from "../lib/matchResults.js";
import { primeBackgroundMusic, stopBackgroundMusic } from "../lib/music.js";
import { playSound } from "../lib/sound.js";
import { useEngagementStore } from "./engagementStore.js";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ThemeMode = "light" | "dark";
export type CardStyle =
  | "classic"
  | "royal"
  | "midnight"
  | "neon"
  | "minimal"
  | "heritage"
  | "carbon"
  | "championship";
export type TableTheme =
  | "casino"
  | "emerald"
  | "midnight"
  | "royal"
  | "neon"
  | "mahogany"
  | "velvet"
  | "ice"
  | "obsidian"
  | "sapphire"
  | "crimson"
  | "platinum"
  | "jungle"
  | "aurora"
  | "monaco"
  | "blackGold"
  | "oxford"
  | "amethyst"
  | "championship"
  | "bordeaux"
  | "carbon"
  | "pearl";
export type TableLayout = "grand" | "stadium" | "classic" | "compact" | "lounge" | "arena";
export type WeatherTheme = "sunny" | "night" | "rain" | "winter" | "festival" | "mist" | "embers";
type Screen = "home" | "room" | "tournaments";
type SocketStatus = "offline" | "connecting" | "online";

export interface TournamentLaunchOptions {
  eventId?: string;
  eventName?: string;
  reward?: string;
  offline?: boolean;
  turnSeconds?: number;
}

export interface MatchRematchContext {
  roomMode?: RoomMode;
  settings: GameSettings;
  difficulty: BotDifficulty;
  botCount: number;
  continueTournamentStage?: boolean;
  tournament?: TournamentLaunchOptions & { nationCode: string };
}

interface GameStore {
  socketStatus: SocketStatus;
  screen: Screen;
  username: string;
  avatar: string;
  accountType: Exclude<AccountType, "bot">;
  identityId?: string;
  authToken?: string;
  rankBadge?: string;
  sessionId?: string;
  playerId?: string;
  roomCode?: string;
  state?: PublicGameState;
  activeGame?: ActiveGameSummary;
  lastMatchResult?: ShareableMatchResult;
  matchRematchContext?: MatchRematchContext;
  matchResultOpen: boolean;
  rooms: RoomListItem[];
  error?: string;
  theme: ThemeMode;
  muted: boolean;
  musicEnabled: boolean;
  musicVolume: number;
  cardStyle: CardStyle;
  tableTheme: TableTheme;
  tableLayout: TableLayout;
  weatherTheme: WeatherTheme;
  goHome: () => void;
  resumeGame: () => void;
  openTournaments: () => void;
  connect: () => void;
  refreshRooms: () => void;
  updateProfile: (profile: { username?: string; avatar?: string }) => void;
  syncIdentity: (identity: {
    username: string;
    avatar: string;
    accountType: Exclude<AccountType, "bot">;
    identityId: string;
    authToken?: string;
    rankBadge?: string;
  }) => void;
  setTheme: (theme: ThemeMode) => void;
  setMuted: (muted: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setCardStyle: (style: CardStyle) => void;
  setTableTheme: (theme: TableTheme) => void;
  setTableLayout: (layout: TableLayout) => void;
  setWeatherTheme: (theme: WeatherTheme) => void;
  captureMatchResult: (result: ShareableMatchResult, rematch: MatchRematchContext) => void;
  openMatchResult: () => void;
  closeMatchResult: () => void;
  rematchLastGame: () => void;
  hydrateTheme: () => void;
  createRoom: (settings?: Partial<GameSettings>, visibility?: RoomVisibility) => void;
  joinRoom: (roomCode: string, asSpectator?: boolean) => void;
  quickPlay: (difficulty?: BotDifficulty, settings?: Partial<GameSettings>) => void;
  playWithBots: (difficulty: BotDifficulty, botCount: number, settings?: Partial<GameSettings>) => void;
  startTournament: (nationCode: string, difficulty: BotDifficulty, options?: TournamentLaunchOptions) => void;
  addBot: (difficulty: BotDifficulty) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  nextRound: () => void;
  playCards: (cardIds: string[], declaredSuit?: Suit) => void;
  takeNextPlayerCards: () => void;
  drawCard: () => void;
  sendChat: (body: string) => void;
  sendReaction: (emoji: string) => void;
  updateRoomSettings: (settings: Partial<GameSettings>) => void;
  quitGame: (replaceWithBot?: boolean) => void;
  reclaimSeat: () => void;
  rejoinActiveGame: () => void;
  takeControl: () => void;
  setAutoPlay: (enabled: boolean) => void;
  leaveRoom: () => void;
  clearError: () => void;
  enterRoomFromSocial: (response: RoomJoinResponse) => void;
}

let socket: GameSocket | undefined;

export function getGameSocket(): GameSocket | undefined {
  return socket;
}

const initialTheme: ThemeMode = "dark";

function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      const expireRoomSession = (message?: string): void => {
        set({
          screen: "home",
          roomCode: undefined,
          playerId: undefined,
          state: undefined,
          activeGame: undefined,
          error: message
        });
      };

      const isMissingRoomError = (message: string | undefined): boolean =>
        Boolean(message?.toLowerCase().includes("no room exists") || message?.toLowerCase().includes("room not found"));

      const handleJoinResponse = (
        response: RoomJoinResponse,
        options: { autoReconnect?: boolean } = {}
      ): void => {
        if (!response.ok || !response.state || !response.roomCode || !response.playerId) {
          if (isMissingRoomError(response.error)) {
            expireRoomSession(
              options.autoReconnect
                ? undefined
                : "That room is no longer active. Create a new room or join a live code."
            );
            return;
          }

          set({ error: response.error ?? "Unable to join room." });
          return;
        }

        set({
          roomCode: response.roomCode,
          playerId: response.playerId,
          sessionId: response.sessionId ?? get().sessionId,
          state: response.state,
          activeGame: undefined,
          lastMatchResult: undefined,
          matchRematchContext: undefined,
          matchResultOpen: false,
          screen: "room",
          error: undefined
        });
        playSound(response.state.status === "playing" ? "deal" : "click", get().muted);
      };

      const handleBasic = (response: BasicResponse, sound: "click" | "play" | "draw" | "none" = "click"): void => {
        if (!response.ok) {
          set({ error: response.error ?? "Action failed." });
          return;
        }

        if (sound !== "none") {
          playSound(sound, get().muted);
        }
      };

      const ensureSocket = (): GameSocket => {
        if (!socket) {
          socket = io(API_URL, {
            autoConnect: false,
            transports: ["websocket", "polling"]
          });

          socket.on("connect", () => {
            set({ socketStatus: "online", error: undefined });
            const {
              roomCode,
              sessionId,
              username,
              avatar,
              accountType,
              identityId,
              authToken,
              rankBadge
            } = get();
            socket?.emit("room:list", (rooms) => set({ rooms }));
            if (roomCode && sessionId) {
              socket?.emit(
                "reconnectPlayer",
                {
                  roomCode,
                  sessionId,
                  username,
                  avatar,
                  guestId: accountType === "guest" ? identityId : undefined,
                  accountType,
                  authToken,
                  profileId: accountType === "registered" ? identityId : undefined,
                  rankBadge
                },
                (response) => handleJoinResponse(response, { autoReconnect: true })
              );
            } else if (accountType === "registered" && authToken) {
              socket?.emit(
                "player:findActiveGame",
                {
                  username,
                  avatar,
                  accountType,
                  authToken,
                  profileId: identityId
                },
                (response) => {
                  if (response.ok) set({ activeGame: response.game });
                }
              );
            }
          });

          socket.on("disconnect", () => {
            set({ socketStatus: "offline" });
          });

          socket.on("connect_error", () => {
            set({
              socketStatus: "offline",
              error: `Could not reach the game server at ${API_URL}.`
            });
          });

          socket.on("room:state", (state) => {
            const previous = get().state;
            const becameWinner =
              state.status !== previous?.status &&
              (state.status === "round_over" || state.status === "game_over");
            const startedNewHand =
              state.status === "playing" &&
              (previous?.status !== "playing" || previous.round !== state.round);
            set({ state, screen: "room", error: undefined });
            if (state.tournament?.eventId && state.tournament.offline) {
              useEngagementStore.getState().syncOfflineCup(state.tournament);
            }
            if (startedNewHand) {
              playSound("deal", get().muted);
            }
            if (becameWinner) {
              playSound("win", get().muted);
            }
          });

          socket.on("room:error", (message) => {
            set({ error: message });
          });

          socket.on("room:closed", (payload) => {
            if (get().roomCode !== payload.roomCode) {
              return;
            }

            stopBackgroundMusic();
            expireRoomSession(payload.reason === "match_complete" ? undefined : payload.message);
          });

          socket.on("gameError", (message) => {
            set({ error: message });
          });

          socket.on("privateHand", ({ roomCode, playerId, hand }) => {
            set((current) => {
              if (!current.state || current.state.roomCode !== roomCode) {
                return {};
              }

              return {
                state: {
                  ...current.state,
                  players: current.state.players.map((player) =>
                    player.id === playerId
                      ? {
                          ...player,
                          hand,
                          handCount: hand.length,
                          isYou: true
                        }
                      : player
                  )
                }
              };
            });
          });

          socket.on("room:list", (rooms) => {
            set({ rooms });
          });

          socket.on("chat:message", (message) => {
            set((current) => ({
              state: current.state
                ? {
                    ...current.state,
                    chatMessages: current.state.chatMessages.some((item) => item.id === message.id)
                      ? current.state.chatMessages
                      : [message, ...current.state.chatMessages].slice(0, 60)
                  }
                : current.state
            }));
          });

          socket.on("reaction:message", (reaction) => {
            set((current) => ({
              state: current.state
                ? {
                    ...current.state,
                    reactions: current.state.reactions.some((item) => item.id === reaction.id)
                      ? current.state.reactions
                      : [reaction, ...current.state.reactions].slice(0, 20)
                  }
                : current.state
            }));
          });
        }

        if (!socket.connected) {
          set({ socketStatus: "connecting" });
          socket.connect();
        }

        return socket;
      };

      const profilePayload = () => ({
        username: get().username,
        avatar: get().avatar,
        sessionId: get().sessionId,
        guestId: get().accountType === "guest" ? get().identityId : undefined,
        accountType: get().accountType,
        authToken: get().authToken,
        profileId: get().accountType === "registered" ? get().identityId : undefined,
        rankBadge: get().rankBadge
      });

      const emitRoomAction = (
        event: "startGame" | "game:nextRound",
        sound: "click" | "deal" = "click"
      ): void => {
        const roomCode = get().roomCode;
        if (!roomCode) return;
        if (get().musicEnabled) primeBackgroundMusic();
        ensureSocket().emit(event, { roomCode }, (response) =>
          handleBasic(response, sound === "deal" ? "click" : sound)
        );
      };

      return {
        socketStatus: "offline",
        screen: "home",
        username: "Guest",
        avatar: "Aero",
        accountType: "guest",
        rooms: [],
        matchResultOpen: false,
        theme: initialTheme,
        muted: false,
        musicEnabled: true,
        musicVolume: 0.34,
        cardStyle: "classic",
        tableTheme: "casino",
        tableLayout: "compact",
        weatherTheme: "sunny",
        goHome: () => {
          set({ screen: "home", error: undefined });
        },
        resumeGame: () => {
          if (get().state && get().roomCode) {
            set({ screen: "room", error: undefined });
          }
        },
        openTournaments: () => {
          set({ screen: "tournaments", error: undefined });
        },
        connect: () => {
          ensureSocket();
        },
        refreshRooms: () => {
          ensureSocket().emit("room:list", (rooms) => set({ rooms }));
        },
        updateProfile: (profile) => {
          set((current) => ({
            username: profile.username?.slice(0, 18) ?? current.username,
            avatar: profile.avatar?.slice(0, 24) ?? current.avatar
          }));
        },
        syncIdentity: (identity) => {
          set({
            username: identity.username.slice(0, 24),
            avatar: identity.avatar.slice(0, 24),
            accountType: identity.accountType,
            identityId: identity.identityId,
            authToken: identity.authToken,
            rankBadge: identity.rankBadge
          });
          if (identity.accountType === "registered" && identity.authToken) {
            ensureSocket().emit(
              "player:findActiveGame",
              {
                username: identity.username,
                avatar: identity.avatar,
                accountType: identity.accountType,
                authToken: identity.authToken,
                profileId: identity.identityId,
                rankBadge: identity.rankBadge
              },
              (response) => {
                if (response.ok) set({ activeGame: response.game });
              }
            );
          } else {
            set({ activeGame: undefined });
          }
        },
        setTheme: (theme) => {
          applyThemeToDocument(theme);
          set({ theme });
        },
        setMuted: (muted) => {
          set({ muted });
          if (muted) {
            stopBackgroundMusic();
          } else {
            playSound("click", false);
            if (get().musicEnabled && get().state?.status === "playing") {
              primeBackgroundMusic();
            }
          }
        },
        setMusicEnabled: (musicEnabled) => {
          set({ musicEnabled });
          if (musicEnabled) {
            primeBackgroundMusic();
          } else {
            stopBackgroundMusic();
          }
        },
        setMusicVolume: (musicVolume) => {
          set({ musicVolume: Math.max(0, Math.min(1, musicVolume)) });
          if (get().musicEnabled) primeBackgroundMusic();
        },
        setCardStyle: (cardStyle) => {
          set({ cardStyle });
          playSound("click", get().muted);
        },
        setTableTheme: (tableTheme) => {
          set({ tableTheme });
          playSound("click", get().muted);
        },
        setTableLayout: (tableLayout) => {
          set({ tableLayout });
          playSound("click", get().muted);
        },
        setWeatherTheme: (weatherTheme) => {
          set({ weatherTheme });
          playSound("click", get().muted);
        },
        captureMatchResult: (lastMatchResult, matchRematchContext) => {
          set({ lastMatchResult, matchRematchContext, matchResultOpen: false });
        },
        openMatchResult: () => {
          if (get().lastMatchResult) set({ matchResultOpen: true });
        },
        closeMatchResult: () => set({ matchResultOpen: false }),
        rematchLastGame: () => {
          const rematch = get().matchRematchContext;
          if (!rematch) {
            set({ matchResultOpen: false });
            return;
          }
          set({ matchResultOpen: false });
          if (rematch.continueTournamentStage && get().roomCode && get().state) {
            get().nextRound();
            return;
          }
          get().leaveRoom();
          window.setTimeout(() => {
            if (rematch.roomMode === "quick") {
              get().quickPlay(rematch.difficulty, rematch.settings);
            } else if (rematch.roomMode === "bots") {
              get().playWithBots(rematch.difficulty, rematch.botCount, rematch.settings);
            } else if (rematch.roomMode === "tournament" && rematch.tournament) {
              get().startTournament(rematch.tournament.nationCode, rematch.difficulty, rematch.tournament);
            } else {
              get().createRoom(rematch.settings, "private");
            }
          }, 80);
        },
        hydrateTheme: () => {
          applyThemeToDocument(get().theme);
          if (get().musicVolume > 0.36) {
            set({ musicVolume: 0.34 });
          }
        },
        createRoom: (settings, visibility = "private") => {
          if (get().musicEnabled) primeBackgroundMusic();
          ensureSocket().emit(
            "createRoom",
            {
              ...profilePayload(),
              settings,
              visibility
            },
            handleJoinResponse
          );
        },
        joinRoom: (roomCode, asSpectator = false) => {
          if (get().musicEnabled) primeBackgroundMusic();
          ensureSocket().emit(
            "joinRoom",
            {
              ...profilePayload(),
              roomCode,
              asSpectator
            },
            handleJoinResponse
          );
        },
        quickPlay: (difficulty = "normal", settings) => {
          if (get().musicEnabled) primeBackgroundMusic();
          ensureSocket().emit(
            "room:quickPlay",
            {
              ...profilePayload(),
              difficulty,
              settings
            },
            handleJoinResponse
          );
        },
        playWithBots: (difficulty, botCount, settings) => {
          if (get().musicEnabled) primeBackgroundMusic();
          ensureSocket().emit(
            "room:playWithBots",
            {
              ...profilePayload(),
              difficulty,
              botCount,
              settings
            },
            handleJoinResponse
          );
        },
        startTournament: (nationCode, difficulty, options) => {
          if (get().musicEnabled) primeBackgroundMusic();
          ensureSocket().emit(
            "room:startTournament",
            {
              ...profilePayload(),
              nationCode,
              difficulty,
              ...options
            },
            handleJoinResponse
          );
        },
        addBot: (difficulty) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("room:addBot", { roomCode, difficulty }, (response) =>
            handleBasic(response)
          );
        },
        setReady: (ready) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("playerReady", { roomCode, ready }, (response) =>
            handleBasic(response)
          );
        },
        startGame: () => emitRoomAction("startGame", "deal"),
        nextRound: () => emitRoomAction("game:nextRound", "deal"),
        playCards: (cardIds, declaredSuit) => {
          const roomCode = get().roomCode;
          if (!roomCode || cardIds.length === 0) return;
          ensureSocket().emit(
            "playCard",
            {
              roomCode,
              cardId: cardIds[0]!,
              declaredSuit,
              turnId: get().state?.turnId
            },
            (response) => handleBasic(response, "none")
          );
        },
        takeNextPlayerCards: () => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit(
            "game:takeNextPlayerCards",
            { roomCode, turnId: get().state?.turnId },
            (response) => handleBasic(response, "draw")
          );
        },
        drawCard: () => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit(
            "game:move",
            {
              roomCode,
              turnId: get().state?.turnId,
              move: {
                type: "draw"
              }
            },
            (response) => handleBasic(response, "draw")
          );
        },
        sendChat: (body) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("chat:send", { roomCode, body }, (response) =>
            handleBasic(response)
          );
        },
        sendReaction: (emoji) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("reaction:send", { roomCode, emoji }, (response) =>
            handleBasic(response)
          );
        },
        updateRoomSettings: (settings) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("settings:update", { roomCode, settings }, (response) =>
            handleBasic(response)
          );
        },
        quitGame: (replaceWithBot = false) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("leaveRoom", { roomCode, replaceWithBot }, (response: QuitRoomResponse) => {
            if (!response.ok) {
              set({ error: response.error ?? "Could not quit the game." });
              return;
            }

            playSound("click", get().muted);
            if (replaceWithBot && response.stayedAsSpectator && response.state && response.roomCode && response.playerId) {
              set({
                screen: "room",
                roomCode: response.roomCode,
                playerId: response.playerId,
                sessionId: response.sessionId ?? get().sessionId,
                state: response.state,
                error: undefined
              });
              return;
            }

            set({
              screen: "home",
              roomCode: undefined,
              playerId: undefined,
              state: undefined,
              error: undefined
            });
          });
        },
        reclaimSeat: () => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit("room:reclaimSeat", { roomCode }, (response) => {
            if (!response.ok || !response.state || !response.roomCode || !response.playerId) {
              set({ error: response.error ?? "Could not rejoin your seat." });
              return;
            }

            playSound("click", get().muted);
            set({
              screen: "room",
              roomCode: response.roomCode,
              playerId: response.playerId,
              sessionId: response.sessionId ?? get().sessionId,
              state: response.state,
              error: undefined
            });
          });
        },
        rejoinActiveGame: () => {
          if (get().accountType !== "registered" || !get().authToken) return;
          ensureSocket().emit("player:rejoinActive", profilePayload(), (response) => {
            handleJoinResponse(response);
          });
        },
        takeControl: () => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit(
            "player:takeControl",
            { roomCode, turnId: get().state?.turnId },
            (response) => handleBasic(response)
          );
        },
        setAutoPlay: (enabled) => {
          const roomCode = get().roomCode;
          if (!roomCode) return;
          ensureSocket().emit(
            "player:setAutoPlay",
            { roomCode, turnId: get().state?.turnId, enabled },
            (response) => handleBasic(response)
          );
        },
        leaveRoom: () => {
          stopBackgroundMusic();
          socket?.disconnect();
          set({
            screen: "home",
            roomCode: undefined,
            playerId: undefined,
            state: undefined,
            error: undefined
          });
        },
        clearError: () => set({ error: undefined }),
        enterRoomFromSocial: (response) => handleJoinResponse(response)
      };
    },
    {
      name: "getaway-cards-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        username: state.username,
        avatar: state.avatar,
        accountType: state.accountType,
        identityId: state.identityId,
        sessionId: state.sessionId,
        roomCode: state.roomCode,
        theme: state.theme,
        muted: state.muted,
        musicEnabled: state.musicEnabled,
        musicVolume: state.musicVolume,
        cardStyle: state.cardStyle,
        tableTheme: state.tableTheme,
        tableLayout: state.tableLayout,
        weatherTheme: state.weatherTheme,
        lastMatchResult: state.lastMatchResult,
        matchRematchContext: state.matchRematchContext,
        matchResultOpen: state.matchResultOpen
      })
    }
  )
);

export type { ChatMessage, ReactionMessage };

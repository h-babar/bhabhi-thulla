import {
  DEAL_ANIMATION_MS,
  TRICK_REVEAL_MS,
  SUIT_LABELS,
  isCardPlayableForState,
  rankSortValue,
  type BotDifficulty,
  type Card,
  type PublicGameState
} from "@getaway-cards/shared";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BookOpen,
  Bot,
  Copy,
  Crown,
  Eye,
  Ellipsis,
  Hand,
  Home,
  LogOut,
  MessageCircle,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Share2,
  Sparkles,
  Timer,
  Trophy,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { stopBackgroundMusic, updateBackgroundMusic, type MusicPhase } from "../lib/music.js";
import { buildShareableMatchResult } from "../lib/matchResults.js";
import { playerInitials } from "../lib/playerInitials.js";
import { playSound } from "../lib/sound.js";
import { useAuthStore } from "../store/authStore.js";
import { useGameStore } from "../store/gameStore.js";
import { CardView } from "./CardView.js";
import { ChatPanel } from "./ChatPanel.js";
import { PlayerBadge } from "./PlayerBadge.js";
import { RulesModal } from "./RulesModal.js";
import { ScoreBoard } from "./ScoreBoard.js";
import { SettingsModal } from "./SettingsModal.js";
import { ProfileMenu } from "./auth/ProfileMenu.js";
import { FriendsButton } from "./friends/FriendsButton.js";
import { PlayerVoiceControl } from "../voice/PlayerVoiceControl.js";
import { VoiceControls } from "../voice/VoiceControls.js";
import { useVoiceChat } from "../voice/VoiceChatProvider.js";

type ActiveTableTool = "none" | "odds" | "score" | "chat";
type HandSortMode = "deal" | "suit" | "rank";

export function GameTable() {
  const state = useGameStore((store) => store.state);
  const playerId = useGameStore((store) => store.playerId);
  const leaveRoom = useGameStore((store) => store.leaveRoom);
  const quitGame = useGameStore((store) => store.quitGame);
  const reclaimSeat = useGameStore((store) => store.reclaimSeat);
  const takeControl = useGameStore((store) => store.takeControl);
  const setAutoPlay = useGameStore((store) => store.setAutoPlay);
  const addBot = useGameStore((store) => store.addBot);
  const setReady = useGameStore((store) => store.setReady);
  const startGame = useGameStore((store) => store.startGame);
  const nextRound = useGameStore((store) => store.nextRound);
  const captureMatchResult = useGameStore((store) => store.captureMatchResult);
  const openMatchResult = useGameStore((store) => store.openMatchResult);
  const playCards = useGameStore((store) => store.playCards);
  const takeNextPlayerCards = useGameStore((store) => store.takeNextPlayerCards);
  const updateRoomSettings = useGameStore((store) => store.updateRoomSettings);
  const tableTheme = useGameStore((store) => store.tableTheme);
  const tableLayout = useGameStore((store) => store.tableLayout);
  const weatherTheme = useGameStore((store) => store.weatherTheme);
  const musicEnabled = useGameStore((store) => store.musicEnabled);
  const musicVolume = useGameStore((store) => store.musicVolume);
  const muted = useGameStore((store) => store.muted);
  const guestProfile = useAuthStore((store) => store.guest);
  const registeredProfile = useAuthStore((store) => store.profile);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [takeCardsOpen, setTakeCardsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [lastCleanedTrickId, setLastCleanedTrickId] = useState<string>();
  const [dealNow, setDealNow] = useState(Date.now());
  const [tablePhrase, setTablePhrase] = useState<{ id: number; text: string; tone: "good" | "warn" | "rush" }>();
  const [activeTableTool, setActiveTableTool] = useState<ActiveTableTool>("none");
  const [handSortMode, setHandSortMode] = useState<HandSortMode>("deal");
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  const lastPhrasePlayRef = useRef<string | undefined>(undefined);
  const lastPhraseTrickRef = useRef<string | undefined>(undefined);
  const hurryTurnRef = useRef<string | undefined>(undefined);
  const lastPlayedSoundRef = useRef<string | undefined>(undefined);
  const lastTurnSoundRef = useRef<string | undefined>(undefined);
  const openedMatchResultRef = useRef<string | undefined>(undefined);
  const sharePreferences = registeredProfile?.preferences ?? guestProfile?.preferences;
  const shareableMatchResult = useMemo(
    () => state
      ? buildShareableMatchResult(state, {
          currentPlayerId: playerId,
          currentAvatarUrl: registeredProfile?.photoUrl,
          includeCurrentAvatar: sharePreferences?.shareAvatarInResults ?? true,
          currentUsername: registeredProfile?.username,
          includeCurrentUsername: sharePreferences?.shareUsernameInResults ?? true
        })
      : undefined,
    [
      playerId,
      registeredProfile?.photoUrl,
      registeredProfile?.username,
      sharePreferences?.shareAvatarInResults,
      sharePreferences?.shareUsernameInResults,
      state
    ]
  );

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth, { passive: true });
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    const resultId = shareableMatchResult?.publicMatchId;
    if (!resultId || !state || openedMatchResultRef.current === resultId) return undefined;
    openedMatchResultRef.current = resultId;
    const firstBot = state.players.find((player) => player.isBot);
    captureMatchResult(shareableMatchResult, {
      roomMode: state.roomMode,
      settings: { ...state.settings },
      difficulty: firstBot?.botDifficulty ?? state.tournament?.difficulty ?? "normal",
      botCount: Math.max(1, state.players.filter((player) => player.isBot).length),
      continueTournamentStage: state.tournament?.status === "active" && state.status !== "game_over",
      tournament: state.tournament
        ? {
            nationCode: state.tournament.playerNationCode,
            eventId: state.tournament.eventId,
            eventName: state.tournament.eventName,
            reward: state.tournament.reward,
            offline: state.tournament.offline,
            turnSeconds: state.settings.turnSeconds
          }
        : undefined
    });
    const celebrationDelay = state?.winCelebration
      ? Math.max(350, state.winCelebration.endsAt - Date.now() + 250)
      : 500;
    const timeout = window.setTimeout(() => {
      openMatchResult();
    }, celebrationDelay);
    return () => window.clearTimeout(timeout);
  }, [captureMatchResult, openMatchResult, shareableMatchResult, state]);

  useEffect(() => {
    setSelectedIds([]);
  }, [state?.activePlayerId, state?.trick.length]);

  useEffect(() => {
    const dealActive = Boolean(state?.dealEndsAt && Date.now() < state.dealEndsAt);
    const revealActive = Boolean(
      state?.lastTrick && Date.now() < state.lastTrick.resolvedAt + TRICK_REVEAL_MS
    );
    if (!dealActive && !revealActive) {
      return undefined;
    }

    setDealNow(Date.now());
    const interval = window.setInterval(() => setDealNow(Date.now()), 120);
    return () => window.clearInterval(interval);
  }, [state?.dealEndsAt, state?.lastTrick?.id, state?.lastTrick?.resolvedAt]);

  useEffect(() => {
    const trickId = state?.lastTrick?.id;
    if (!trickId || lastCleanedTrickId === trickId) {
      return;
    }

    setLastCleanedTrickId(trickId);
    const timeout = window.setTimeout(() => playSound("clear", muted), 3000);
    return () => window.clearTimeout(timeout);
  }, [lastCleanedTrickId, muted, state?.lastTrick?.id]);

  useEffect(() => {
    if (!state || state.status !== "playing") {
      lastPlayedSoundRef.current = undefined;
      return;
    }

    const latest = state.trick.at(-1);
    if (!latest) {
      return;
    }

    const soundKey = `${state.round}-${latest.playerId}-${latest.card.id}`;
    if (lastPlayedSoundRef.current === soundKey) {
      return;
    }

    lastPlayedSoundRef.current = soundKey;
    playSound(latest.offSuit ? "thulla" : "play", muted);
  }, [muted, state, state?.round, state?.trick]);

  if (!state) {
    return null;
  }

  const isDealPhase = state.status === "playing" && Boolean(state.dealEndsAt && dealNow < state.dealEndsAt);
  const isTableRevealPhase =
    state.status === "playing" &&
    Boolean(state.lastTrick && dealNow < state.lastTrick.resolvedAt + TRICK_REVEAL_MS);
  const me = state.players.find((player) => player.id === playerId);
  const isSpectator = !me;
  const mySpectator = state.spectators.find(
    (spectator) => spectator.id === playerId || spectator.isYou
  );
  const replacementSeat = mySpectator?.replacedPlayerId
    ? state.players.find((player) => player.id === mySpectator.replacedPlayerId)
    : undefined;
  const canReclaimSeat =
    state.status !== "game_over" && Boolean(replacementSeat?.isBot);
  const isHost = playerId === state.hostId;
  const isCelebratingWin = Boolean(state.winCelebration);
  const isMyTurn =
    state.activePlayerId === playerId &&
    state.status === "playing" &&
    me?.controlState !== "temporary-bot" &&
    Boolean(me?.connected) &&
    !isCelebratingWin &&
    !isDealPhase &&
    !isTableRevealPhase;
  const hand = me?.hand ?? [];
  const displayedHand = useMemo(() => sortHandForDisplay(hand, handSortMode), [hand, handSortMode]);
  const responsiveHandStyle = getResponsiveHandStyle(displayedHand.length, viewportWidth);
  const activePlayer = state.players.find((player) => player.id === state.activePlayerId);
  const nextCardTakeTarget =
    isMyTurn &&
    state.trick.length === 0 &&
    !state.leadSuit &&
    state.cardTakeUsedById !== playerId &&
    playerId
      ? findNextPlayerForCardTake(state, playerId)
      : undefined;
  const selectedCards = hand.filter((card) => selectedIds.includes(card.id));
  const selectedCard = selectedCards[0];
  const legalCards = hand.filter((card) => isCardPlayableForState(state, hand, card));
  const canPlaySelected =
    isMyTurn &&
    selectedCards.length === 1 &&
    selectedCard !== undefined &&
    isCardPlayableForState(state, hand, selectedCard);
  const escapedNames = useMemo(
    () =>
      state.escapeOrder
        .map((id) => state.players.find((player) => player.id === id)?.username)
        .filter((name): name is string => Boolean(name)),
    [state.escapeOrder, state.players]
  );
  const musicPhase = useMemo(() => getMusicPhase(state, playerId), [playerId, state]);

  useEffect(() => {
    updateBackgroundMusic({
      enabled: !muted && musicEnabled && (state.status === "playing" || Boolean(state.winCelebration)),
      volume: musicVolume,
      phase: musicPhase
    });
  }, [musicEnabled, musicPhase, musicVolume, muted, state.status, state.winCelebration]);

  useEffect(() => () => stopBackgroundMusic(), []);

  const showPhrase = (text: string, tone: "good" | "warn" | "rush" = "good"): void => {
    setTablePhrase({ id: Date.now(), text, tone });
  };

  useEffect(() => {
    if (isDealPhase || state.trick.length === 0) {
      return;
    }

    const latest = state.trick.at(-1);
    const phraseKey = latest ? `${latest.playerId}-${latest.card.id}` : undefined;
    if (!latest || !phraseKey || lastPhrasePlayRef.current === phraseKey) {
      return;
    }

    lastPhrasePlayRef.current = phraseKey;
    showPhrase(latest.offSuit ? "Bad luck!" : "Nice move!", latest.offSuit ? "warn" : "good");
  }, [isDealPhase, state.trick]);

  useEffect(() => {
    const lastTrick = state.lastTrick;
    if (!lastTrick || lastPhraseTrickRef.current === lastTrick.id) {
      return;
    }

    lastPhraseTrickRef.current = lastTrick.id;
    showPhrase(lastTrick.hasThulla ? "Bad luck!" : "Well played!", lastTrick.hasThulla ? "warn" : "good");
  }, [state.lastTrick]);

  useEffect(() => {
    if (!isMyTurn || !state.turnEndsAt || !state.activePlayerId) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const remaining = state.turnEndsAt ? state.turnEndsAt - Date.now() : Number.POSITIVE_INFINITY;
      const turnKey = `${state.round}-${state.activePlayerId}-${state.turnStartedAt ?? 0}`;
      if (remaining > 0 && remaining <= 5000 && hurryTurnRef.current !== turnKey) {
        hurryTurnRef.current = turnKey;
        showPhrase("Hurry up!", "rush");
      }
    }, 350);

    return () => window.clearInterval(interval);
  }, [isMyTurn, state.activePlayerId, state.round, state.turnEndsAt, state.turnStartedAt]);

  useEffect(() => {
    if (!isMyTurn || !state.activePlayerId || !state.turnStartedAt) {
      return;
    }

    const turnKey = `${state.round}-${state.activePlayerId}-${state.turnStartedAt}`;
    if (lastTurnSoundRef.current === turnKey) {
      return;
    }

    lastTurnSoundRef.current = turnKey;
    playSound("turn", muted);
  }, [isMyTurn, muted, state.activePlayerId, state.round, state.turnStartedAt]);

  useEffect(() => {
    if (!tablePhrase) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setTablePhrase(undefined), 2000);
    return () => window.clearTimeout(timeout);
  }, [tablePhrase]);

  const toggleCard = (card: Card): void => {
    if (!isMyTurn || !isCardPlayableForState(state, hand, card)) {
      return;
    }

    setSelectedIds((current) => (current.includes(card.id) ? [] : [card.id]));
  };

  const playSelected = (): void => {
    if (!canPlaySelected) return;
    playCards(selectedIds);
    setSelectedIds([]);
  };

  const playDraggedCard = (card: Card): void => {
    if (!isMyTurn || !isCardPlayableForState(state, hand, card)) return;
    playCards([card.id]);
    setSelectedIds([]);
  };

  const cycleHandSort = (): void => {
    setHandSortMode((current) => current === "deal" ? "suit" : current === "suit" ? "rank" : "deal");
  };

  const copyRoomLink = async (): Promise<void> => {
    const link = `${window.location.origin}?room=${state.roomCode}`;
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const inActivePlay = state.status === "playing";

  return (
    <main className={clsx(
      "mx-auto w-full px-2 py-2 sm:px-4 lg:px-5",
      inActivePlay ? "game-table-main" : "min-h-screen"
    )}>
      <header className={clsx("mb-3 flex flex-wrap items-center justify-between gap-3", inActivePlay && "playing-header")}>
        <div className={clsx("flex items-center gap-3", inActivePlay && "playing-hud-left")}>
          <button className="icon-button" onClick={leaveRoom} aria-label="Leave room">
            <Home size={18} />
          </button>
          {inActivePlay ? (
            <div
              className="active-room-stack"
              aria-label={state.roomMode === "quick"
                ? `Room ${state.roomCode}`
                : `Room ${state.roomCode}, round ${state.round}`}
            >
              <button type="button" className="active-room-code" onClick={copyRoomLink}>
                <span>
                  <small>Room code</small>
                  <strong>{state.roomCode}</strong>
                </span>
                <Copy size={16} />
              </button>
              {state.roomMode !== "quick" ? (
                <div className="active-round-card">
                  <small>Round</small>
                  <strong>{state.round} / {state.settings.targetScore}</strong>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
                Room {state.roomCode}
              </p>
              <h1 className="text-2xl font-black text-slate-950 dark:text-white">
                {state.status === "lobby" ? "Gather your crew" : "Bhabhi Thulla hand"}
              </h1>
            </div>
          )}
          {inActivePlay ? (
            <TurnTimerBadge state={state} activePlayerName={activePlayer?.username} />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VoiceControls />
          <FriendsButton compact />
          <button className="secondary-button" onClick={() => setRulesOpen(true)}>
            <BookOpen size={17} />
            Rules
          </button>
          <button className="secondary-button" onClick={copyRoomLink}>
            {copied ? <Copy size={17} /> : <Share2 size={17} />}
            {copied ? "Copied" : "Share"}
          </button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings size={18} />
          </button>
          <ProfileMenu compact onSettings={() => setSettingsOpen(true)} />
        </div>
      </header>

      {state.status === "lobby" ? (
        <LobbyPanel
          state={state}
          isHost={isHost}
          addBot={addBot}
          playerId={playerId}
          setReady={setReady}
          startGame={startGame}
          updateRoomSettings={updateRoomSettings}
        />
      ) : (
        <section className={clsx("grid min-w-0 gap-3", inActivePlay && "play-surface")}>
          <div className="game-play-column grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5">
            <div
              className={clsx(
                "game-felt table-shell play-table-shell relative min-h-[clamp(16.5rem,calc(100dvh-19rem),31rem)] min-w-0 overflow-hidden rounded-[2rem] p-2.5 text-white sm:p-3",
                `table-theme-${tableTheme}`,
                `table-layout-${tableLayout}`,
                `weather-theme-${weatherTheme}`
              )}
            >
              <div className="table-spotlight" />
              <TableAmbience />
              <WeatherAmbience theme={weatherTheme} />
              <ReactionBurst state={state} />

              <div className="relative z-10 flex h-full min-h-[inherit] min-w-0 flex-col gap-3">
                <TableStatusBar
                  state={state}
                  escapedCount={escapedNames.length}
                />

                <div className="casino-table-stage relative grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] place-items-center">
                  <CasinoSeats state={state} playerId={playerId} />
                  <div className="trick-table-layer relative z-10 grid w-full min-w-0 place-items-center">
                    <TrickTable
                      state={state}
                      playerId={playerId}
                      escapedNames={escapedNames}
                      activePlayerName={activePlayer?.username}
                    />
                  </div>
                </div>

                {isSpectator ? (
                  <div className="spectator-table-note rounded-2xl bg-white/10 p-4 text-center font-bold">
                    <Eye className="mx-auto mb-2" />
                    <p>Spectator mode: you can watch, chat, and react.</p>
                    {canReclaimSeat ? (
                      <button
                        className="primary-button mx-auto mt-3 px-4 py-2"
                        onClick={reclaimSeat}
                      >
                        <Play size={17} />
                        Rejoin game
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <WinOverlay state={state} />
              <TablePhraseOverlay phrase={tablePhrase} />
              <AnimatePresence>
                {isDealPhase ? (
                  <DealerOverlay key={`deal-${state.round}`} muted={muted} playerCount={state.players.length} />
                ) : null}
              </AnimatePresence>
              {inActivePlay ? (
                <ActiveTableTools
                  activeTool={activeTableTool}
                  onChange={setActiveTableTool}
                  state={state}
                />
              ) : null}
            </div>

            <section
              className={clsx(
                "hand-dock hand-tray rounded-[1.5rem] px-3 py-2 sm:px-4 sm:py-2.5",
                inActivePlay && "active-hand-dock"
              )}
            >
              <div className="hand-tray-header mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
                    Your Hand
                  </p>
                  <h2 className="text-base font-black text-slate-950 dark:text-white sm:text-lg">
                    {isSpectator
                      ? "Watching the hand"
                      : isDealPhase
                        ? "Cards arriving"
                        : `${hand.length} card${hand.length === 1 ? "" : "s"}`}
                  </h2>
                </div>
                {me?.controlState === "temporary-bot" ? (
                  <SeatControlActions
                    disconnected={!me.connected}
                    reconnecting={me.connectionState === "reconnecting"}
                    autoPlayEnabled={me.autoPlayEnabled}
                    onTakeControl={takeControl}
                  />
                ) : !isSpectator && !isDealPhase && !isTableRevealPhase ? (
                  <TurnControls
                    isMyTurn={isMyTurn}
                    canPlaySelected={canPlaySelected}
                    legalCount={legalCards.length}
                    leadSuit={state.leadSuit}
                    openingLeadRequired={state.openingLeadRequired}
                    sortMode={handSortMode}
                    takeTarget={nextCardTakeTarget
                      ? { name: nextCardTakeTarget.username, cardCount: nextCardTakeTarget.handCount }
                      : undefined}
                    onPlay={playSelected}
                    onTake={() => setTakeCardsOpen(true)}
                    onSort={cycleHandSort}
                    onAutoPlay={() => setAutoPlay(true)}
                    onQuit={() => setQuitOpen(true)}
                  />
                ) : isDealPhase ? (
                  <HandStatusActions label="Dealer distributing" onQuit={() => setQuitOpen(true)} />
                ) : isTableRevealPhase ? (
                  <HandStatusActions label="Table clearing" onQuit={() => setQuitOpen(true)} />
                ) : null}
              </div>

              {isSpectator ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500 dark:border-white/10 dark:text-slate-400">
                  {canReclaimSeat
                    ? `${replacementSeat?.username ?? "Your bot"} is holding your cards. Rejoin any time before the match ends.`
                    : "Spectators do not receive private hand data."}
                </div>
              ) : isDealPhase ? (
                <div className="grid min-h-[5.75rem] place-items-center rounded-2xl border border-dashed border-teal-300/60 bg-white/55 p-4 text-center text-sm font-black text-slate-700 dark:border-teal-200/30 dark:bg-white/10 dark:text-slate-200 sm:min-h-[6.35rem]">
                  Cards are being dealt. Your hand opens when the dealer leaves.
                </div>
              ) : (
                <div
                  className="player-hand-safe-zone hand-scroll hand-fan flex min-h-[5.75rem] gap-1.5 overflow-x-auto pb-1.5 pt-2 sm:min-h-[6.35rem] sm:gap-2"
                  data-card-count={displayedHand.length}
                  aria-label="Your cards"
                  style={responsiveHandStyle}
                >
                  {displayedHand.map((card, index) => (
                    <CardView
                      key={card.id}
                      card={card}
                      compact={displayedHand.length > 10}
                      fanIndex={index}
                      fanTotal={displayedHand.length}
                      mobileFan={viewportWidth <= 600}
                      selected={selectedIds.includes(card.id)}
                      playable={isMyTurn && isCardPlayableForState(state, hand, card)}
                      disabled={!isMyTurn || !isCardPlayableForState(state, hand, card)}
                      onClick={() => toggleCard(card)}
                      onDoubleClick={() => playDraggedCard(card)}
                      onDragPlay={() => playDraggedCard(card)}
                    />
                  ))}
                </div>
              )}
            </section>

            <RoundSummaryPanel
              state={state}
              isHost={isHost}
              nextRound={nextRound}
              leaveRoom={leaveRoom}
              onOpenResult={shareableMatchResult ? openMatchResult : undefined}
            />
          </div>

          <div className={clsx("grid min-w-0 gap-3 lg:grid-cols-3", inActivePlay && "hidden")}>
            <WinProbabilityPanel state={state} />
            <ScoreBoard state={state} />
            <ChatPanel />
          </div>
        </section>
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TakeNextHandModal
        open={takeCardsOpen && Boolean(nextCardTakeTarget)}
        target={nextCardTakeTarget
          ? { name: nextCardTakeTarget.username, cardCount: nextCardTakeTarget.handCount }
          : undefined}
        currentHandCount={hand.length}
        endsHand={state.players.filter((player) => player.handCount > 0).length <= 2}
        onClose={() => setTakeCardsOpen(false)}
        onConfirm={() => {
          setTakeCardsOpen(false);
          setSelectedIds([]);
          takeNextPlayerCards();
        }}
      />
      <QuitGameModal
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        onQuit={() => {
          setQuitOpen(false);
          quitGame(false);
        }}
        onReplace={() => {
          setQuitOpen(false);
          quitGame(true);
        }}
      />
    </main>
  );
}

interface LobbyPanelProps {
  state: PublicGameState;
  isHost: boolean;
  playerId?: string;
  addBot: (difficulty: BotDifficulty) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  updateRoomSettings: (settings: Partial<PublicGameState["settings"]>) => void;
}

function LobbyPanel({ state, isHost, playerId, addBot, setReady, startGame, updateRoomSettings }: LobbyPanelProps) {
  const [difficulty, setDifficulty] = useState<BotDifficulty>(state.tournament?.difficulty ?? "normal");
  const activeTournamentStage = state.tournament?.stages[state.tournament.stageIndex];
  const startLabel = state.tournament
    ? `Start ${activeTournamentStage?.name ?? "Stage"}`
    : "Start Game";
  const tournamentLocked = Boolean(state.tournament);
  const me = state.players.find((player) => player.id === playerId || player.isYou);
  const humanPlayers = state.players.filter((player) => !player.isBot);
  const readyHumans = humanPlayers.filter((player) => player.ready && player.connected).length;

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="game-felt rounded-[2rem] p-5 text-white">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-100">
              Lobby
            </p>
            <h2 className="text-3xl font-black">Room {state.roomCode}</h2>
            <p className="mt-1 text-sm font-bold text-white/70">
              {readyHumans}/{Math.max(1, humanPlayers.length)} players ready
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FriendsButton label="Invite Friends" openTab="online" />
            {me && !me.isBot ? (
              <button
                className={clsx(
                  "secondary-button",
                  me.ready && "border-teal-200/60 bg-teal-200 text-slate-950"
                )}
                onClick={() => setReady(!me.ready)}
              >
                <Sparkles size={17} />
                {me.ready ? "Ready" : "Ready Up"}
              </button>
            ) : null}
            {isHost ? (
              <button className="primary-button" onClick={startGame}>
                <Play size={18} />
                {startLabel}
              </button>
            ) : (
              <p className="rounded-full bg-white/15 px-4 py-2 text-sm font-black">
                Waiting for host
              </p>
            )}
          </div>
        </div>

        {state.tournament ? (
          <TournamentBracket state={state} className="mb-5" />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.players.map((player) => (
            <PlayerBadge
              key={player.id}
              player={player}
              host={player.id === state.hostId}
              active={player.id === state.hostId}
            />
          ))}
        </div>

        {state.spectators.length > 0 ? (
          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <p className="mb-2 text-sm font-black">Spectators</p>
            <div className="flex flex-wrap gap-2">
              {state.spectators.map((spectator) => (
                <span key={spectator.id} className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
                  {spectator.username}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="glass-panel rounded-[2rem] p-5">
        <h3 className="mb-4 text-xl font-black text-slate-950 dark:text-white">Table Controls</h3>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
            Bot difficulty
            <select
              className="field"
              value={difficulty}
              disabled={!isHost || tournamentLocked}
              onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <button className="secondary-button" disabled={!isHost || tournamentLocked} onClick={() => addBot(difficulty)}>
            <Plus size={17} />
            Add Bot
          </button>
          <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
            Target escapes
            <input
              className="field"
              type="number"
              min={1}
              max={20}
              disabled={!isHost || tournamentLocked}
              value={state.settings.targetScore}
              onChange={(event) => updateRoomSettings({ targetScore: Number(event.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
            Turn timer
            <input
              className="field"
              type="number"
              min={10}
              max={90}
              disabled={!isHost || tournamentLocked}
              value={state.settings.turnSeconds}
              onChange={(event) => updateRoomSettings({ turnSeconds: Number(event.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
            Fun mode
            <select
              className="field"
              disabled={!isHost || tournamentLocked}
              value={state.settings.funMode}
              onChange={(event) => updateRoomSettings({ funMode: event.target.value as PublicGameState["settings"]["funMode"] })}
            >
              <option value="classic">Classic</option>
              <option value="turbo">Turbo - 10 second turns</option>
              <option value="marathon">Marathon - longer match</option>
              <option value="reverse">Reverse Rules - reverse order</option>
            </select>
          </label>
          {!tournamentLocked && state.roomMode !== "quick" && state.roomMode !== "bots" ? (
            <label className="lobby-voice-toggle">
              <span>
                <strong>Live voice chat</strong>
                <small>Human players only. Never recorded.</small>
              </span>
              <input
                type="checkbox"
                checked={state.settings.voiceEnabled}
                disabled={!isHost}
                onChange={(event) => updateRoomSettings({ voiceEnabled: event.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
          ) : null}
          <div className="rounded-2xl bg-teal-500/10 p-3 text-sm font-semibold text-teal-900 dark:text-teal-100">
            {state.tournament
              ? "Tournament rules are locked: one stage, one winner, then the bracket advances."
              : "Share the room code or link. Friends can join as players before the round starts or spectate once play begins."}
          </div>
        </div>
      </aside>
    </section>
  );
}

function CasinoSeats({
  state,
  playerId
}: {
  state: PublicGameState;
  playerId?: string;
}) {
  const orderedPlayers = useMemo(() => {
    const viewerIndex = state.players.findIndex((player) => player.id === playerId);
    if (viewerIndex < 0) {
      return state.players;
    }

    return [...state.players.slice(viewerIndex), ...state.players.slice(0, viewerIndex)];
  }, [playerId, state.players]);
  const seatCount = Math.min(6, Math.max(1, orderedPlayers.length));

  return (
    <div className={clsx("casino-seat-layer", `seat-count-${seatCount}`)}>
      {orderedPlayers.map((player, index) => (
        <motion.div
          key={player.id}
          className={clsx("casino-seat", `casino-seat-${index}`, player.id === playerId && "casino-seat-you")}
          initial={{ opacity: 0, y: index === 0 ? 22 : -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22, delay: index * 0.04 }}
        >
          <SeatIdentity
            player={player}
            active={player.id === state.activePlayerId}
            host={player.id === state.hostId}
          />
          {player.id !== playerId ? (
            <SeatCardStack count={player.handCount} seatIndex={index} />
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

function SeatIdentity({
  player,
  active,
  host
}: {
  player: PublicGameState["players"][number];
  active: boolean;
  host: boolean;
}) {
  const voice = useVoiceChat();
  const voiceParticipant = voice.participants.find((participant) => participant.playerId === player.id);
  const voiceSpeaking = Boolean(voiceParticipant?.isSpeaking && !voiceParticipant.isLocallyMuted);
  const statusText = !player.connected
    ? "Disconnected • Bot Playing"
    : player.connectionState === "reconnecting"
      ? "Reconnected • Bot Playing"
      : player.controlState === "temporary-bot"
        ? player.autoPlayEnabled
          ? "Auto Play ON"
          : "AFK • Auto Playing"
        : player.controlState === "auto-play"
          ? "AFK • Card auto-played"
    : active
      ? player.isBot
        ? "Thinking..."
        : "Your turn"
      : "Waiting";

  return (
    <div className={clsx(
      "seat-identity",
      active && "seat-identity-active",
      voiceSpeaking && "seat-identity-speaking",
      !player.connected && "seat-identity-offline"
    )}>
      <div className="seat-nameplate">
        <div className="seat-name-row">
          <p className="seat-player-name">{player.username}</p>
          {host ? <Crown className="seat-mini-icon seat-host-icon" size={13} /> : null}
          {player.isBot ? <Bot className="seat-mini-icon seat-bot-icon" size={13} /> : null}
          <PlayerVoiceControl playerId={player.id} isBot={player.isBot} isYou={player.isYou} />
        </div>
        <p className="seat-player-status">{statusText}</p>
      </div>
      <div className="seat-avatar-token">
        {playerInitials(player.username)}
        <span className="seat-count-bubble">{player.handCount}</span>
        {!player.connected ? (
          <span className="seat-offline-dot">
            <WifiOff size={12} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SeatCardStack({
  count,
  seatIndex
}: {
  count: number;
  seatIndex: number;
}) {
  if (count <= 0) {
    return null;
  }

  const visibleCards = Math.min(8, Math.max(3, count));
  return (
    <div className={clsx("seat-card-stack", `seat-card-stack-${seatIndex}`)} aria-hidden="true">
      {Array.from({ length: visibleCards }).map((_, index) => (
        <span
          key={index}
          style={{
            "--stack-index": index,
            "--stack-mid": (visibleCards - 1) / 2
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function TableStatusBar({
  state,
  escapedCount
}: {
  state: PublicGameState;
  escapedCount: number;
}) {
  const remainingPlayers = state.players.filter((player) => player.handCount > 0).length;
  const latestEvent = state.history[0];
  const turnOrder = useMemo(() => {
    const playedIds = new Set(state.trick.map((play) => play.playerId));
    const skippedIds = new Set(state.timedOutPlayerIds ?? []);
    const pendingTrickPlayers = state.players.filter((player) =>
      player.handCount > 0 &&
      !skippedIds.has(player.id) &&
      (state.trick.length === 0 || !playedIds.has(player.id))
    );
    const holdingPlayers = pendingTrickPlayers.length > 0
      ? pendingTrickPlayers
      : state.players.filter((player) => player.handCount > 0);
    if (!state.activePlayerId) {
      return holdingPlayers;
    }

    const activeIndex = holdingPlayers.findIndex((player) => player.id === state.activePlayerId);
    if (activeIndex < 0) {
      return holdingPlayers;
    }

    return [...holdingPlayers.slice(activeIndex), ...holdingPlayers.slice(0, activeIndex)];
  }, [state.activePlayerId, state.players, state.timedOutPlayerIds, state.trick]);

  return (
    <div className="table-status-bar grid min-w-0 gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/85">
      <div className="table-score-stat grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2 backdrop-blur">
          {escapedCount} safe
        </div>
        <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-left backdrop-blur sm:text-right">
          {remainingPlayers} holding
        </div>
      </div>

      <div className="play-order-panel flex min-w-0 items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-slate-950/20 px-2 py-2 backdrop-blur">
        <span className="shrink-0 px-2 text-[0.65rem] text-teal-100">Play order</span>
        <div className="play-order-chips flex min-w-0 items-center gap-1.5">
          {turnOrder.map((player, index) => (
            <span key={player.id} className="flex shrink-0 items-center gap-1.5">
              <span
                title={player.username}
                className={clsx(
                  "play-order-chip grid h-7 w-7 place-items-center rounded-full text-[0.7rem] normal-case tracking-normal",
                  index === 0
                    ? "bg-teal-200 text-slate-950 shadow-[0_0_24px_rgba(45,212,191,0.35)]"
                    : "bg-white/12 text-white/85"
                )}
              >
                {playerInitials(player.username)}
              </span>
              {index < turnOrder.length - 1 ? (
                <span className="play-order-arrow text-white/45">&gt;</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {latestEvent ? (
        <div className="table-event-pill truncate rounded-full border border-amber-200/20 bg-amber-200/12 px-3 py-2 text-[0.68rem] normal-case tracking-normal text-amber-50 backdrop-blur">
          {latestEvent.message}
        </div>
      ) : null}
    </div>
  );
}

function WinProbabilityPanel({ state }: { state: PublicGameState }) {
  const entries = useMemo(() => {
    const holdingPlayers = state.players.filter((player) => player.handCount > 0);
    const maxHand = Math.max(1, ...state.players.map((player) => player.handCount));
    const minHand = Math.min(...holdingPlayers.map((player) => player.handCount), maxHand);
    const handSpread = Math.max(0, maxHand - minHand);

    return state.players
      .map((player) => {
        const escapedIndex = state.escapeOrder.indexOf(player.id);
        if (escapedIndex >= 0 || player.handCount === 0) {
          return { player, probability: 100 };
        }

        if (state.status !== "playing") {
          return {
            player,
            probability: player.id === state.bhabhiId ? 0 : 100
          };
        }

        const handRisk = handSpread === 0
          ? 0
          : ((player.handCount - minHand) / handSpread) * 38;
        const holdingRisk = player.handCount === maxHand && handSpread > 0 ? 10 : 0;
        const turnRisk = player.id === state.activePlayerId && state.leadSuit ? 5 : 0;
        const pickupRisk = state.recentPickup?.playerId === player.id ? 15 : 0;
        const scoreRelief = Math.min(8, player.score * 2.5);
        const probability = Math.round(
          Math.max(1, Math.min(100, 100 - handRisk - holdingRisk - turnRisk - pickupRisk + scoreRelief))
        );

        return { player, probability };
      })
      .sort((left, right) => right.probability - left.probability);
  }, [
    state.activePlayerId,
    state.bhabhiId,
    state.escapeOrder,
    state.leadSuit,
    state.players,
    state.recentPickup?.playerId,
    state.status
  ]);

  return (
    <aside className="glass-panel rounded-3xl p-4">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
          Live Edge
        </p>
        <h3 className="text-lg font-black text-slate-950 dark:text-white">Win probability</h3>
        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">
          Chance to escape, not a shared total.
        </p>
      </div>
      <div className="grid gap-2">
        {entries.map(({ player, probability }) => (
          <div key={player.id} className="rounded-2xl bg-slate-950/5 p-2 dark:bg-white/10">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-black">
              <span className="truncate text-slate-800 dark:text-slate-100">{player.username}</span>
              <span className="text-slate-950 dark:text-white">{probability}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-950/10 dark:bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-200"
                initial={{ width: 0 }}
                animate={{ width: `${probability}%` }}
                transition={{ type: "spring", stiffness: 180, damping: 24 }}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ActiveTableTools({
  activeTool,
  onChange,
  state
}: {
  activeTool: ActiveTableTool;
  onChange: (tool: ActiveTableTool) => void;
  state: PublicGameState;
}) {
  const [seenChatCount, setSeenChatCount] = useState(state.chatMessages.length);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const unreadChatCount = Math.max(0, state.chatMessages.length - seenChatCount);
  const tools: Array<{ key: Exclude<ActiveTableTool, "none">; label: string; icon: ReactNode }> = [
    { key: "odds", label: "Odds", icon: <BarChart3 size={17} /> },
    { key: "score", label: "Score", icon: <Trophy size={17} /> },
    { key: "chat", label: "Chat", icon: <MessageCircle size={17} /> }
  ];
  const close = () => onChange("none");

  useEffect(() => {
    if (activeTool === "chat") {
      setSeenChatCount(state.chatMessages.length);
    }
  }, [activeTool, state.chatMessages.length]);

  useEffect(() => {
    if (activeTool !== "none") {
      setMobileMenuOpen(false);
    }
  }, [activeTool]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="active-table-tools pointer-events-none absolute inset-0 z-[65]">
      <div className="active-tool-rail pointer-events-auto" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={clsx("active-tool-button mobile-tool-trigger", mobileMenuOpen && "active-tool-button-active")}
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Open match tools"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-table-tools"
        >
          <Ellipsis size={20} />
          <span>More</span>
          {unreadChatCount > 0 ? (
            <b className="active-tool-unread" aria-label={`${unreadChatCount} unread messages`}>
              {Math.min(99, unreadChatCount)}
            </b>
          ) : null}
        </button>
        <div
          id="mobile-table-tools"
          className={clsx("active-tool-options", mobileMenuOpen && "active-tool-options-open")}
        >
          {tools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className={clsx("active-tool-button", activeTool === tool.key && "active-tool-button-active")}
              onClick={() => {
                onChange(activeTool === tool.key ? "none" : tool.key);
                setMobileMenuOpen(false);
              }}
              aria-label={`Open ${tool.label}`}
              aria-expanded={activeTool === tool.key}
              aria-controls={activeTool === tool.key ? "active-table-panel" : undefined}
            >
              {tool.icon}
              <span>{tool.label}</span>
              {tool.key === "chat" && unreadChatCount > 0 ? (
                <b className="active-tool-unread" aria-label={`${unreadChatCount} unread messages`}>
                  {Math.min(99, unreadChatCount)}
                </b>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {activeTool !== "none" ? (
          <motion.aside
            key={activeTool}
            id="active-table-panel"
            className={clsx(
              "active-tool-popover pointer-events-auto",
              activeTool === "chat" && "active-tool-popover-chat"
            )}
            onPointerDown={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 25 }}
          >
            <button type="button" className="active-tool-close" onClick={close} aria-label="Close table panel">
              <X size={16} />
            </button>
            {activeTool === "odds" ? <WinProbabilityPanel state={state} /> : null}
            {activeTool === "score" ? <ScoreBoard state={state} /> : null}
            {activeTool === "chat" ? <ChatPanel live /> : null}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body
  );
}

function TableAmbience() {
  return (
    <div className="table-ambience" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          key={index}
          className={`table-rim-marker table-rim-marker-${index}`}
          style={{ "--marker-index": index } as CSSProperties}
        />
      ))}
      <i className="table-centre-emblem" />
      <i className="table-light-sweep" />
    </div>
  );
}

function WeatherAmbience({ theme }: { theme: string }) {
  const particleCount = theme === "rain"
    ? 22
    : theme === "winter"
      ? 18
      : theme === "mist"
        ? 8
        : theme === "embers"
          ? 16
          : 12;

  return (
    <div className={clsx("weather-ambience", `weather-ambience-${theme}`)} aria-hidden="true">
      {Array.from({ length: particleCount }).map((_, index) => (
        <span
          key={index}
          style={{
            "--particle-left": `${(index * 37) % 100}%`,
            "--particle-delay": `${(index % 9) * 0.28}s`,
            "--particle-duration": `${3.4 + (index % 6) * 0.35}s`,
            "--particle-size": `${0.16 + (index % 4) * 0.04}rem`
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function TrickTable({
  state,
  playerId,
  escapedNames,
  activePlayerName
}: {
  state: PublicGameState;
  playerId?: string;
  escapedNames: string[];
  activePlayerName?: string;
}) {
  const showingResult = state.trick.length === 0 && Boolean(state.lastTrick);
  const [cleaningTrickId, setCleaningTrickId] = useState<string>();
  const plays = state.trick.length > 0 ? state.trick : state.lastTrick?.plays ?? [];
  const leadSuit = state.leadSuit ?? state.lastTrick?.leadSuit;
  const hasThulla = state.trick.length > 0
    ? state.trick.some((play) => play.offSuit)
    : state.lastTrick?.hasThulla ?? false;
  const aceSpades = "A\u2660";
  const leadText = state.openingLeadRequired ? `${aceSpades} opening` : leadSuit ? `${SUIT_LABELS[leadSuit]} led` : "Waiting for lead";
  const tableTitle = state.openingLeadRequired
    ? `${aceSpades} Opening`
    : state.trick.length > 0
      ? "Current Trick"
      : showingResult
        ? hasThulla
          ? "Dhulla Result"
          : "Trick Result"
        : "Table Ready";
  const resultText = showingResult && state.lastTrick
    ? state.lastTrick.hasThulla
      ? `${state.lastTrick.pickedUpByName ?? state.lastTrick.winnerName} picks up ${state.lastTrick.cardCount} cards`
      : `${state.lastTrick.winnerName} clears ${state.lastTrick.cardCount} cards`
    : state.openingLeadRequired
      ? `${activePlayerName ?? "Ace holder"} must play ${aceSpades}`
    : activePlayerName
      ? `${activePlayerName} to play`
      : "Ace of Spades starts the hand";
  const cleaningActive = showingResult && cleaningTrickId === state.lastTrick?.id;
  const orderedPlayerIds = useMemo(() => {
    const viewerIndex = state.players.findIndex((player) => player.id === playerId);
    const orderedPlayers = viewerIndex < 0
      ? state.players
      : [...state.players.slice(viewerIndex), ...state.players.slice(0, viewerIndex)];
    return orderedPlayers.map((player) => player.id);
  }, [playerId, state.players]);
  const winningPlayKey = useMemo(() => {
    if (!leadSuit || plays.length === 0) return undefined;
    const winningPlay = plays
      .filter((play) => play.card.suit === leadSuit)
      .sort((left, right) => rankSortValue(right.card.rank) - rankSortValue(left.card.rank))[0];
    return winningPlay ? `${winningPlay.playerId}-${winningPlay.card.id}` : undefined;
  }, [leadSuit, plays]);

  useEffect(() => {
    if (!showingResult || !state.lastTrick?.id) {
      setCleaningTrickId(undefined);
      return undefined;
    }

    setCleaningTrickId(undefined);
    const timeout = window.setTimeout(() => setCleaningTrickId(state.lastTrick?.id), 3000);
    return () => window.clearTimeout(timeout);
  }, [showingResult, state.lastTrick?.id]);

  return (
    <div className="center-trick-wrap grid w-full min-w-0 grid-cols-[minmax(0,1fr)] place-items-center">
      <div className="center-trick-zone relative w-full min-w-0 max-w-full overflow-visible text-center">
        <p className="center-trick-title relative z-10 text-xs font-black uppercase tracking-[0.22em] text-teal-100">
          {tableTitle}
        </p>

        <div className="center-play-safe relative z-10 grid place-items-center">
          <AnimatePresence>
            {cleaningActive ? (
              <motion.div
                key={`clean-${state.lastTrick?.id}`}
                className="table-cleaner-hand"
                initial={{ x: "-145%", y: 22, rotate: -14, opacity: 0 }}
                animate={{ x: "145%", y: -4, rotate: 10, opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              >
                <span className="table-cleaner-palm" />
                <span className="table-cleaner-cuff" />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {plays.length > 0 ? (
            <motion.div
              key={showingResult ? state.lastTrick?.id : "live-trick"}
              className={clsx(
                "center-play-grid",
                `center-play-count-${plays.length}`,
                `center-play-seat-count-${Math.min(6, Math.max(1, state.players.length))}`
              )}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: cleaningActive ? 0.88 : 1, scale: 1 }}
            >
              {plays.map((play, index) => (
                <motion.div
                  key={`${play.playerId}-${play.card.id}`}
                  aria-label={`${play.username} played ${play.card.rank} of ${play.card.suit}${play.offSuit ? " for Dhulla" : ""}`}
                  className={clsx(
                    "center-play-slot grid justify-items-center",
                    `center-play-slot-${index}`,
                    `center-play-seat-${Math.max(0, orderedPlayerIds.indexOf(play.playerId))}`,
                    play.offSuit && "center-play-slot-thulla",
                    winningPlayKey === `${play.playerId}-${play.card.id}` && "center-play-slot-winning"
                  )}
                  initial={{ y: -78, scale: 1.12, rotate: -14 + index * 7, opacity: 0 }}
                  animate={
                    cleaningActive
                      ? {
                          x: 0,
                          y: 0,
                          scale: 0.92,
                          rotate: -5 + index * 3.5,
                          opacity: 0
                        }
                      : { x: 0, y: 0, scale: 1, rotate: -5 + index * 3.5, opacity: 1 }
                  }
                  exit={{ y: 34, scale: 0.9, rotate: 8, opacity: 0 }}
                  transition={
                    cleaningActive
                      ? { duration: 0.62, ease: "easeInOut", delay: index * 0.08 }
                      : { type: "spring", stiffness: 420, damping: 24, delay: index * 0.055 }
                  }
                >
                  <CardView card={play.card} tableCard />
                </motion.div>
              ))}
            </motion.div>
          ) : null}
        </div>

        <p
          className={clsx(
            "center-result-pill relative z-10 mt-1 text-sm font-black text-white",
            !showingResult && "center-result-pill-live"
          )}
        >
          {resultText}
        </p>

        <div className="center-meta-row relative z-10 mt-4 flex flex-wrap justify-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
          <span className="rounded-full bg-white/15 px-3 py-1">{leadText}</span>
          <span
            className={clsx(
              "rounded-full px-3 py-1",
              hasThulla ? "bg-orange-300 text-slate-950" : "bg-white/15"
            )}
          >
            {hasThulla ? "Dhulla triggered" : "Clean trick"}
          </span>
          {showingResult ? (
            <span className="rounded-full bg-amber-200 px-3 py-1 text-slate-950">
              Clearing in 3s
            </span>
          ) : null}
          <span className="rounded-full bg-white/15 px-3 py-1">
            {state.discardPile.length} cleared
          </span>
        </div>

        {escapedNames.length > 0 ? (
          <p className="mt-3 text-sm font-bold text-teal-100">
            Safe: {escapedNames.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DealerOverlay({
  muted,
  playerCount
}: {
  muted: boolean;
  playerCount: number;
}) {
  const cardCount = Math.min(18, Math.max(10, playerCount * 4));

  useEffect(() => {
    let played = 0;
    playSound("deal", muted);
    const interval = window.setInterval(() => {
      played += 1;
      playSound("deal", muted);
      if (played >= cardCount) {
        window.clearInterval(interval);
      }
    }, 155);

    return () => window.clearInterval(interval);
  }, [cardCount, muted]);

  return (
    <motion.div
      className="dealer-overlay-lifetime pointer-events-none absolute inset-0 z-40 grid place-items-center bg-slate-950/20 p-4 backdrop-blur-[1px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="dealer-overlay-card relative overflow-hidden rounded-[2rem] border border-white/20 bg-slate-950/85 px-6 py-5 text-center text-white shadow-card"
        initial={{ scale: 0.86, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 12, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <div className="dealer-person mx-auto mb-3">
          <div className="dealer-head" />
          <div className="dealer-body" />
          <div className="dealer-arm dealer-arm-left" />
          <div className="dealer-arm dealer-arm-right" />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-100">
          Dealer
        </p>
        <h2 className="mt-1 text-2xl font-black">Distributing Cards</h2>
        <p className="mt-1 text-sm font-bold text-white/65">
          {playerCount} seats / fresh hand
        </p>
        <div className="dealer-card-stream" aria-hidden="true">
          {Array.from({ length: cardCount }).map((_, index) => {
            const angle = -Math.PI / 2 + (index / Math.max(1, cardCount)) * Math.PI * 2;
            const radiusX = 7.3 + (index % 3) * 0.45;
            const radiusY = 4.85 + (index % 2) * 0.35;
            return (
              <span
                key={index}
                className="dealer-flying-card"
                style={{
                  "--deal-x": `${Math.cos(angle) * radiusX}rem`,
                  "--deal-y": `${Math.sin(angle) * radiusY}rem`,
                  "--deal-delay": `${index * 0.13}s`,
                  "--deal-rotate": `${-18 + (index % 7) * 6}deg`
                } as CSSProperties}
              />
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TablePhraseOverlay({
  phrase
}: {
  phrase?: { id: number; text: string; tone: "good" | "warn" | "rush" };
}) {
  return (
    <AnimatePresence>
      {phrase ? (
        <motion.div
          key={phrase.id}
          className={clsx(
            "pointer-events-none absolute left-1/2 top-24 z-[35] -translate-x-1/2 rounded-full border px-5 py-3 text-lg font-black shadow-card backdrop-blur",
            "table-phrase-bubble",
            phrase.tone === "warn"
              ? "border-orange-200/60 bg-orange-300/90 text-slate-950"
              : phrase.tone === "rush"
                ? "border-amber-100/70 bg-amber-200/95 text-slate-950"
                : "border-teal-100/70 bg-teal-200/95 text-slate-950"
          )}
          initial={{ opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
        >
          {phrase.text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function TurnTimerBadge({
  state,
  activePlayerName
}: {
  state: PublicGameState;
  activePlayerName?: string;
}) {
  const [now, setNow] = useState(Date.now());
  const timer = useMemo(() => {
    if (state.dealEndsAt && now < state.dealEndsAt) {
      const remaining = Math.max(0, state.dealEndsAt - now);
      return {
        phase: "deal" as const,
        remaining: Math.ceil(remaining / 1000),
        progress: Math.max(0, Math.min(100, (remaining / DEAL_ANIMATION_MS) * 100))
      };
    }

    if (state.winCelebration) {
      const total = state.winCelebration.endsAt - state.winCelebration.startedAt;
      const remaining = Math.max(0, state.winCelebration.endsAt - now);
      return {
        phase: "celebration" as const,
        remaining: Math.ceil(remaining / 1000),
        progress: total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
      };
    }

    if (state.lastTrick && now < state.lastTrick.resolvedAt + TRICK_REVEAL_MS) {
      const total = TRICK_REVEAL_MS;
      const remaining = Math.max(0, state.lastTrick.resolvedAt + TRICK_REVEAL_MS - now);
      return {
        phase: "clear" as const,
        remaining: Math.ceil(remaining / 1000),
        progress: Math.max(0, Math.min(100, (remaining / total) * 100))
      };
    }

    if (!state.turnStartedAt || !state.turnEndsAt) {
      return { phase: "idle" as const, remaining: 0, progress: 0 };
    }

    const total = state.turnEndsAt - state.turnStartedAt;
    const remaining = Math.max(0, state.turnEndsAt - now);
    return {
      phase: "turn" as const,
      remaining: Math.ceil(remaining / 1000),
      progress: total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
    };
  }, [now, state.dealEndsAt, state.turnEndsAt, state.turnStartedAt, state.winCelebration]);
  const timerColor = timer.phase === "deal"
    ? "#facc15"
    : timer.phase === "clear"
    ? "#f59e0b"
    : state.winCelebration
    ? "#facc15"
    : timer.remaining > 0 && timer.remaining <= 5
      ? "#fb923c"
      : "#2dd4bf";

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="turn-timer-badge relative z-10 mx-auto mb-3 flex w-fit max-w-full items-center gap-3 rounded-full border border-white/15 bg-slate-950/45 px-3 py-2 text-white shadow-card backdrop-blur">
      <div
        className="timer-ring grid h-12 w-12 shrink-0 place-items-center rounded-full p-1"
        style={{
          "--timer-color": timerColor,
          "--timer-progress": `${timer.progress}%`
        } as React.CSSProperties}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-sm font-black text-white">
          {timer.remaining || <Timer size={16} />}
        </div>
      </div>
      <div className="min-w-0 text-left">
        <p className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-teal-100">
          Current Turn
        </p>
        <p className="truncate text-sm font-black">
          {timer.phase === "deal"
            ? "Dealer distributing"
            : timer.phase === "clear"
            ? "Cleaning the table"
            : state.winCelebration
            ? `Celebrating ${state.winCelebration.username}`
            : state.openingLeadRequired
            ? "A\u2660 starts the hand"
            : activePlayerName
              ? `${activePlayerName} to play`
              : "Between hands"}
        </p>
      </div>
    </div>
  );
}

interface TurnControlsProps {
  isMyTurn: boolean;
  canPlaySelected: boolean;
  legalCount: number;
  leadSuit?: PublicGameState["leadSuit"];
  openingLeadRequired?: boolean;
  sortMode: HandSortMode;
  takeTarget?: { name: string; cardCount: number };
  onPlay: () => void;
  onTake: () => void;
  onSort: () => void;
  onAutoPlay: () => void;
  onQuit: () => void;
}

function TurnControls({
  isMyTurn,
  canPlaySelected,
  legalCount,
  leadSuit,
  openingLeadRequired,
  sortMode,
  takeTarget,
  onPlay,
  onTake,
  onSort,
  onAutoPlay,
  onQuit
}: TurnControlsProps) {
  const hint = !isMyTurn
    ? "Waiting"
    : openingLeadRequired
      ? "Open with A\u2660"
      : leadSuit
      ? `Follow ${SUIT_LABELS[leadSuit]}`
      : "Lead any card";

  return (
    <div className="turn-controls flex flex-wrap items-center justify-end gap-1.5">
      <span className="turn-hint rounded-full bg-slate-950/5 px-2.5 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
        {hint} / {legalCount} legal
      </span>
      {takeTarget ? (
        <button
          className="take-card-action secondary-button border-amber-300/35 bg-amber-300/10 px-3 py-2 text-amber-100"
          onClick={onTake}
          title={"Take all " + takeTarget.cardCount + " cards from " + takeTarget.name}
        >
          <Hand size={16} />
          <span className="take-action-full">Take {takeTarget.name}'s {takeTarget.cardCount}</span>
          <span className="take-action-compact">Take {takeTarget.cardCount}</span>
        </button>
      ) : null}
      <button className="play-card-action primary-button px-4 py-2" disabled={!canPlaySelected} onClick={onPlay}>
        <Sparkles size={17} />
        Play Card
      </button>
      <button className="sort-card-action secondary-button px-3 py-2" onClick={onSort}>
        <RotateCcw size={16} />
        Sort
        {sortMode === "deal" ? null : <span className="sort-mode-label">{sortMode}</span>}
      </button>
      <button className="auto-play-action secondary-button px-3 py-2" onClick={onAutoPlay} title="Let the server play this seat until you return">
        <Bot size={16} />
        Auto Play
      </button>
      <button className="quit-action secondary-button px-3 py-2" onClick={onQuit}>
        <LogOut size={16} />
        Quit
      </button>
    </div>
  );
}

function SeatControlActions({
  disconnected,
  reconnecting,
  autoPlayEnabled,
  onTakeControl
}: {
  disconnected: boolean;
  reconnecting: boolean;
  autoPlayEnabled: boolean;
  onTakeControl: () => void;
}) {
  return (
    <div className="seat-control-actions flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-black text-amber-100">
        {disconnected ? <WifiOff size={15} /> : <Bot size={15} />}
        {disconnected
          ? "Seat reserved • Bot playing"
          : reconnecting
            ? "Reconnected • Bot is playing for you"
            : autoPlayEnabled
              ? "Auto Play ON"
              : "Bot is playing for you"}
      </span>
      {!disconnected ? (
        <button className="primary-button px-4 py-2" onClick={onTakeControl}>
          <Play size={16} />
          Take Control
        </button>
      ) : null}
    </div>
  );
}

function HandStatusActions({
  label,
  onQuit
}: {
  label: string;
  onQuit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="rounded-full bg-amber-200 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-950">
        {label}
      </span>
      <button className="secondary-button px-3 py-2" onClick={onQuit}>
        <LogOut size={16} />
        Quit
      </button>
    </div>
  );
}

function ReactionBurst({ state }: { state: PublicGameState }) {
  const [reactionClock, setReactionClock] = useState(Date.now());

  useEffect(() => {
    if (!state.reactions.some((reaction) => Date.now() - reaction.at < 2000)) {
      return undefined;
    }

    const interval = window.setInterval(() => setReactionClock(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [state.reactions]);

  const visibleReactions = state.reactions
    .filter((reaction) => reactionClock - reaction.at < 2000)
    .slice(0, 5);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {visibleReactions.map((reaction, index) => (
          <motion.div
            key={reaction.id}
            className="table-reaction-burst absolute rounded-full bg-white/20 px-3 py-2 text-2xl shadow-card backdrop-blur"
            style={{
              left: `${18 + index * 14}%`,
              top: `${20 + (index % 3) * 18}%`
            }}
            initial={{ y: 30, scale: 0.7, opacity: 0 }}
            animate={{ y: -25, scale: 1, opacity: 1 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            {reaction.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function WinOverlay({ state }: { state: PublicGameState }) {
  const celebration = state.winCelebration;
  const summary = state.roundSummaries[0];
  const [visibleSummaryId, setVisibleSummaryId] = useState<string>();
  const [suppressedSummaryId, setSuppressedSummaryId] = useState<string>();

  useEffect(() => {
    if (celebration && summary) {
      setSuppressedSummaryId(summary.id);
    }
  }, [celebration?.id, summary?.id]);

  useEffect(() => {
    if (celebration || !summary || state.status === "playing" || summary.id === suppressedSummaryId) {
      setVisibleSummaryId(undefined);
      return undefined;
    }

    setVisibleSummaryId(summary.id);
    const timeout = window.setTimeout(() => setVisibleSummaryId(undefined), 2000);
    return () => window.clearTimeout(timeout);
  }, [celebration, summary?.id, state.status, suppressedSummaryId]);

  if (celebration) {
    return (
      <CelebrationOverlay
        title="Win! Congratulations"
        winnerName={celebration.username}
        subtitle={`${ordinal(celebration.rank)} player escaped`}
      />
    );
  }

  if (!summary || state.status === "playing") {
    return null;
  }

  if (visibleSummaryId !== summary.id) {
    return null;
  }

  const champion = state.players.find((player) => player.id === state.championId);
  const winnerName = state.status === "game_over"
    ? champion?.username ?? summary.winnerName
    : summary.winnerName;

  return (
    <CelebrationOverlay
      title="Win! Congratulations"
      winnerName={winnerName}
      subtitle={state.status === "game_over" ? "Match winner" : "Escaped first this hand"}
    />
  );
}

function CelebrationOverlay({
  title,
  winnerName,
  subtitle
}: {
  title: string;
  winnerName: string;
  subtitle: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div className="fireworks-layer">
        {Array.from({ length: 10 }).map((_, index) => (
          <span key={index} className={`firework firework-${index + 1}`} />
        ))}
      </div>
      <motion.div
        className="relative overflow-hidden rounded-[2rem] border border-white/25 bg-white/95 px-7 py-6 text-center text-slate-950 shadow-card dark:bg-slate-950/90 dark:text-white"
        initial={{ scale: 0.82, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="winner-burst absolute -right-10 -top-10 h-28 w-28 rounded-full blur-sm" />
        <p className="relative text-xs font-black uppercase tracking-[0.24em] text-amber-600 dark:text-amber-200">
          {title}
        </p>
        <h2 className="relative mt-2 text-4xl font-black">
          {winnerName}
        </h2>
        <p className="relative mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          {subtitle}
        </p>
      </motion.div>
    </div>
  );
}

function TournamentBracket({
  state,
  className
}: {
  state: PublicGameState;
  className?: string;
}) {
  const tournament = state.tournament;
  if (!tournament) {
    return null;
  }

  const activeStage = tournament.stages[tournament.stageIndex];
  const statusText = tournament.status === "won"
    ? "Champion"
    : tournament.status === "eliminated"
      ? "Eliminated"
      : activeStage?.name ?? "In progress";

  return (
    <section className={clsx("tournament-bracket rounded-[2rem] border border-white/15 bg-slate-950/35 p-4 text-white shadow-card backdrop-blur", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">
            {tournament.offline ? "Offline Cup Roadmap" : "Tournament Roadmap"}
          </p>
          <h3 className="text-2xl font-black">
            {tournament.eventName ?? tournament.playerNationName} / {statusText}
          </h3>
          <p className="mt-1 text-sm font-bold text-white/70">
            Future opponents are drawn only after qualification.
          </p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-200 text-slate-950 shadow-glow">
          <Trophy size={20} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {tournament.stages.map((stage, index) => (
          <div
            key={stage.id}
            className={clsx(
              "relative overflow-hidden rounded-2xl border p-3",
              stage.status === "active"
                ? "border-teal-300 bg-teal-300/15 shadow-[0_0_34px_rgba(45,212,191,0.2)]"
                : stage.status === "complete"
                  ? "border-amber-300 bg-amber-200/20"
                  : stage.status === "eliminated"
                    ? "border-orange-300 bg-orange-200/20"
                    : "border-white/10 bg-white/5"
            )}
          >
            <div className="absolute right-3 top-3 text-4xl font-black text-white/5">
              {index + 1}
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="relative z-10 font-black text-white">{stage.name}</span>
              <span className="relative z-10 rounded-full bg-white/10 px-2 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-white/75">
                {stage.status.replace("_", " ")}
              </span>
            </div>
            <div className="grid gap-1">
              {stage.slots.length > 0 ? (
                stage.slots.map((slot) => (
                  <div
                    key={`${stage.id}-${slot.seed}-${slot.code}`}
                    className={clsx(
                      "relative z-10 flex items-center justify-between rounded-xl px-2 py-1.5 text-xs font-bold",
                      slot.isUser
                        ? "bg-teal-200 text-slate-950"
                        : "bg-white/10 text-white/80"
                    )}
                  >
                    <span className="truncate">
                      <span className="mr-1.5">{slot.flag}</span>
                      {slot.name}
                    </span>
                    <span className="ml-2 shrink-0 font-black">{slot.code}</span>
                  </div>
                ))
              ) : (
                <div className="relative z-10 grid gap-1">
                  {Array.from({ length: 4 }).map((_, slotIndex) => (
                    <div key={slotIndex} className="rounded-xl border border-dashed border-white/15 bg-white/5 px-2 py-1.5 text-xs font-bold text-white/50">
                      Slot {slotIndex + 1} locked
                    </div>
                  ))}
                </div>
              )}
            </div>
            {stage.winnerName ? (
              <p className="relative z-10 mt-2 text-xs font-black text-amber-200">
                Winner: {stage.winnerName}
              </p>
            ) : stage.status === "locked" ? (
              <p className="relative z-10 mt-2 text-xs font-black text-white/45">Qualify to reveal draw</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RoundSummaryPanel({
  state,
  isHost,
  nextRound,
  leaveRoom,
  onOpenResult
}: {
  state: PublicGameState;
  isHost: boolean;
  nextRound: () => void;
  leaveRoom: () => void;
  onOpenResult?: () => void;
}) {
  const summary = state.roundSummaries[0];
  if (!summary || state.status === "playing") {
    return null;
  }

  const matchComplete =
    state.status === "game_over" && state.tournament?.status !== "active";
  const nextButtonLabel = state.tournament
    ? state.tournament.status === "active"
      ? "Next Stage"
      : state.tournament.status === "won"
        ? "Return Home"
        : "Return Home"
    : state.status === "game_over"
      ? "Return Home"
      : "Next Round";
  const bhabhi = summary.scoreLines.find((line) => line.isBhabhi);
  const rankedLines = summary.scoreLines.slice().sort((left, right) => {
    const leftRank = roundRankIndex(state, left.playerId, left.isBhabhi);
    const rightRank = roundRankIndex(state, right.playerId, right.isBhabhi);
    return leftRank - rightRank;
  });

  return (
    <section className="glass-panel rounded-[2rem] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
            Round Summary
          </p>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">
            {bhabhi?.username ?? "Last player"} is Bhabhi
          </h2>
        </div>
        {matchComplete ? (
          <div className="flex flex-wrap gap-2">
            {onOpenResult ? (
              <button className="secondary-button py-2.5" onClick={onOpenResult}>
                <Share2 size={17} />
                Share Result
              </button>
            ) : null}
            <button className="primary-button py-2.5" onClick={leaveRoom}>
              <Home size={17} />
              {nextButtonLabel}
            </button>
          </div>
        ) : isHost ? (
          <div className="flex flex-wrap gap-2">
            {onOpenResult ? (
              <button className="secondary-button py-2.5" onClick={onOpenResult}>
                <Share2 size={17} />
                Share Result
              </button>
            ) : null}
            <button className="primary-button py-2.5" onClick={nextRound}>
              <RotateCcw size={17} />
              {nextButtonLabel}
            </button>
          </div>
        ) : (
          <p className="rounded-full bg-slate-950/5 px-3 py-2 text-sm font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            Waiting for host
          </p>
        )}
      </div>
      {state.tournament ? (
        <TournamentBracket state={state} className="mb-3" />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rankedLines.map((line) => {
          const rankIndex = roundRankIndex(state, line.playerId, line.isBhabhi);
          const rankLabel = line.isBhabhi ? "Bhabhi" : ordinal(rankIndex + 1);
          return (
          <div key={line.playerId} className="rounded-2xl bg-white/70 p-3 shadow-sm dark:bg-white/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-slate-950 dark:text-white">{line.username}</p>
              <span className={clsx(
                "rounded-full px-2 py-1 text-xs font-black",
                line.isBhabhi
                  ? "bg-orange-200 text-orange-950"
                  : "bg-teal-200 text-teal-950"
              )}>
                {rankLabel}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {line.isBhabhi ? "Bhabhi" : "Escaped"} / {line.cardsLeft} card{line.cardsLeft === 1 ? "" : "s"} left
            </p>
          </div>
        );
        })}
      </div>
    </section>
  );
}

function TakeNextHandModal({
  open,
  target,
  currentHandCount,
  endsHand,
  onClose,
  onConfirm
}: {
  open: boolean;
  target?: { name: string; cardCount: number };
  currentHandCount: number;
  endsHand: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && target ? (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={"Take " + target.name + "'s cards"}
            className="w-full max-w-md rounded-[1.75rem] border border-amber-200/20 bg-slate-950 p-5 text-white shadow-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-amber-200/25 bg-amber-300/15 text-amber-200">
                <Hand size={21} />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Tactical move</p>
                <h2 className="mt-1 text-2xl font-black">Take {target.name}'s hand?</h2>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/70">
              You receive all {target.cardCount} cards and will hold {currentHandCount + target.cardCount}.
              {" " + target.name} immediately becomes safe. {endsHand
                ? "Because only two players remain, this ends the hand and you become Bhabhi."
                : "You keep the lead for this trick."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-white/45">You receive</p>
                <p className="mt-1 text-xl font-black text-amber-200">+{target.cardCount} cards</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-white/45">Next player</p>
                <p className="mt-1 text-xl font-black text-emerald-300">Escapes safe</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-bold text-white/45">
              {endsHand ? "Warning: this concedes the hand." : "This move cannot be undone."}
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button className="primary-button w-full" onClick={onConfirm}>
                <Hand size={17} />
                Take {target.cardCount} cards
              </button>
              <button className="secondary-button w-full border-white/10 bg-white/10 text-white" onClick={onClose}>
                Keep my hand
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function QuitGameModal({
  open,
  onClose,
  onQuit,
  onReplace
}: {
  open: boolean;
  onClose: () => void;
  onQuit: () => void;
  onReplace: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Quit game"
            className="w-full max-w-md rounded-[2rem] border border-white/15 bg-slate-950 p-5 text-white shadow-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Leave table</p>
            <h2 className="mt-1 text-2xl font-black">Quit this hand?</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/70">
              Quit as Bhabhi to leave immediately, or let a bot take your cards so friends can keep playing smoothly.
            </p>
            <div className="mt-5 grid gap-2">
              <button className="primary-button w-full" onClick={onReplace}>
                Replace me with bot
              </button>
              <button className="secondary-button w-full border-orange-200/20 bg-orange-300/15 text-orange-50" onClick={onQuit}>
                Quit as Bhabhi
              </button>
              <button className="secondary-button w-full border-white/10 bg-white/10 text-white" onClick={onClose}>
                Stay at table
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function findNextPlayerForCardTake(
  state: PublicGameState,
  playerId: string
): PublicGameState["players"][number] | undefined {
  const startIndex = state.players.findIndex((player) => player.id === playerId);
  if (startIndex < 0) return undefined;

  for (let step = 1; step <= state.players.length; step += 1) {
    const index = (startIndex + step * state.direction + state.players.length) % state.players.length;
    const candidate = state.players[index];
    if (candidate && candidate.id !== playerId && candidate.handCount > 0) {
      return candidate;
    }
  }

  return undefined;
}

function sortHandForDisplay(hand: Card[], mode: HandSortMode): Card[] {
  if (mode === "deal") {
    return hand;
  }

  const suitOrder: Record<Card["suit"], number> = {
    spades: 0,
    hearts: 1,
    diamonds: 2,
    clubs: 3
  };

  return [...hand].sort((left, right) => {
    if (mode === "suit") {
      const suitDifference = suitOrder[left.suit] - suitOrder[right.suit];
      if (suitDifference !== 0) return suitDifference;
    }

    return rankSortValue(left.rank) - rankSortValue(right.rank);
  });
}

function getMusicPhase(state: PublicGameState, playerId?: string): MusicPhase {
  if (state.winCelebration) {
    return state.winCelebration.playerId === playerId ? "victory" : "defeat";
  }

  if (state.status !== "playing") {
    return "idle";
  }

  const handCounts = state.players.map((player) => player.handCount);
  const averageHand = handCounts.reduce((sum, count) => sum + count, 0) / Math.max(1, handCounts.length);
  const lowestHand = Math.min(...handCounts);

  if (lowestHand <= 2 || averageHand <= 4) {
    return "end";
  }

  if (averageHand <= 8) {
    return "mid";
  }

  return "early";
}

function roundRankIndex(state: PublicGameState, playerId: string, isBhabhi: boolean): number {
  if (isBhabhi) {
    return state.players.length;
  }

  const escapedIndex = state.escapeOrder.indexOf(playerId);
  return escapedIndex >= 0 ? escapedIndex : state.players.length - 1;
}

function ordinal(value: number): string {
  const suffix = value % 10 === 1 && value % 100 !== 11
    ? "st"
    : value % 10 === 2 && value % 100 !== 12
      ? "nd"
      : value % 10 === 3 && value % 100 !== 13
        ? "rd"
        : "th";
  return `${value}${suffix}`;
}

function getResponsiveHandStyle(cardCount: number, viewportWidth: number): CSSProperties {
  if (viewportWidth > 767 || cardCount <= 0) {
    return {};
  }

  const availableWidth = Math.max(240, viewportWidth - 50);
  const cardWidth = Math.min(58, Math.max(44, viewportWidth * 0.132));
  const visibleStep = cardCount === 1
    ? cardWidth
    : Math.min(cardWidth * 0.8, (availableWidth - cardWidth) / (cardCount - 1));

  return {
    "--mobile-hand-card-width": `${cardWidth}px`,
    "--mobile-hand-card-overlap": `${visibleStep - cardWidth}px`
  } as CSSProperties;
}

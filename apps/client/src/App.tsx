import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameTable } from "./components/GameTable.js";
import { HomeScreen } from "./components/HomeScreen.js";
import { MatchLaunchOverlay } from "./components/MatchLaunchOverlay.js";
import { TournamentsPage } from "./components/engagement/TournamentsPage.js";
import { MatchResultModal } from "./components/results/MatchResultModal.js";
import { installMusicUnlock } from "./lib/music.js";
import { useGameStore } from "./store/gameStore.js";
import { useAuthStore } from "./store/authStore.js";
import type { CardStyle, TableTheme } from "./store/gameStore.js";

export function App() {
  const connect = useGameStore((store) => store.connect);
  const hydrateTheme = useGameStore((store) => store.hydrateTheme);
  const screen = useGameStore((store) => store.screen);
  const state = useGameStore((store) => store.state);
  const socketStatus = useGameStore((store) => store.socketStatus);
  const matchLaunch = useGameStore((store) => store.matchLaunch);
  const returnHomeForNetworkProblem = useGameStore((store) => store.returnHomeForNetworkProblem);
  const error = useGameStore((store) => store.error);
  const clearError = useGameStore((store) => store.clearError);
  const syncIdentity = useGameStore((store) => store.syncIdentity);
  const setTableTheme = useGameStore((store) => store.setTableTheme);
  const setCardStyle = useGameStore((store) => store.setCardStyle);
  const setMuted = useGameStore((store) => store.setMuted);
  const setMusicEnabled = useGameStore((store) => store.setMusicEnabled);
  const lastMatchResult = useGameStore((store) => store.lastMatchResult);
  const matchRematchContext = useGameStore((store) => store.matchRematchContext);
  const matchResultOpen = useGameStore((store) => store.matchResultOpen);
  const matchResultPending = useGameStore((store) => store.matchResultPending);
  const openMatchResult = useGameStore((store) => store.openMatchResult);
  const closeMatchResult = useGameStore((store) => store.closeMatchResult);
  const rematchLastGame = useGameStore((store) => store.rematchLastGame);
  const leaveRoom = useGameStore((store) => store.leaveRoom);
  const goHome = useGameStore((store) => store.goHome);
  const authStatus = useAuthStore((store) => store.status);
  const guest = useAuthStore((store) => store.guest);
  const profile = useAuthStore((store) => store.profile);
  const idToken = useAuthStore((store) => store.idToken);
  const [networkSecondsLeft, setNetworkSecondsLeft] = useState<number>();
  const trackedNetworkProblem = useRef<{ key: string; startedAt: number } | undefined>(undefined);

  const initialRoomCode = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return new URLSearchParams(window.location.search).get("room") ?? undefined;
  }, []);

  useEffect(() => {
    hydrateTheme();
    installMusicUnlock();
  }, [hydrateTheme]);

  useEffect(() => {
    if (authStatus === "guest" && guest) {
      syncIdentity({
        username: guest.displayName,
        avatar: guest.avatarId,
        accountType: "guest",
        identityId: guest.id
      });
      connect();
    }
    if (authStatus === "registered" && profile && idToken) {
      syncIdentity({
        username: profile.displayName,
        avatar: profile.avatarId,
        accountType: "registered",
        identityId: profile.id,
        authToken: idToken,
        rankBadge: profile.rank
      });
      setTableTheme(profile.preferences.tableTheme as TableTheme);
      setCardStyle(profile.preferences.cardBack as CardStyle);
      setMuted(!profile.preferences.soundEnabled);
      setMusicEnabled(profile.preferences.musicEnabled);
      connect();
    }
  }, [authStatus, connect, guest, idToken, profile, setCardStyle, setMusicEnabled, setMuted, setTableTheme, syncIdentity]);

  useEffect(() => {
    if (screen === "home" && lastMatchResult && matchResultPending) {
      openMatchResult();
    }
  }, [lastMatchResult, matchResultPending, openMatchResult, screen]);

  useEffect(() => {
    const disconnectedRoom = screen === "room" && Boolean(state) && socketStatus !== "online";
    const problemKey = matchLaunch
      ? `launch:${matchLaunch.startedAt}`
      : disconnectedRoom && state
        ? `room:${state.roomCode}`
        : undefined;

    if (!problemKey) {
      trackedNetworkProblem.current = undefined;
      setNetworkSecondsLeft(undefined);
      return undefined;
    }

    if (trackedNetworkProblem.current?.key !== problemKey) {
      trackedNetworkProblem.current = {
        key: problemKey,
        startedAt: matchLaunch?.startedAt ?? Date.now()
      };
    }
    const startedAt = trackedNetworkProblem.current.startedAt;
    const updateCountdown = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setNetworkSecondsLeft(Math.max(0, 30 - elapsedSeconds));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    const remainingMs = Math.max(0, 30_000 - (Date.now() - startedAt));
    const timeout = window.setTimeout(() => {
      trackedNetworkProblem.current = undefined;
      setNetworkSecondsLeft(undefined);
      returnHomeForNetworkProblem();
    }, remainingMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [matchLaunch, returnHomeForNetworkProblem, screen, socketStatus, state]);

  return (
    <>
      {screen === "room" && state ? (
        <GameTable />
      ) : screen === "tournaments" ? (
        <TournamentsPage />
      ) : (
        <HomeScreen initialRoomCode={initialRoomCode} />
      )}

      <a
        className="developer-credit"
        href="https://www.linkedin.com/in/hamza-babar/"
        target="_blank"
        rel="noreferrer"
      >
        Developed by Hamza Babar
      </a>

      <MatchResultModal
        open={matchResultOpen}
        result={lastMatchResult}
        onClose={closeMatchResult}
        onRematch={rematchLastGame}
        onReturn={() => {
          closeMatchResult();
          if (state) leaveRoom();
          else goHome();
        }}
        primaryActionLabel={matchRematchContext?.continueTournamentStage ? "Next Stage" : "Rematch"}
      />

      <MatchLaunchOverlay />

      <AnimatePresence>
        {networkSecondsLeft !== undefined && screen === "room" ? (
          <motion.div
            className="network-recovery-banner"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <WifiOff size={18} />
            <span>
              <strong>Connection interrupted</strong>
              <small>Reconnecting now. Returning home in {networkSecondsLeft}s if the network does not recover.</small>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {error ? (
          <motion.div
            className="fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-2xl border border-orange-300 bg-white/95 p-4 text-sm font-bold text-slate-900 shadow-card backdrop-blur dark:border-orange-400/40 dark:bg-slate-950/90 dark:text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <AlertTriangle className="shrink-0 text-orange-500" size={20} />
            <span className="min-w-0 flex-1">{error}</span>
            <button className="rounded-full bg-slate-950 px-3 py-1 text-xs text-white dark:bg-white dark:text-slate-950" onClick={clearError}>
              Dismiss
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

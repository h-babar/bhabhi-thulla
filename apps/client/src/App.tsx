import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { GameTable } from "./components/GameTable.js";
import { HomeScreen } from "./components/HomeScreen.js";
import { TournamentsPage } from "./components/engagement/TournamentsPage.js";
import { installMusicUnlock } from "./lib/music.js";
import { useGameStore } from "./store/gameStore.js";

export function App() {
  const connect = useGameStore((store) => store.connect);
  const hydrateTheme = useGameStore((store) => store.hydrateTheme);
  const screen = useGameStore((store) => store.screen);
  const state = useGameStore((store) => store.state);
  const error = useGameStore((store) => store.error);
  const clearError = useGameStore((store) => store.clearError);

  const initialRoomCode = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return new URLSearchParams(window.location.search).get("room") ?? undefined;
  }, []);

  useEffect(() => {
    hydrateTheme();
    installMusicUnlock();
    connect();
  }, [connect, hydrateTheme]);

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

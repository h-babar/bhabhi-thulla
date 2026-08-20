import { AnimatePresence, motion } from "framer-motion";
import { Clock3, LoaderCircle, SignalLow, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGameStore, type MatchLaunchKind } from "../store/gameStore.js";

const launchLabels: Record<MatchLaunchKind, string> = {
  create: "Creating your room",
  join: "Joining the table",
  quick: "Finding a quick match",
  bots: "Preparing the bot table",
  tournament: "Entering the tournament",
  start: "Starting the match",
  nextRound: "Preparing the next round",
  rejoin: "Rejoining your match"
};

type LaunchPhase = "loading" | "slow" | "problem";

export function MatchLaunchOverlay() {
  const launch = useGameStore((store) => store.matchLaunch);
  const socketStatus = useGameStore((store) => store.socketStatus);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!launch) return;

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(interval);
  }, [launch]);

  const elapsed = launch ? Math.max(0, now - launch.startedAt) : 0;
  const phase = useMemo<LaunchPhase>(() => {
    if (socketStatus === "offline" || elapsed >= 14_000) return "problem";
    if (elapsed >= 5_500) return "slow";
    return "loading";
  }, [elapsed, socketStatus]);

  const content = phase === "problem"
    ? {
        eyebrow: "Connection problem",
        title: "Still trying to reach the table",
        body: "Your match request is safe. We will continue automatically when the connection returns."
      }
    : phase === "slow"
      ? {
          eyebrow: "Slow connection",
          title: launch ? launchLabels[launch.kind] : "Starting the match",
          body: "The server is taking longer than usual. Please keep this window open."
        }
      : {
          eyebrow: socketStatus === "connecting" ? "Connecting to server" : "Table request sent",
          title: launch ? launchLabels[launch.kind] : "Starting the match",
          body: "Syncing players, cards, and the secure game state."
        };

  return (
    <AnimatePresence>
      {launch && elapsed >= 250 ? (
        <motion.div
          className={`match-launch-backdrop is-${phase}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
          aria-label={`${content.eyebrow}. ${content.title}`}
        >
          <motion.div
            className="match-launch-panel"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="match-launch-icon" aria-hidden="true">
              {phase === "problem" ? (
                <WifiOff size={26} />
              ) : phase === "slow" ? (
                <SignalLow size={26} />
              ) : (
                <LoaderCircle className="match-launch-spinner" size={27} />
              )}
            </div>

            <div className="match-launch-copy">
              <p>{content.eyebrow}</p>
              <h2>{content.title}</h2>
              <span>{content.body}</span>
            </div>

            <div className="match-launch-progress" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>

            <div className="match-launch-footer">
              <span><Clock3 size={14} /> {Math.max(1, Math.ceil(elapsed / 1000))}s</span>
              <strong>{phase === "problem" ? "Auto reconnecting" : "Please wait"}</strong>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

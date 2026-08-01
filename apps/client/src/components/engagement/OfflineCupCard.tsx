import clsx from "clsx";
import { Bot, Check, ChevronRight, Crown, Gift, Play, RotateCcw, Shield, Timer, Trophy, WifiOff } from "lucide-react";
import { motion } from "framer-motion";
import type { TournamentItem } from "../../data/engagementMock.js";
import type { OfflineCupProgress } from "../../store/engagementStore.js";

const stages = ["Group", "Quarter", "Semi", "Final"];

export function OfflineCupCard({
  tournament,
  progress,
  activeRun,
  onPlay,
  onResume,
  onDetails,
  onClaim
}: {
  tournament: TournamentItem;
  progress?: OfflineCupProgress;
  activeRun: boolean;
  onPlay: () => void;
  onResume: () => void;
  onDetails: () => void;
  onClaim: () => void;
}) {
  const difficulty = tournament.difficulty ?? "normal";
  const won = progress?.status === "won";
  const rewardReady = won && !progress.rewardClaimed;
  const status = activeRun
    ? `Stage ${progress?.currentStage ?? 1} live`
    : won
      ? "Champion"
      : progress?.status === "eliminated"
        ? "Run complete"
        : "Ready now";

  return (
    <motion.article
      className={clsx("offline-cup-card", `offline-cup-${difficulty}`, won && "is-champion", activeRun && "is-active")}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="offline-cup-ambient" aria-hidden="true"><span /><span /><span /></div>
      <header className="offline-cup-topline">
        <span><WifiOff size={14} /> Solo AI cup</span>
        <strong className={clsx(activeRun && "is-live", won && "is-won")}>{status}</strong>
      </header>

      <div className="offline-cup-identity">
        <div className="offline-cup-emblem"><Trophy size={29} /><span>{difficulty.slice(0, 1).toUpperCase()}</span></div>
        <div>
          <p>{tournament.tier}</p>
          <h3>{tournament.name}</h3>
        </div>
      </div>

      <p className="offline-cup-description">{tournament.description}</p>

      <div className="offline-cup-specs">
        <span><Bot size={15} /><small>Opponents</small><strong>{difficulty === "hard" ? "Expert AI" : difficulty === "easy" ? "Learning AI" : "Smart AI"}</strong></span>
        <span><Timer size={15} /><small>Turn clock</small><strong>{tournament.turnSeconds}s</strong></span>
        <span><Shield size={15} /><small>Format</small><strong>4 stages</strong></span>
      </div>

      <div className="offline-cup-route" aria-label="Cup route">
        {stages.map((stage, index) => {
          const reached = won || (progress?.bestStage ?? 0) > index;
          const current = activeRun && (progress?.currentStage ?? 1) === index + 1;
          return (
            <div key={stage} className={clsx(reached && "is-reached", current && "is-current")}>
              <span>{reached && !current ? <Check size={13} /> : index + 1}</span>
              <small>{stage}</small>
            </div>
          );
        })}
      </div>

      <div className="offline-cup-reward">
        <span><Gift size={17} /> Champion reward</span>
        <strong>{tournament.reward}</strong>
      </div>

      <div className="offline-cup-record">
        <span><small>Best stage</small><strong>{progress?.bestStage ? stages[Math.min(3, progress.bestStage - 1)] : "Unranked"}</strong></span>
        <span><small>Attempts</small><strong>{progress?.attempts ?? 0}</strong></span>
        <span><small>Titles</small><strong>{progress?.championships ?? 0}</strong></span>
      </div>

      <footer className="offline-cup-actions">
        {rewardReady ? (
          <button className="offline-cup-primary is-reward" onClick={onClaim}><Gift size={17} /> Claim reward</button>
        ) : activeRun ? (
          <button className="offline-cup-primary" onClick={onResume}><Play size={17} /> Resume match</button>
        ) : (
          <button className="offline-cup-primary" onClick={onPlay}>
            {progress ? <RotateCcw size={17} /> : <Play size={17} />}
            {progress ? "Start new run" : "Play cup"}
          </button>
        )}
        <button className="offline-cup-details" onClick={onDetails}>Details <ChevronRight size={16} /></button>
      </footer>

      {won ? <div className="offline-cup-crown" aria-hidden="true"><Crown size={18} /></div> : null}
    </motion.article>
  );
}

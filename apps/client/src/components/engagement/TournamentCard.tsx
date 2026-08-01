import clsx from "clsx";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  Crown,
  LockKeyhole,
  Radio,
  Shield,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import { motion } from "framer-motion";
import type { TournamentItem } from "../../data/engagementMock.js";
import { CountdownTimer } from "./CountdownTimer.js";

const kindLabels: Record<TournamentItem["kind"], string> = {
  daily: "Daily Series",
  weekly: "Weekly Major",
  weekend: "Weekend Special",
  private: "Private League",
  offline: "Solo AI Cup"
};

export function TournamentCard({
  tournament,
  joined,
  joinLabel,
  joinedLabel,
  onJoin,
  onOpen,
  onRules
}: {
  tournament: TournamentItem;
  joined?: boolean;
  joinLabel?: string;
  joinedLabel?: string;
  onJoin: () => void;
  onOpen: () => void;
  onRules: () => void;
}) {
  const live = tournament.status === "live";
  const completed = tournament.status === "completed";
  const capacity = Math.min(100, Math.round((tournament.players / tournament.maxPlayers) * 100));

  return (
    <motion.article
      className={clsx(
        "tournament-pro-card",
        `tournament-kind-${tournament.kind}`,
        `tournament-status-${tournament.status}`,
        joined && "is-joined"
      )}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <div className="tournament-card-topline">
        <span className="tournament-series-label">{kindLabels[tournament.kind]}</span>
        <span className={clsx("tournament-status-badge", live && "is-live", completed && "is-completed")}>
          {live ? <Radio size={12} /> : tournament.kind === "private" ? <LockKeyhole size={12} /> : <Crown size={12} />}
          {tournament.entryStatus}
        </span>
      </div>

      <div className="tournament-card-title-row">
        <div className="tournament-card-emblem"><Trophy size={24} /></div>
        <div className="min-w-0">
          <p>{tournament.tier}</p>
          <h3>{tournament.name}</h3>
        </div>
      </div>

      <p className="tournament-card-description">{tournament.description}</p>

      <div className="tournament-format-line">
        <span><Shield size={14} /> {tournament.mode}</span>
        <span><Zap size={14} /> {tournament.format}</span>
      </div>

      <div className="tournament-capacity">
        <div>
          <span><Users size={14} /> Field</span>
          <strong>{tournament.players}/{tournament.maxPlayers}</strong>
        </div>
        <div className="tournament-capacity-track"><span style={{ width: `${capacity}%` }} /></div>
      </div>

      <div className="tournament-card-prize">
        <span>Champion reward</span>
        <strong>{tournament.reward}</strong>
      </div>

      <div className="tournament-card-time">
        <CalendarClock size={15} />
        <CountdownTimer
          targetTime={tournament.startTime}
          label={live ? "Live now" : completed ? "Finished" : "Starts in"}
          compact
        />
      </div>

      <div className="tournament-card-actions">
        <button
          className={clsx("tournament-join-button", joined && "is-joined")}
          disabled={completed}
          onClick={onJoin}
        >
          {joined ? <Check size={16} /> : live ? <Radio size={15} /> : <Crown size={15} />}
          {completed
            ? "Results"
            : joined
              ? joinedLabel ?? "Entered"
              : joinLabel ?? (live ? "Join Live" : tournament.kind === "private" ? "Enter Code" : "Enter")}
        </button>
        <button className="tournament-icon-action" onClick={onRules} aria-label={`Rules for ${tournament.name}`}>
          <BookOpen size={17} />
        </button>
        <button className="tournament-detail-button" onClick={onOpen}>
          Details <ChevronRight size={16} />
        </button>
      </div>
    </motion.article>
  );
}

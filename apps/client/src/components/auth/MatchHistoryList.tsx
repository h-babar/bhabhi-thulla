import type { MatchHistoryEntry } from "@getaway-cards/shared";
import { CalendarDays, Clock3, Users } from "lucide-react";

export function MatchHistoryList({ matches }: { matches: MatchHistoryEntry[] }) {
  if (matches.length === 0) return <div className="profile-empty-state">Your completed matches will appear here.</div>;
  return (
    <div className="match-history-list">
      {matches.map((match) => (
        <article key={match.id}>
          <span className={`match-result-badge is-${match.result}`}>{match.result}</span>
          <div>
            <strong>{formatMode(match.gameMode)}</strong>
            <p><CalendarDays size={13} /> {new Date(match.completedAt).toLocaleDateString()}</p>
          </div>
          <span><Users size={14} /> {match.playerCount}</span>
          <span>#{match.finalPosition}</span>
          <span><Clock3 size={14} /> {formatDuration(match.completedAt - match.startedAt)}</span>
        </article>
      ))}
    </div>
  );
}

function formatMode(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  return `${minutes}m`;
}

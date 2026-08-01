import type { PlayerStats } from "@getaway-cards/shared";
import { Crown, Flame, Gamepad2, ShieldAlert, Sparkles, Trophy } from "lucide-react";

export function PlayerStatsPanel({ stats }: { stats: PlayerStats }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  const items = [
    { label: "Games", value: stats.gamesPlayed, icon: Gamepad2 },
    { label: "Wins", value: stats.wins, icon: Crown },
    { label: "Win rate", value: `${winRate}%`, icon: Trophy },
    { label: "Bhabhi", value: stats.bhabhiCount, icon: ShieldAlert },
    { label: "Tricks", value: stats.tricksWon, icon: Sparkles },
    { label: "Current streak", value: stats.currentWinStreak, icon: Flame },
    { label: "Best streak", value: stats.bestWinStreak, icon: Flame },
    { label: "Tournament wins", value: stats.tournamentWins, icon: Trophy }
  ];

  return (
    <div className="profile-stats-grid">
      {items.map(({ label, value, icon: Icon }) => (
        <article key={label}>
          <Icon size={17} />
          <strong>{value}</strong>
          <span>{label}</span>
        </article>
      ))}
    </div>
  );
}

import type { PublicGameState } from "@getaway-cards/shared";
import { Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface ScoreBoardProps {
  state: PublicGameState;
}

export function ScoreBoard({ state }: ScoreBoardProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 300);
    return () => window.clearInterval(timer);
  }, []);

  const activePlayer = state.players.find((player) => player.id === state.activePlayerId);
  const timer = useMemo(() => {
    if (state.winCelebration) {
      const total = state.winCelebration.endsAt - state.winCelebration.startedAt;
      const remaining = Math.max(0, state.winCelebration.endsAt - now);
      return {
        remaining: Math.ceil(remaining / 1000),
        progress: total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
      };
    }

    if (!state.turnStartedAt || !state.turnEndsAt) {
      return { remaining: 0, progress: 0 };
    }

    const total = state.turnEndsAt - state.turnStartedAt;
    const remaining = Math.max(0, state.turnEndsAt - now);
    return {
      remaining: Math.ceil(remaining / 1000),
      progress: total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
    };
  }, [now, state.turnEndsAt, state.turnStartedAt, state.winCelebration]);

  return (
    <aside className="glass-panel rounded-3xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
            Escape Board
          </p>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">
            Round {Math.max(1, state.round)}
          </h3>
        </div>
        <div
          className="timer-ring grid h-14 w-14 place-items-center rounded-full p-1"
          style={{ "--timer-progress": `${timer.progress}%` } as React.CSSProperties}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-white text-xs font-black text-slate-900 dark:bg-slate-950 dark:text-white">
            {timer.remaining || <Timer size={16} />}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {state.players
          .slice()
          .sort((left, right) => right.score - left.score)
          .map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl bg-slate-950/5 px-3 py-2 text-sm dark:bg-white/10"
            >
              <span className="truncate font-bold text-slate-800 dark:text-slate-100">
                {player.username}
              </span>
              <span className="font-black text-slate-950 dark:text-white">{player.score}</span>
            </div>
          ))}
      </div>

      <div className="mt-4 rounded-2xl bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-900 dark:text-teal-100">
        {state.winCelebration
          ? `Celebrating ${state.winCelebration.username}`
          : activePlayer
            ? `${activePlayer.username}'s turn`
            : "Waiting for the next hand"}
      </div>
    </aside>
  );
}

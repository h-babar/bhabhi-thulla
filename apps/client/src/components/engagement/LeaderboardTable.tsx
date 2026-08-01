import { Medal } from "lucide-react";
import type { LeaderboardEntry } from "../../data/engagementMock.js";

export function LeaderboardTable({
  title,
  entries
}: {
  title: string;
  entries: LeaderboardEntry[];
}) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/12 bg-slate-950/70 text-white shadow-card backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-100">Leaderboard</p>
          <h3 className="text-lg font-black">{title}</h3>
        </div>
        <Medal className="text-amber-200" size={24} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Wins</th>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Badge</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${title}-${entry.rank}`} className="border-t border-white/8">
                <td className="px-4 py-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                    entry.rank <= 3 ? "bg-amber-200 text-slate-950" : "bg-white/10 text-white"
                  }`}>
                    {entry.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-300 to-amber-200 text-xs font-black text-slate-950">
                      {entry.avatar}
                    </span>
                    <span className="font-black">{entry.playerName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-black">{entry.wins}</td>
                <td className="px-4 py-3 font-black text-amber-100">{entry.points.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-teal-100">
                    {entry.badge}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

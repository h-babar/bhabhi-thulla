export function MissionProgress({
  title,
  progress,
  goal,
  points,
  tone = "teal"
}: {
  title: string;
  progress: number;
  goal: number;
  points?: number;
  tone?: "teal" | "gold" | "rose";
}) {
  const percent = Math.max(0, Math.min(100, (progress / Math.max(1, goal)) * 100));
  const fill = tone === "gold"
    ? "from-amber-200 to-yellow-500"
    : tone === "rose"
      ? "from-rose-300 to-orange-400"
      : "from-teal-300 to-emerald-400";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-3 text-white">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">{title}</p>
          <p className="text-xs font-bold text-white/55">
            {progress}/{goal} complete
          </p>
        </div>
        {points ? (
          <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-black text-slate-950">
            +{points} SP
          </span>
        ) : null}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/12">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${fill} shadow-[0_0_18px_rgba(45,212,191,0.35)]`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

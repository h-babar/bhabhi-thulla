import { Gift, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function RewardChest({
  name,
  tier,
  progress,
  goal,
  rewards
}: {
  name: string;
  tier: string;
  progress: number;
  goal: number;
  rewards: string[];
}) {
  const percent = Math.max(0, Math.min(100, (progress / Math.max(1, goal)) * 100));

  return (
    <motion.div
      className="relative overflow-hidden rounded-[1.5rem] border border-amber-200/25 bg-gradient-to-br from-amber-300/18 via-white/8 to-teal-300/12 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-200/20 blur-2xl" />
      <div className="relative z-10 flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-200 text-slate-950 shadow-[0_0_28px_rgba(250,204,21,0.35)]">
          <Gift size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-100">{tier} tier</p>
          <h3 className="text-xl font-black">{name}</h3>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/12">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-yellow-500" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs font-bold text-white/65">
            {progress.toLocaleString()} / {goal.toLocaleString()} season points
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-4 flex flex-wrap gap-2">
        {rewards.map((reward) => (
          <span key={reward} className="inline-flex items-center gap-1 rounded-full bg-black/28 px-3 py-1.5 text-xs font-black text-amber-50">
            <Sparkles size={13} />
            {reward}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

import { CheckCircle2, Gift, Lock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { ChallengeItem } from "../../data/engagementMock.js";
import { CountdownTimer } from "./CountdownTimer.js";
import { MissionProgress } from "./MissionProgress.js";

export function DailyChallengeCard({
  challenge,
  claimed,
  onClaim,
  featured = false
}: {
  challenge: ChallengeItem;
  claimed?: boolean;
  onClaim?: () => void;
  featured?: boolean;
}) {
  const isClaimed = claimed ?? challenge.claimed;
  const isComplete = challenge.completed || challenge.progress >= challenge.goal;

  return (
    <motion.article
      className={`relative overflow-hidden rounded-[1.5rem] border p-4 text-white shadow-card ${
        featured
          ? "border-amber-200/35 bg-gradient-to-br from-emerald-950 via-slate-950 to-amber-950/70"
          : "border-white/10 bg-white/8"
      }`}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-amber-200/15 blur-2xl" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-100">Today&apos;s Challenge</p>
          <h3 className="mt-1 text-xl font-black">{challenge.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/65">{challenge.description}</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-200 text-slate-950">
          {isClaimed ? <CheckCircle2 size={23} /> : <Sparkles size={23} />}
        </div>
      </div>

      <div className="relative z-10 mt-4">
        <MissionProgress title="Daily progress" progress={challenge.progress} goal={challenge.goal} tone="gold" />
      </div>

      <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Reward</p>
          <p className="text-sm font-black">{challenge.reward}</p>
        </div>
        <CountdownTimer targetTime={challenge.resetAt} compact />
      </div>

      <button
        className={`relative z-10 mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition ${
          isClaimed
            ? "bg-white/12 text-white/50"
            : isComplete
              ? "bg-amber-200 text-slate-950 shadow-[0_0_28px_rgba(250,204,21,0.28)] hover:-translate-y-0.5"
              : "bg-white/10 text-white/60"
        }`}
        disabled={!isComplete || isClaimed}
        onClick={onClaim}
      >
        {isClaimed ? <CheckCircle2 size={17} /> : isComplete ? <Gift size={17} /> : <Lock size={17} />}
        {isClaimed ? "Reward Claimed" : isComplete ? "Claim Reward" : "Keep Playing"}
      </button>
    </motion.article>
  );
}

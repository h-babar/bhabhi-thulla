import { CalendarDays, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import type { WeeklyEvent } from "../../data/engagementMock.js";
import { CountdownTimer } from "./CountdownTimer.js";
import { MissionProgress } from "./MissionProgress.js";
import { RewardChest } from "./RewardChest.js";

export function WeeklyEventCard({ event }: { event: WeeklyEvent }) {
  return (
    <motion.section
      className="overflow-hidden rounded-[1.75rem] border border-white/12 bg-slate-950/74 p-4 text-white shadow-card backdrop-blur"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 250, damping: 24 }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-100">
            <CalendarDays size={15} />
            Weekly Event
          </p>
          <h2 className="mt-2 text-2xl font-black">{event.title}</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-white/62">{event.subtitle}</p>
        </div>
        <CountdownTimer targetTime={event.resetAt} label="Weekly reset" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {event.missions.map((mission) => (
            <MissionProgress
              key={mission.id}
              title={mission.title}
              progress={mission.progress}
              goal={mission.goal}
              points={mission.points}
              tone="teal"
            />
          ))}
        </div>
        <div className="grid gap-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-teal-100">
              <Trophy size={15} />
              Season Points
            </p>
            <p className="mt-2 text-4xl font-black text-amber-100">{event.seasonPoints.toLocaleString()}</p>
          </div>
          <RewardChest {...event.rewardChest} />
        </div>
      </div>
    </motion.section>
  );
}

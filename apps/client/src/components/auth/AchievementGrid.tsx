import type { PlayerAchievement } from "@getaway-cards/shared";
import { Crown, Flame, Layers, Lock, Shield, Sparkles, Trophy } from "lucide-react";

const iconMap = { cards: Layers, crown: Crown, flame: Flame, shield: Shield, sparkles: Sparkles, trophy: Trophy };

export function AchievementGrid({ achievements }: { achievements: PlayerAchievement[] }) {
  if (achievements.length === 0) {
    return <div className="profile-empty-state">Sign in to unlock permanent achievement tracking.</div>;
  }
  return (
    <div className="achievement-grid">
      {achievements.map((achievement) => {
        const unlocked = Boolean(achievement.unlockedAt);
        const Icon = iconMap[achievement.icon as keyof typeof iconMap] ?? Trophy;
        const progress = Math.min(100, Math.round((achievement.progress / achievement.requirement) * 100));
        return (
          <article key={achievement.id} className={unlocked ? "is-unlocked" : "is-locked"}>
            <span className="achievement-icon">{unlocked ? <Icon size={21} /> : <Lock size={18} />}</span>
            <div>
              <strong>{achievement.name}</strong>
              <p>{achievement.description}</p>
              <div className="achievement-progress"><span style={{ width: `${progress}%` }} /></div>
              <small>{Math.min(achievement.progress, achievement.requirement)} / {achievement.requirement}</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

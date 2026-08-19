import { Check, Coins, Flame, Gift, LockKeyhole } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../store/authStore.js";

export function DailyRewardPanel() {
  const authStatus = useAuthStore((store) => store.status);
  const guest = useAuthStore((store) => store.guest);
  const profile = useAuthStore((store) => store.profile);
  const dailyReward = useAuthStore((store) => store.dailyReward);
  const rewardLoading = useAuthStore((store) => store.rewardLoading);
  const rewardNotice = useAuthStore((store) => store.rewardNotice);
  const refreshRewards = useAuthStore((store) => store.refreshRewards);
  const claimReward = useAuthStore((store) => store.claimReward);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void refreshRewards();
  }, [authStatus, refreshRewards]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const resetLabel = useMemo(() => {
    if (!dailyReward) return "Loading rewards";
    const remaining = Math.max(0, dailyReward.nextResetAt - now);
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    return `Resets in ${hours}h ${String(minutes).padStart(2, "0")}m`;
  }, [dailyReward, now]);

  const balance = profile?.coins ?? guest?.coins ?? 0;

  return (
    <section className="daily-reward-panel" aria-label="Daily rewards">
      <div className="daily-reward-heading">
        <span className="daily-reward-icon"><Gift size={19} /></span>
        <span>
          <small>Daily rewards</small>
          <strong>Thulla Coin streak</strong>
        </span>
        <span className="daily-wallet-balance" title="Your Thulla Coin balance">
          <Coins size={16} /> {balance.toLocaleString()}
        </span>
      </div>

      <div className="daily-reward-meta">
        <span><Flame size={14} /> {dailyReward?.streak ?? 0} day streak</span>
        <span>{resetLabel}</span>
      </div>

      <div className="daily-reward-track">
        {(dailyReward?.calendar ?? []).map((item) => (
          <span key={item.day} className={`daily-reward-day is-${item.state}`}>
            <small>D{item.day}</small>
            {item.state === "claimed" ? <Check size={14} /> : item.state === "locked" ? <LockKeyhole size={12} /> : <Coins size={14} />}
            <strong>{item.amount}</strong>
          </span>
        ))}
        {!dailyReward ? Array.from({ length: 7 }, (_, index) => <span key={index} className="daily-reward-day is-loading" />) : null}
      </div>

      <motion.button
        type="button"
        className="daily-reward-claim"
        disabled={!dailyReward?.canClaim || rewardLoading}
        onClick={() => void claimReward()}
        whileTap={dailyReward?.canClaim ? { scale: 0.98 } : undefined}
      >
        <Coins size={17} />
        {rewardLoading
          ? "Checking reward..."
          : dailyReward?.canClaim
            ? `Claim ${dailyReward.rewardAmount} coins`
            : "Claimed today"}
      </motion.button>

      {rewardNotice ? <p className="daily-reward-notice" role="status">{rewardNotice}</p> : null}
    </section>
  );
}

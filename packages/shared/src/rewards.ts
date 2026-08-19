import type { PlayerProfile } from "./profile.js";

export const DAILY_REWARD_AMOUNTS = Object.freeze([50, 75, 100, 125, 150, 200, 350] as const);

export interface DailyRewardCalendarDay {
  day: number;
  amount: number;
  state: "claimed" | "available" | "locked";
}

export interface DailyRewardStatus {
  canClaim: boolean;
  claimedToday: boolean;
  streak: number;
  totalClaims: number;
  nextRewardDay: number;
  rewardAmount: number;
  lastClaimDate?: string;
  nextResetAt: number;
  calendar: DailyRewardCalendarDay[];
}

export interface DailyRewardResponse {
  ok: boolean;
  status?: DailyRewardStatus;
  profile?: PlayerProfile;
  awardedCoins?: number;
  error?: string;
}

export interface DailyRewardRecord {
  lastClaimDate?: string;
  streak: number;
  totalClaims: number;
}

export function getRewardDateKey(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getDailyRewardStatus(
  record: DailyRewardRecord,
  timestamp = Date.now()
): DailyRewardStatus {
  const today = getRewardDateKey(timestamp);
  const yesterday = getRewardDateKey(timestamp - 86_400_000);
  const claimedToday = record.lastClaimDate === today;
  const continuing = claimedToday || record.lastClaimDate === yesterday;
  const nextStreak = claimedToday
    ? Math.max(1, record.streak + 1)
    : continuing
      ? Math.max(1, record.streak + 1)
      : 1;
  const nextRewardDay = ((nextStreak - 1) % DAILY_REWARD_AMOUNTS.length) + 1;
  const currentCycleDay = record.streak > 0
    ? ((record.streak - 1) % DAILY_REWARD_AMOUNTS.length) + 1
    : 0;
  const completedInCycle = continuing
    ? claimedToday
      ? currentCycleDay
      : nextRewardDay === 1
        ? 0
        : currentCycleDay
    : 0;
  const availableDay = claimedToday ? -1 : nextRewardDay;

  return {
    canClaim: !claimedToday,
    claimedToday,
    streak: Math.max(0, record.streak),
    totalClaims: Math.max(0, record.totalClaims),
    nextRewardDay,
    rewardAmount: DAILY_REWARD_AMOUNTS[nextRewardDay - 1]!,
    lastClaimDate: record.lastClaimDate,
    nextResetAt: Date.parse(`${today}T00:00:00.000Z`) + 86_400_000,
    calendar: DAILY_REWARD_AMOUNTS.map((amount, index) => {
      const day = index + 1;
      return {
        day,
        amount,
        state: day <= completedInCycle
          ? "claimed"
          : day === availableDay
            ? "available"
            : "locked"
      };
    })
  };
}

export function claimDailyReward(
  record: DailyRewardRecord,
  timestamp = Date.now()
): { record: DailyRewardRecord; awardedCoins: number; status: DailyRewardStatus } {
  const current = getDailyRewardStatus(record, timestamp);
  if (!current.canClaim) {
    return { record, awardedCoins: 0, status: current };
  }

  const today = getRewardDateKey(timestamp);
  const yesterday = getRewardDateKey(timestamp - 86_400_000);
  const streak = record.lastClaimDate === yesterday ? Math.max(1, record.streak + 1) : 1;
  const rewardDay = ((streak - 1) % DAILY_REWARD_AMOUNTS.length) + 1;
  const nextRecord = {
    lastClaimDate: today,
    streak,
    totalClaims: Math.max(0, record.totalClaims) + 1
  };
  return {
    record: nextRecord,
    awardedCoins: DAILY_REWARD_AMOUNTS[rewardDay - 1]!,
    status: getDailyRewardStatus(nextRecord, timestamp)
  };
}

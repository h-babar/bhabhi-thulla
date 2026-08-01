import type { BotDifficulty, TournamentNation, TournamentState } from "@getaway-cards/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DAILY_THULLA_CUP_ID = "daily-thulla-cup";

export type DailyCupStatus = "entered" | "checked_in" | "playing" | "completed";

export interface DailyCupEntry {
  tournamentId: string;
  nationCode: string;
  nationName: string;
  nationFlag: string;
  difficulty: BotDifficulty;
  status: DailyCupStatus;
  joinedAt: string;
  checkedInAt?: string;
  startedAt?: string;
  matchesPlayed: number;
  cupPoints: number;
  rewardClaimed: boolean;
  dailyResetKey: string;
}

export type OfflineCupStatus = "ready" | "playing" | "won" | "eliminated";

export interface OfflineCupProgress {
  tournamentId: string;
  status: OfflineCupStatus;
  currentStage: number;
  bestStage: number;
  attempts: number;
  championships: number;
  rewardClaimed: boolean;
  lastRunId?: string;
  updatedAt: string;
}

interface EngagementStore {
  joinedTournamentIds: string[];
  dailyCupEntry?: DailyCupEntry;
  offlineCupProgress: Record<string, OfflineCupProgress>;
  joinTournament: (id: string) => void;
  leaveTournament: (id: string) => void;
  joinDailyCup: (tournamentId: string, nation: TournamentNation, difficulty: BotDifficulty) => void;
  checkInDailyCup: () => void;
  markDailyCupStarted: () => void;
  claimDailyCupReward: () => void;
  resetExpiredDailyCup: () => void;
  beginOfflineCup: (tournamentId: string) => void;
  syncOfflineCup: (tournament: TournamentState) => void;
  claimOfflineCupReward: (tournamentId: string) => void;
}

function dailyResetKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function uniqueWith(id: string, ids: string[]): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function without(id: string, ids: string[]): string[] {
  return ids.filter((item) => item !== id);
}

export const useEngagementStore = create<EngagementStore>()(
  persist(
    (set, get) => ({
      joinedTournamentIds: [],
      offlineCupProgress: {},
      joinTournament: (id) =>
        set((state) => ({
          joinedTournamentIds: uniqueWith(id, state.joinedTournamentIds)
        })),
      leaveTournament: (id) =>
        set((state) => ({
          joinedTournamentIds: without(id, state.joinedTournamentIds),
          dailyCupEntry: id === DAILY_THULLA_CUP_ID ? undefined : state.dailyCupEntry
        })),
      joinDailyCup: (tournamentId, nation, difficulty) =>
        set((state) => {
          const existing = state.dailyCupEntry?.dailyResetKey === dailyResetKey() ? state.dailyCupEntry : undefined;
          return {
            joinedTournamentIds: uniqueWith(tournamentId, state.joinedTournamentIds),
            dailyCupEntry: {
              tournamentId,
              nationCode: nation.code,
              nationName: nation.name,
              nationFlag: nation.flag,
              difficulty,
              status: existing?.status ?? "entered",
              joinedAt: existing?.joinedAt ?? new Date().toISOString(),
              checkedInAt: existing?.checkedInAt,
              startedAt: existing?.startedAt,
              matchesPlayed: existing?.matchesPlayed ?? 0,
              cupPoints: existing?.cupPoints ?? 0,
              rewardClaimed: existing?.rewardClaimed ?? false,
              dailyResetKey: dailyResetKey()
            }
          };
        }),
      checkInDailyCup: () =>
        set((state) => {
          if (!state.dailyCupEntry) return state;
          return {
            dailyCupEntry: {
              ...state.dailyCupEntry,
              status: state.dailyCupEntry.status === "entered" ? "checked_in" : state.dailyCupEntry.status,
              checkedInAt: state.dailyCupEntry.checkedInAt ?? new Date().toISOString()
            }
          };
        }),
      markDailyCupStarted: () =>
        set((state) => {
          if (!state.dailyCupEntry) return state;
          return {
            dailyCupEntry: {
              ...state.dailyCupEntry,
              status: "playing",
              startedAt: new Date().toISOString(),
              checkedInAt: state.dailyCupEntry.checkedInAt ?? new Date().toISOString(),
              matchesPlayed: state.dailyCupEntry.matchesPlayed + 1,
              cupPoints: Math.min(1200, state.dailyCupEntry.cupPoints + 220)
            }
          };
        }),
      claimDailyCupReward: () =>
        set((state) => {
          if (!state.dailyCupEntry || state.dailyCupEntry.rewardClaimed || state.dailyCupEntry.matchesPlayed === 0) {
            return state;
          }

          return {
            dailyCupEntry: {
              ...state.dailyCupEntry,
              status: "completed",
              rewardClaimed: true,
              cupPoints: Math.min(1200, state.dailyCupEntry.cupPoints + 300)
            }
          };
        }),
      resetExpiredDailyCup: () => {
        const entry = get().dailyCupEntry;
        if (!entry || entry.dailyResetKey === dailyResetKey()) return;
        set((state) => ({
          dailyCupEntry: undefined,
          joinedTournamentIds: without(DAILY_THULLA_CUP_ID, state.joinedTournamentIds)
        }));
      },
      beginOfflineCup: (tournamentId) =>
        set((state) => {
          const existing = state.offlineCupProgress[tournamentId];
          return {
            joinedTournamentIds: uniqueWith(tournamentId, state.joinedTournamentIds),
            offlineCupProgress: {
              ...state.offlineCupProgress,
              [tournamentId]: {
                tournamentId,
                status: "playing",
                currentStage: 1,
                bestStage: existing?.bestStage ?? 0,
                attempts: (existing?.attempts ?? 0) + 1,
                championships: existing?.championships ?? 0,
                rewardClaimed: false,
                updatedAt: new Date().toISOString()
              }
            }
          };
        }),
      syncOfflineCup: (tournament) => {
        const eventId = tournament.eventId;
        if (!eventId) return;
        set((state) => {
          const existing = state.offlineCupProgress[eventId];
          const sameRun = existing?.lastRunId === tournament.id;
          const reachedStage = Math.min(tournament.stages.length, tournament.stageIndex + 1);
          return {
            joinedTournamentIds: uniqueWith(eventId, state.joinedTournamentIds),
            offlineCupProgress: {
              ...state.offlineCupProgress,
              [eventId]: {
                tournamentId: eventId,
                status: tournament.status === "active" ? "playing" : tournament.status,
                currentStage: reachedStage,
                bestStage: Math.max(existing?.bestStage ?? 0, reachedStage),
                attempts: Math.max(1, existing?.attempts ?? 1),
                championships: (existing?.championships ?? 0) + (tournament.status === "won" && (!sameRun || existing?.status !== "won") ? 1 : 0),
                rewardClaimed: sameRun ? existing?.rewardClaimed ?? false : false,
                lastRunId: tournament.id,
                updatedAt: new Date(tournament.updatedAt).toISOString()
              }
            }
          };
        });
      },
      claimOfflineCupReward: (tournamentId) =>
        set((state) => {
          const progress = state.offlineCupProgress[tournamentId];
          if (!progress || progress.status !== "won" || progress.rewardClaimed) return state;
          return {
            offlineCupProgress: {
              ...state.offlineCupProgress,
              [tournamentId]: {
                ...progress,
                rewardClaimed: true,
                updatedAt: new Date().toISOString()
              }
            }
          };
        })
    }),
    {
      name: "bhabhi-thulla-engagement",
      storage: createJSONStorage(() => localStorage)
    }
  )
);

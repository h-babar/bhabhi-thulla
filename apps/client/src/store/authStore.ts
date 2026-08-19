import type {
  DailyRewardRecord,
  DailyRewardStatus,
  GuestProgressTransfer,
  PlayerAchievement,
  PlayerPreferences,
  PlayerProfile,
  PlayerStats,
  UpdatePlayerProfileInput,
  UsernameAvailabilityResponse
} from "@getaway-cards/shared";
import { claimDailyReward as calculateDailyReward, getDailyRewardStatus } from "@getaway-cards/shared";
import {
  getRedirectResult,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  checkUsername,
  claimDailyReward as claimDailyRewardRequest,
  exchangeGoogleToken,
  loadDailyReward,
  mergeGuestProgress,
  updateMyProfile
} from "../lib/authApi.js";
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from "../lib/firebase.js";

export type AuthStatus = "initializing" | "choice" | "guest" | "authenticating" | "registered" | "error";

export interface LocalGuestProfile {
  id: string;
  accountType: "guest";
  displayName: string;
  avatarId: string;
  label: "Guest";
  coins: number;
  stats: PlayerStats;
  preferences: PlayerPreferences;
  achievements: PlayerAchievement[];
  dailyRewards?: DailyRewardRecord;
  createdAt: number;
}

interface AuthStore {
  status: AuthStatus;
  guest?: LocalGuestProfile;
  profile?: PlayerProfile;
  idToken?: string;
  error?: string;
  profileOpen: boolean;
  upgradeOpen: boolean;
  dailyReward?: DailyRewardStatus;
  rewardLoading: boolean;
  rewardNotice?: string;
  initialize: () => Promise<void>;
  continueAsGuest: (displayName: string) => void;
  signInWithGoogle: (mergeGuest?: boolean) => Promise<void>;
  saveGuestProgress: () => Promise<void>;
  updateGuest: (input: { displayName?: string; avatarId?: string; preferences?: Partial<PlayerPreferences> }) => void;
  recordGuestMatch: (result: { won: boolean; wasBhabhi: boolean; tricksWon: number; tournamentWin: boolean }) => void;
  refreshRewards: () => Promise<void>;
  claimReward: () => Promise<void>;
  updateRegistered: (input: UpdatePlayerProfileInput) => Promise<boolean>;
  checkUsername: (username: string) => Promise<UsernameAvailabilityResponse>;
  logout: () => Promise<void>;
  changePlayer: () => Promise<void>;
  openProfile: () => void;
  closeProfile: () => void;
  openUpgrade: () => void;
  closeUpgrade: () => void;
  clearError: () => void;
}

let authListenerInstalled = false;
let handlingUserId: string | undefined;
let authFlowVersion = 0;
const pendingMergeKey = "bhabhi-thulla-pending-guest-merge";

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      status: "initializing",
      profileOpen: false,
      upgradeOpen: false,
      rewardLoading: false,
      initialize: async () => {
        if (!isFirebaseConfigured()) {
          set({ status: get().guest ? "guest" : "choice" });
          return;
        }
        const savedProfile = get().profile;
        set({ status: savedProfile ? "registered" : get().guest ? "guest" : "choice" });
        const auth = await getFirebaseAuth();
        if (!auth) {
          set({ status: get().guest ? "guest" : "choice" });
          return;
        }
        if (!authListenerInstalled) {
          authListenerInstalled = true;
          onIdTokenChanged(auth, async (user) => {
            if (!user) {
              handlingUserId = undefined;
              if (get().status !== "guest") set({ status: get().guest ? "guest" : "choice", profile: undefined, idToken: undefined });
              return;
            }
            await hydrateGoogleUser(user, set, get);
          });
        }
        try {
          const redirect = await getRedirectResult(auth);
          if (redirect?.user) await hydrateGoogleUser(redirect.user, set, get);
          else if (!auth.currentUser) set({ status: get().guest ? "guest" : "choice" });
        } catch (error) {
          set({ status: get().guest ? "guest" : "error", error: authErrorMessage(error) });
        }
      },
      continueAsGuest: (displayName) => {
        const name = cleanDisplayName(displayName);
        if (name.length < 2) {
          set({ error: "Enter a display name with at least 2 characters." });
          return;
        }
        const current = get().guest;
        const guest: LocalGuestProfile = current
          ? { ...current, displayName: name }
          : {
              id: crypto.randomUUID(),
              accountType: "guest",
              displayName: name,
              avatarId: "avatar_01",
              label: "Guest",
              coins: 0,
              stats: emptyStats(),
              preferences: defaultPreferences(),
              achievements: [],
              dailyRewards: { streak: 0, totalClaims: 0 },
              createdAt: Date.now()
            };
        authFlowVersion += 1;
        handlingUserId = undefined;
        set({ guest, status: "guest", error: undefined });
        void getFirebaseAuth()
          .then(async (auth) => {
            if (auth?.currentUser) await signOut(auth);
          })
          .catch(() => undefined);
      },
      signInWithGoogle: async (mergeGuest = false) => {
        authFlowVersion += 1;
        const auth = await getFirebaseAuth();
        if (!auth) {
          set({ error: "Google sign-in is not configured yet. Add the Firebase environment values first." });
          return;
        }
        set({ status: "authenticating", error: undefined });
        if (mergeGuest && get().guest) sessionStorage.setItem(pendingMergeKey, "1");
        try {
          const result = await signInWithPopup(auth, googleProvider);
          await hydrateGoogleUser(result.user, set, get, mergeGuest);
        } catch (error) {
          const message = authErrorMessage(error);
          set({ status: get().guest ? "guest" : "choice", error: message });
        }
      },
      saveGuestProgress: async () => {
        await get().signInWithGoogle(true);
      },
      updateGuest: (input) => {
        const guest = get().guest;
        if (!guest) return;
        set({
          guest: {
            ...guest,
            displayName: input.displayName ? cleanDisplayName(input.displayName) : guest.displayName,
            avatarId: input.avatarId?.slice(0, 24) ?? guest.avatarId,
            preferences: { ...guest.preferences, ...input.preferences }
          }
        });
      },
      recordGuestMatch: (result) => {
        const guest = get().guest;
        if (!guest) return;
        const currentStreak = result.won ? guest.stats.currentWinStreak + 1 : 0;
        set({
          guest: {
            ...guest,
            coins: guest.coins + (result.won ? 120 : 35),
            stats: {
              ...guest.stats,
              gamesPlayed: guest.stats.gamesPlayed + 1,
              wins: guest.stats.wins + (result.won ? 1 : 0),
              losses: guest.stats.losses + (result.won ? 0 : 1),
              bhabhiCount: guest.stats.bhabhiCount + (result.wasBhabhi ? 1 : 0),
              tricksWon: guest.stats.tricksWon + Math.max(0, result.tricksWon),
              currentWinStreak: currentStreak,
              bestWinStreak: Math.max(guest.stats.bestWinStreak, currentStreak),
              tournamentWins: guest.stats.tournamentWins + (result.tournamentWin ? 1 : 0)
            }
          }
        });
      },
      refreshRewards: async () => {
        const guest = get().guest;
        if (get().status === "guest" && guest) {
          set({
            dailyReward: getDailyRewardStatus(guest.dailyRewards ?? { streak: 0, totalClaims: 0 }),
            rewardLoading: false
          });
          return;
        }
        const token = get().idToken;
        if (!token || get().status !== "registered") return;
        set({ rewardLoading: true });
        try {
          const response = await loadDailyReward(token);
          if (!response.status) throw new Error(response.error ?? "Daily rewards could not be loaded.");
          set({
            dailyReward: response.status,
            profile: response.profile ?? get().profile,
            rewardLoading: false,
            error: undefined
          });
        } catch (error) {
          set({ rewardLoading: false, error: authErrorMessage(error) });
        }
      },
      claimReward: async () => {
        if (get().rewardLoading) return;
        const guest = get().guest;
        if (get().status === "guest" && guest) {
          const claim = calculateDailyReward(guest.dailyRewards ?? { streak: 0, totalClaims: 0 });
          set({
            guest: {
              ...guest,
              coins: guest.coins + claim.awardedCoins,
              dailyRewards: claim.record
            },
            dailyReward: claim.status,
            rewardNotice: claim.awardedCoins > 0 ? `+${claim.awardedCoins} Thulla Coins` : "Reward already claimed",
            rewardLoading: false
          });
          return;
        }
        const token = get().idToken;
        if (!token || get().status !== "registered") return;
        set({ rewardLoading: true, rewardNotice: undefined });
        try {
          const response = await claimDailyRewardRequest(token);
          if (!response.status) throw new Error(response.error ?? "Daily reward could not be claimed.");
          set({
            dailyReward: response.status,
            profile: response.profile ?? get().profile,
            rewardNotice: response.awardedCoins
              ? `+${response.awardedCoins} Thulla Coins`
              : "Reward already claimed",
            rewardLoading: false,
            error: undefined
          });
        } catch (error) {
          set({ rewardLoading: false, error: authErrorMessage(error) });
        }
      },
      updateRegistered: async (input) => {
        const token = get().idToken;
        if (!token) return false;
        try {
          const response = await updateMyProfile(token, input);
          if (!response.profile) throw new Error(response.error ?? "Profile update failed.");
          set({ profile: response.profile, error: undefined });
          return true;
        } catch (error) {
          set({ error: authErrorMessage(error) });
          return false;
        }
      },
      checkUsername: async (username) => {
        const token = get().idToken;
        if (!token) return { available: false, normalized: username, reason: "Sign in first." };
        return checkUsername(token, username);
      },
      logout: async () => {
        authFlowVersion += 1;
        const auth = await getFirebaseAuth();
        if (auth) await signOut(auth);
        set({ status: "choice", profile: undefined, idToken: undefined, guest: undefined, profileOpen: false, dailyReward: undefined });
      },
      changePlayer: async () => {
        authFlowVersion += 1;
        const auth = await getFirebaseAuth();
        if (auth?.currentUser) await signOut(auth);
        set({ status: "choice", profile: undefined, idToken: undefined, guest: undefined, profileOpen: false, dailyReward: undefined });
      },
      openProfile: () => set({ profileOpen: true }),
      closeProfile: () => set({ profileOpen: false }),
      openUpgrade: () => set({ upgradeOpen: true }),
      closeUpgrade: () => set({ upgradeOpen: false }),
      clearError: () => set({ error: undefined })
    }),
    {
      name: "bhabhi-thulla-player-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ guest: state.guest, profile: state.profile })
    }
  )
);

async function hydrateGoogleUser(
  user: User,
  set: (state: Partial<AuthStore>) => void,
  get: () => AuthStore,
  forceMerge = false
): Promise<void> {
  if (handlingUserId === user.uid && get().status === "registered") {
    set({ idToken: await user.getIdToken() });
    return;
  }
  if (handlingUserId === user.uid && get().status === "authenticating") return;
  const flowVersion = authFlowVersion;
  const cachedProfile = get().profile?.providerUserId === user.uid ? get().profile : undefined;
  handlingUserId = user.uid;
  if (!cachedProfile) set({ status: "authenticating", error: undefined });
  let token: string | undefined;
  try {
    token = await user.getIdToken();
    if (flowVersion !== authFlowVersion || get().status === "guest") return;
    if (cachedProfile) {
      set({ status: "registered", profile: cachedProfile, idToken: token, error: undefined });
    }
    const response = await exchangeGoogleToken(token);
    if (!response.profile) throw new Error(response.error ?? "Could not load your player profile.");
    let profile = response.profile;
    const shouldMerge = forceMerge || sessionStorage.getItem(pendingMergeKey) === "1";
    if (shouldMerge && get().guest) {
      const merged = await mergeGuestProgress(token, guestTransfer(get().guest!));
      if (merged.profile) profile = merged.profile;
      sessionStorage.removeItem(pendingMergeKey);
    }
    if (flowVersion !== authFlowVersion || get().status === "guest") return;
    set({ status: "registered", profile, idToken: token, guest: shouldMerge ? undefined : get().guest, upgradeOpen: false });
  } catch (error) {
    handlingUserId = undefined;
    if (flowVersion !== authFlowVersion || get().status === "guest") return;
    if (cachedProfile) {
      set({ status: "registered", profile: cachedProfile, idToken: token, error: undefined });
      return;
    }
    set({ status: get().guest ? "guest" : "error", error: authErrorMessage(error) });
  }
}

function guestTransfer(guest: LocalGuestProfile): GuestProgressTransfer {
  return {
    guestId: guest.id,
    displayName: guest.displayName,
    avatarId: guest.avatarId,
    coins: guest.coins,
    stats: guest.stats,
    achievementProgress: Object.fromEntries(guest.achievements.map((item) => [item.id, item.progress])),
    preferences: guest.preferences
  };
}

function emptyStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    bhabhiCount: 0,
    tricksWon: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    tournamentWins: 0
  };
}

function defaultPreferences(): PlayerPreferences {
  return {
    tableTheme: "casino",
    cardBack: "classic",
    soundEnabled: true,
    musicEnabled: true,
    vibrationEnabled: true,
    reducedMotion: false,
    highContrast: false,
    language: "en",
    activityVisibility: "friends",
    friendOnlineNotifications: false,
    shareAvatarInResults: true,
    shareUsernameInResults: true
  };
}

function cleanDisplayName(value: string): string {
  return value.replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function authErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "Google sign-in was cancelled.";
  if (code.includes("popup-blocked")) return "Your browser blocked the Google sign-in window. Allow popups and try again.";
  if (code.includes("network-request-failed")) return "Google sign-in could not reach the network.";
  return error instanceof Error ? error.message : "Google sign-in could not be completed.";
}

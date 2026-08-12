export type AccountType = "guest" | "registered" | "bot";
export type ProfileImageType = "custom" | "avatar" | "google" | "initials";
export type ProfileImageVisibility = "everyone" | "friends" | "nobody";

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  bhabhiCount: number;
  tricksWon: number;
  currentWinStreak: number;
  bestWinStreak: number;
  tournamentWins: number;
}

export interface PlayerPreferences {
  tableTheme: string;
  cardBack: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  language: string;
  activityVisibility: "everyone" | "friends" | "nobody";
  friendOnlineNotifications: boolean;
  shareAvatarInResults: boolean;
  shareUsernameInResults: boolean;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: number;
  metric: "gamesPlayed" | "wins" | "tricksWon" | "tournamentWins" | "bestWinStreak";
}

export interface PlayerAchievement extends AchievementDefinition {
  progress: number;
  unlockedAt?: number;
}

export interface MatchHistoryEntry {
  id: string;
  roomId: string;
  gameMode: string;
  playerCount: number;
  result: "win" | "loss" | "completed";
  finalPosition: number;
  tricksWon: number;
  startedAt: number;
  completedAt: number;
}

export interface PlayerProfile {
  id: string;
  accountType: "registered";
  authProvider: "google";
  providerUserId: string;
  displayName: string;
  username: string;
  email: string;
  /** Resolved active image URL. Built-in avatars and initials do not use a URL. */
  photoUrl?: string;
  googlePhotoUrl?: string;
  customPhotoUrl?: string;
  selectedAvatarId?: string;
  activeImageType: ProfileImageType;
  profileImageVisibility: ProfileImageVisibility;
  avatarId: string;
  profileFrameId: string;
  country?: string;
  bio?: string;
  level: number;
  xp: number;
  rank: string;
  coins: number;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  online: boolean;
  selectedBadgeId?: string;
  teamName?: string;
  stats: PlayerStats;
  preferences: PlayerPreferences;
  achievements: PlayerAchievement[];
  recentMatches: MatchHistoryEntry[];
}

export interface GuestProgressTransfer {
  guestId: string;
  displayName: string;
  avatarId: string;
  coins: number;
  stats: Partial<PlayerStats>;
  achievementProgress: Record<string, number>;
  preferences: Partial<PlayerPreferences>;
}

export interface PublicPlayerIdentity {
  profileId?: string;
  accountType: AccountType;
  rankBadge?: string;
  avatarUrl?: string;
  selectedAvatarId?: string;
  profileFrameId?: string;
  level?: number;
}

export interface PublicPlayerProfile {
  playerId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  selectedAvatarId?: string;
  profileFrameId: string;
  rank: string;
  level: number;
}

export interface AuthProfileResponse {
  ok: boolean;
  profile?: PlayerProfile;
  error?: string;
}

export interface UsernameAvailabilityResponse {
  available: boolean;
  normalized: string;
  reason?: string;
}

export interface UpdatePlayerProfileInput {
  displayName?: string;
  username?: string;
  avatarId?: string;
  selectedAvatarId?: string;
  activeImageType?: ProfileImageType;
  profileImageVisibility?: ProfileImageVisibility;
  profileFrameId?: string;
  country?: string;
  bio?: string;
  selectedBadgeId?: string;
  preferences?: Partial<PlayerPreferences>;
}

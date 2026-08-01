import type {
  AchievementDefinition,
  GameEvent,
  GameState,
  GuestProgressTransfer,
  MatchHistoryEntry,
  PlayerAchievement,
  PlayerPreferences,
  PlayerProfile,
  PlayerStats,
  RoundSummary,
  UpdatePlayerProfileInput
} from "@getaway-cards/shared";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

interface HistoryRow {
  room_code: string;
  at: number;
  round: number;
  winner_name: string;
  points_awarded: number;
  summary_json: string;
}

interface UserRow {
  id: string;
  auth_provider: "google";
  provider_user_id: string;
  email: string;
  display_name: string;
  username: string;
  photo_url: string | null;
  avatar_id: string;
  profile_frame_id: string;
  country: string | null;
  bio: string | null;
  level: number;
  xp: number;
  rank: string;
  coins: number;
  selected_badge_id: string | null;
  team_name: string | null;
  created_at: number;
  updated_at: number;
  last_active_at: number;
}

interface GoogleUserInput {
  providerUserId: string;
  email: string;
  displayName: string;
  photoUrl?: string;
}

export interface PersistedRoundHistory {
  roomCode: string;
  at: number;
  round: number;
  winnerName: string;
  pointsAwarded: number;
  summary: RoundSummary;
}

export class GameDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  recordSnapshot(state: GameState): void {
    this.db
      .prepare(
        `INSERT INTO rooms (room_code, status, updated_at, state_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(room_code) DO UPDATE SET
           status = excluded.status,
           updated_at = excluded.updated_at,
           state_json = excluded.state_json`
      )
      .run(state.roomCode, state.status, state.updatedAt, JSON.stringify(state));

    for (const event of state.history.slice(0, 4)) {
      this.recordEvent(state.roomCode, event);
    }

    for (const summary of state.roundSummaries.slice(0, 3)) {
      this.recordRoundSummary(state.roomCode, summary);
    }

    if (state.status === "game_over") {
      this.recordCompletedMatch(state);
    }
  }

  getOrCreateGoogleProfile(input: GoogleUserInput): PlayerProfile {
    const now = Date.now();
    const existing = this.db
      .prepare("SELECT id FROM users WHERE auth_provider = 'google' AND provider_user_id = ?")
      .get(input.providerUserId) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(
        `UPDATE users SET email = ?, photo_url = COALESCE(?, photo_url),
           last_active_at = ?, updated_at = ? WHERE id = ?`
      ).run(input.email.toLowerCase(), input.photoUrl ?? null, now, now, existing.id);
      return this.getPlayerProfile(existing.id)!;
    }

    const id = randomUUID();
    const displayName = cleanDisplayName(input.displayName);
    const username = this.uniqueUsername(displayName);
    this.db.prepare(
      `INSERT INTO users (
        id, auth_provider, provider_user_id, email, display_name, username,
        photo_url, avatar_id, profile_frame_id, level, xp, rank, coins,
        created_at, updated_at, last_active_at
      ) VALUES (?, 'google', ?, ?, ?, ?, ?, 'Aero', 'classic', 1, 0, 'Rookie', 250, ?, ?, ?)`
    ).run(
      id,
      input.providerUserId,
      input.email.toLowerCase(),
      displayName,
      username,
      input.photoUrl ?? null,
      now,
      now,
      now
    );
    this.db.prepare("INSERT INTO player_stats (user_id) VALUES (?)").run(id);
    this.db.prepare("INSERT INTO player_preferences (user_id) VALUES (?)").run(id);
    return this.getPlayerProfile(id)!;
  }

  getPlayerProfile(userId: string): PlayerProfile | undefined {
    const user = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!user) return undefined;

    const stats = this.db.prepare("SELECT * FROM player_stats WHERE user_id = ?").get(userId) as Record<string, unknown>;
    const preferences = this.db.prepare("SELECT * FROM player_preferences WHERE user_id = ?").get(userId) as Record<string, unknown>;
    return {
      id: user.id,
      accountType: "registered",
      authProvider: user.auth_provider,
      providerUserId: user.provider_user_id,
      displayName: user.display_name,
      username: user.username,
      email: user.email,
      photoUrl: user.photo_url ?? undefined,
      avatarId: user.avatar_id,
      profileFrameId: user.profile_frame_id,
      country: user.country ?? undefined,
      bio: user.bio ?? undefined,
      level: user.level,
      xp: user.xp,
      rank: user.rank,
      coins: user.coins,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastActiveAt: user.last_active_at,
      online: true,
      selectedBadgeId: user.selected_badge_id ?? undefined,
      teamName: user.team_name ?? undefined,
      stats: statsFromRow(stats),
      preferences: preferencesFromRow(preferences),
      achievements: this.getAchievements(userId),
      recentMatches: this.getMatchHistory(userId, 12)
    };
  }

  findProfileByProviderUserId(providerUserId: string): PlayerProfile | undefined {
    const row = this.db.prepare(
      "SELECT id FROM users WHERE auth_provider = 'google' AND provider_user_id = ?"
    ).get(providerUserId) as { id: string } | undefined;
    return row ? this.getPlayerProfile(row.id) : undefined;
  }

  isUsernameAvailable(username: string, currentUserId?: string): boolean {
    const row = this.db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username) as { id: string } | undefined;
    return !row || row.id === currentUserId;
  }

  updatePlayerProfile(userId: string, input: UpdatePlayerProfileInput): PlayerProfile | undefined {
    const current = this.getPlayerProfile(userId);
    if (!current) return undefined;
    const now = Date.now();
    const selectedBadgeId = input.selectedBadgeId && current.achievements.some(
      (achievement) => achievement.id === input.selectedBadgeId && achievement.unlockedAt
    )
      ? input.selectedBadgeId
      : current.selectedBadgeId;
    this.db.prepare(
      `UPDATE users SET display_name = ?, username = ?, avatar_id = ?, profile_frame_id = ?,
       country = ?, bio = ?, selected_badge_id = ?, updated_at = ?, last_active_at = ? WHERE id = ?`
    ).run(
      input.displayName ?? current.displayName,
      input.username ?? current.username,
      input.avatarId ?? current.avatarId,
      input.profileFrameId ?? current.profileFrameId,
      input.country ?? current.country ?? null,
      input.bio ?? current.bio ?? null,
      selectedBadgeId ?? null,
      now,
      now,
      userId
    );

    if (input.preferences) {
      const next = { ...current.preferences, ...input.preferences };
      this.writePreferences(userId, next);
    }
    return this.getPlayerProfile(userId);
  }

  mergeGuestProgress(userId: string, guest: GuestProgressTransfer): PlayerProfile | undefined {
    const alreadyMerged = this.db.prepare("SELECT 1 FROM guest_merges WHERE guest_id = ?").get(guest.guestId);
    if (alreadyMerged) return this.getPlayerProfile(userId);
    const profile = this.getPlayerProfile(userId);
    if (!profile) return undefined;

    const stats = profile.stats;
    const incoming = guest.stats;
    const merged: PlayerStats = {
      gamesPlayed: stats.gamesPlayed + safeCount(incoming.gamesPlayed),
      wins: stats.wins + safeCount(incoming.wins),
      losses: stats.losses + safeCount(incoming.losses),
      bhabhiCount: stats.bhabhiCount + safeCount(incoming.bhabhiCount),
      tricksWon: stats.tricksWon + safeCount(incoming.tricksWon),
      currentWinStreak: Math.max(stats.currentWinStreak, safeCount(incoming.currentWinStreak)),
      bestWinStreak: Math.max(stats.bestWinStreak, safeCount(incoming.bestWinStreak)),
      tournamentWins: stats.tournamentWins + safeCount(incoming.tournamentWins)
    };

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.writeStats(userId, merged);
      this.db.prepare(
        "UPDATE users SET display_name = ?, avatar_id = ?, coins = coins + ?, updated_at = ? WHERE id = ?"
      ).run(
        cleanDisplayName(guest.displayName),
        cleanAvatarId(guest.avatarId),
        safeCount(guest.coins),
        Date.now(),
        userId
      );
      this.writePreferences(userId, { ...profile.preferences, ...guest.preferences });
      for (const [achievementId, progress] of Object.entries(guest.achievementProgress ?? {})) {
        const definition = this.db.prepare("SELECT requirement FROM achievements WHERE id = ?")
          .get(achievementId) as { requirement: number } | undefined;
        if (!definition) continue;
        this.db.prepare(
          `INSERT INTO user_achievements (user_id, achievement_id, progress)
           SELECT ?, id, ? FROM achievements WHERE id = ?
           ON CONFLICT(user_id, achievement_id) DO UPDATE SET
             progress = MAX(progress, excluded.progress)`
        ).run(userId, Math.min(definition.requirement, safeCount(progress)), achievementId);
      }
      this.db.prepare("INSERT INTO guest_merges (guest_id, user_id, merged_at) VALUES (?, ?, ?)")
        .run(guest.guestId, userId, Date.now());
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    return this.getPlayerProfile(userId);
  }

  deleteRoomSnapshot(roomCode: string): void {
    this.db.prepare("DELETE FROM rooms WHERE room_code = ?").run(roomCode);
  }

  listRecentHistory(limit = 20): PersistedRoundHistory[] {
    const rows = this.db
      .prepare(
        `SELECT room_code, at, round, winner_name, points_awarded, summary_json
         FROM round_summaries
         ORDER BY at DESC
         LIMIT ?`
      )
      .all(limit) as unknown as HistoryRow[];

    return rows.map((row) => ({
      roomCode: row.room_code,
      at: row.at,
      round: row.round,
      winnerName: row.winner_name,
      pointsAwarded: row.points_awarded,
      summary: JSON.parse(row.summary_json) as RoundSummary
    }));
  }

  seedDemoHistory(): void {
    const existing = this.db
      .prepare("SELECT COUNT(*) AS count FROM round_summaries")
      .get() as { count: number };

    if (existing.count > 0) {
      return;
    }

    const now = Date.now();
    const summaries: RoundSummary[] = [
      {
        id: "seed_round_1",
        round: 1,
        at: now - 1000 * 60 * 45,
        winnerId: "seed_mara",
        winnerName: "Mara",
        pointsAwarded: 1,
        scoreLines: [
          { playerId: "seed_mara", username: "Mara", cardsLeft: 0, pointsLeft: 0, escaped: true, isBhabhi: false },
          { playerId: "seed_knox", username: "Knox", cardsLeft: 0, pointsLeft: 0, escaped: true, isBhabhi: false },
          { playerId: "seed_you", username: "Guest", cardsLeft: 6, pointsLeft: 6, escaped: false, isBhabhi: true }
        ]
      },
      {
        id: "seed_round_2",
        round: 2,
        at: now - 1000 * 60 * 18,
        winnerId: "seed_you",
        winnerName: "Guest",
        pointsAwarded: 1,
        scoreLines: [
          { playerId: "seed_mara", username: "Mara", cardsLeft: 5, pointsLeft: 5, escaped: false, isBhabhi: true },
          { playerId: "seed_knox", username: "Knox", cardsLeft: 0, pointsLeft: 0, escaped: true, isBhabhi: false },
          { playerId: "seed_you", username: "Guest", cardsLeft: 0, pointsLeft: 0, escaped: true, isBhabhi: false }
        ]
      }
    ];

    for (const summary of summaries) {
      this.recordRoundSummary("DEMO1", summary);
    }
  }

  close(): void {
    this.db.close();
  }

  private recordEvent(roomCode: string, event: GameEvent): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO events (id, room_code, at, type, player_id, message)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(event.id, roomCode, event.at, event.type, event.playerId ?? null, event.message);
  }

  private recordRoundSummary(roomCode: string, summary: RoundSummary): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO round_summaries
           (id, room_code, at, round, winner_id, winner_name, points_awarded, summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        summary.id,
        roomCode,
        summary.at,
        summary.round,
        summary.winnerId,
        summary.winnerName,
        summary.pointsAwarded,
        JSON.stringify(summary)
      );
  }

  private recordCompletedMatch(state: GameState): void {
    const completedAt = state.updatedAt;
    const startedAt = [...state.history].reverse().find((event: GameEvent) => event.type === "start")?.at ?? completedAt;
    const positions = [...state.escapeOrder];
    if (state.bhabhiId && !positions.includes(state.bhabhiId)) positions.push(state.bhabhiId);

    for (const player of state.players) {
      if (player.accountType !== "registered" || !player.profileId) continue;
      const won = player.id === state.championId || (!state.championId && player.id !== state.bhabhiId);
      const tricksWon = state.history.filter(
        (event) => event.playerId === player.id && event.type === "play" && event.message.toLowerCase().includes("cleared")
      ).length;
      const result = this.db.prepare(
        `INSERT OR IGNORE INTO match_history
         (id, room_id, user_id, game_mode, player_count, result, final_position,
          tricks_won, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `${state.roomCode}:${player.profileId}`,
        state.roomCode,
        player.profileId,
        state.roomMode ?? state.settings.funMode,
        state.players.length,
        won ? "win" : "loss",
        Math.max(1, positions.indexOf(player.id) + 1),
        tricksWon,
        startedAt,
        completedAt
      );
      if (Number(result.changes) === 0) continue;

      const profile = this.getPlayerProfile(player.profileId);
      if (!profile) continue;
      const stats: PlayerStats = {
        ...profile.stats,
        gamesPlayed: profile.stats.gamesPlayed + 1,
        wins: profile.stats.wins + (won ? 1 : 0),
        losses: profile.stats.losses + (won ? 0 : 1),
        bhabhiCount: profile.stats.bhabhiCount + (player.id === state.bhabhiId ? 1 : 0),
        tricksWon: profile.stats.tricksWon + tricksWon,
        currentWinStreak: won ? profile.stats.currentWinStreak + 1 : 0,
        bestWinStreak: won
          ? Math.max(profile.stats.bestWinStreak, profile.stats.currentWinStreak + 1)
          : profile.stats.bestWinStreak,
        tournamentWins: profile.stats.tournamentWins + (won && state.tournament?.status === "won" ? 1 : 0)
      };
      this.writeStats(player.profileId, stats);
      const earnedXp = (won ? 100 : 35) + tricksWon * 10;
      const nextXp = profile.xp + earnedXp;
      this.db.prepare("UPDATE users SET xp = ?, level = ?, rank = ?, coins = coins + ?, updated_at = ? WHERE id = ?")
        .run(nextXp, levelFromXp(nextXp), rankFromXp(nextXp), won ? 120 : 35, completedAt, player.profileId);
      this.syncAchievements(player.profileId, stats, completedAt);
    }
  }

  private getAchievements(userId: string): PlayerAchievement[] {
    const rows = this.db.prepare(
      `SELECT a.id, a.name, a.description, a.icon, a.requirement, a.metric,
              COALESCE(ua.progress, 0) AS progress, ua.unlocked_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
       ORDER BY a.requirement ASC`
    ).all(userId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      icon: String(row.icon),
      requirement: Number(row.requirement),
      metric: row.metric as AchievementDefinition["metric"],
      progress: Number(row.progress),
      unlockedAt: row.unlocked_at == null ? undefined : Number(row.unlocked_at)
    }));
  }

  private getMatchHistory(userId: string, limit: number): MatchHistoryEntry[] {
    const rows = this.db.prepare(
      `SELECT id, room_id, game_mode, player_count, result, final_position,
              tricks_won, started_at, completed_at
       FROM match_history WHERE user_id = ? ORDER BY completed_at DESC LIMIT ?`
    ).all(userId, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      gameMode: String(row.game_mode),
      playerCount: Number(row.player_count),
      result: row.result as MatchHistoryEntry["result"],
      finalPosition: Number(row.final_position),
      tricksWon: Number(row.tricks_won),
      startedAt: Number(row.started_at),
      completedAt: Number(row.completed_at)
    }));
  }

  private writeStats(userId: string, stats: PlayerStats): void {
    this.db.prepare(
      `UPDATE player_stats SET games_played = ?, wins = ?, losses = ?, bhabhi_count = ?,
       tricks_won = ?, current_win_streak = ?, best_win_streak = ?, tournament_wins = ?
       WHERE user_id = ?`
    ).run(
      stats.gamesPlayed,
      stats.wins,
      stats.losses,
      stats.bhabhiCount,
      stats.tricksWon,
      stats.currentWinStreak,
      stats.bestWinStreak,
      stats.tournamentWins,
      userId
    );
  }

  private writePreferences(userId: string, preferences: PlayerPreferences): void {
    this.db.prepare(
      `UPDATE player_preferences SET table_theme = ?, card_back = ?, sound_enabled = ?,
       music_enabled = ?, vibration_enabled = ?, reduced_motion = ?, high_contrast = ?,
       language = ? WHERE user_id = ?`
    ).run(
      preferences.tableTheme,
      preferences.cardBack,
      boolInt(preferences.soundEnabled),
      boolInt(preferences.musicEnabled),
      boolInt(preferences.vibrationEnabled),
      boolInt(preferences.reducedMotion),
      boolInt(preferences.highContrast),
      preferences.language,
      userId
    );
  }

  private syncAchievements(userId: string, stats: PlayerStats, now: number): void {
    const achievements = this.db.prepare("SELECT id, requirement, metric FROM achievements").all() as Array<Record<string, unknown>>;
    for (const achievement of achievements) {
      const metric = achievement.metric as AchievementDefinition["metric"];
      const progress = stats[metric];
      const unlockedAt = progress >= Number(achievement.requirement) ? now : null;
      this.db.prepare(
        `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, achievement_id) DO UPDATE SET
           progress = MAX(progress, excluded.progress),
           unlocked_at = COALESCE(user_achievements.unlocked_at, excluded.unlocked_at)`
      ).run(userId, String(achievement.id), progress, unlockedAt);
    }
  }

  private uniqueUsername(displayName: string): string {
    const root = usernameRoot(displayName);
    let candidate = root;
    let suffix = 1;
    while (!this.isUsernameAvailable(candidate)) {
      suffix += 1;
      candidate = `${root.slice(0, Math.max(3, 16 - String(suffix).length))}${suffix}`;
    }
    return candidate;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_code TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        state_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        at INTEGER NOT NULL,
        type TEXT NOT NULL,
        player_id TEXT,
        message TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS round_summaries (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        at INTEGER NOT NULL,
        round INTEGER NOT NULL,
        winner_id TEXT NOT NULL,
        winner_name TEXT NOT NULL,
        points_awarded INTEGER NOT NULL,
        summary_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_round_summaries_at
        ON round_summaries (at DESC);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        auth_provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        photo_url TEXT,
        avatar_id TEXT NOT NULL DEFAULT 'Aero',
        profile_frame_id TEXT NOT NULL DEFAULT 'classic',
        country TEXT,
        bio TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        rank TEXT NOT NULL DEFAULT 'Rookie',
        coins INTEGER NOT NULL DEFAULT 250,
        selected_badge_id TEXT,
        team_name TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        UNIQUE(auth_provider, provider_user_id)
      );

      CREATE TABLE IF NOT EXISTS player_stats (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        bhabhi_count INTEGER NOT NULL DEFAULT 0,
        tricks_won INTEGER NOT NULL DEFAULT 0,
        current_win_streak INTEGER NOT NULL DEFAULT 0,
        best_win_streak INTEGER NOT NULL DEFAULT 0,
        tournament_wins INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS player_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        table_theme TEXT NOT NULL DEFAULT 'casino',
        card_back TEXT NOT NULL DEFAULT 'classic',
        sound_enabled INTEGER NOT NULL DEFAULT 1,
        music_enabled INTEGER NOT NULL DEFAULT 1,
        vibration_enabled INTEGER NOT NULL DEFAULT 1,
        reduced_motion INTEGER NOT NULL DEFAULT 0,
        high_contrast INTEGER NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'en'
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL,
        requirement INTEGER NOT NULL,
        metric TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
        progress INTEGER NOT NULL DEFAULT 0,
        unlocked_at INTEGER,
        PRIMARY KEY (user_id, achievement_id)
      );

      CREATE TABLE IF NOT EXISTS match_history (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_mode TEXT NOT NULL,
        player_count INTEGER NOT NULL,
        result TEXT NOT NULL,
        final_position INTEGER NOT NULL,
        tricks_won INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        UNIQUE(room_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS guest_merges (
        guest_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        merged_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_match_history_user_completed
        ON match_history (user_id, completed_at DESC);

      INSERT OR IGNORE INTO achievements (id, name, description, icon, requirement, metric) VALUES
        ('first_table', 'First Table', 'Complete your first match.', 'cards', 1, 'gamesPlayed'),
        ('clean_escape', 'Clean Escape', 'Win five matches.', 'shield', 5, 'wins'),
        ('trick_master', 'Trick Master', 'Clear twenty-five tricks.', 'sparkles', 25, 'tricksWon'),
        ('hot_streak', 'On Fire', 'Build a three-game win streak.', 'flame', 3, 'bestWinStreak'),
        ('cup_champion', 'Cup Champion', 'Win a tournament.', 'trophy', 1, 'tournamentWins'),
        ('table_veteran', 'Table Veteran', 'Complete fifty matches.', 'crown', 50, 'gamesPlayed');
    `);
  }
}

function cleanDisplayName(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 24) || "Player";
}

function cleanAvatarId(value: string): string {
  return value.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 24) || "Aero";
}

function usernameRoot(value: string): string {
  const root = value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
  return root.length >= 3 ? root : `player${Math.floor(Math.random() * 900 + 100)}`;
}

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.min(1_000_000, Math.floor(count))) : 0;
}

function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

function statsFromRow(row: Record<string, unknown>): PlayerStats {
  return {
    gamesPlayed: Number(row.games_played ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    bhabhiCount: Number(row.bhabhi_count ?? 0),
    tricksWon: Number(row.tricks_won ?? 0),
    currentWinStreak: Number(row.current_win_streak ?? 0),
    bestWinStreak: Number(row.best_win_streak ?? 0),
    tournamentWins: Number(row.tournament_wins ?? 0)
  };
}

function preferencesFromRow(row: Record<string, unknown>): PlayerPreferences {
  return {
    tableTheme: String(row.table_theme ?? "casino"),
    cardBack: String(row.card_back ?? "classic"),
    soundEnabled: Boolean(row.sound_enabled),
    musicEnabled: Boolean(row.music_enabled),
    vibrationEnabled: Boolean(row.vibration_enabled),
    reducedMotion: Boolean(row.reduced_motion),
    highContrast: Boolean(row.high_contrast),
    language: String(row.language ?? "en")
  };
}

function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 140)) + 1);
}

function rankFromXp(xp: number): string {
  if (xp >= 12_000) return "Grandmaster";
  if (xp >= 6_000) return "Diamond";
  if (xp >= 3_000) return "Gold";
  if (xp >= 1_200) return "Silver";
  if (xp >= 400) return "Bronze";
  return "Rookie";
}

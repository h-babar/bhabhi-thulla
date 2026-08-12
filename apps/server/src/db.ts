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
  UpdatePlayerProfileInput,
  FriendRelationship,
  GameInviteStatus
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
  google_photo_url: string | null;
  custom_photo_url: string | null;
  custom_photo_key: string | null;
  active_image_type: PlayerProfile["activeImageType"];
  profile_image_visibility: PlayerProfile["profileImageVisibility"];
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

export interface SocialProfileRecord {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  avatarId: string;
  profileFrameId: string;
  profileImageVisibility: PlayerProfile["profileImageVisibility"];
  level: number;
  rank: string;
  lastActiveAt: number;
}

export interface FriendshipRecord {
  id: string;
  requesterUserId: string;
  addresseeUserId: string;
  status: "pending" | "accepted";
  createdAt: number;
  updatedAt: number;
}

export interface GameInviteRecord {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  roomCode: string;
  status: GameInviteStatus;
  createdAt: number;
  expiresAt: number;
}

export interface RecentPlayerRecord {
  id: string;
  profileId?: string;
  displayName: string;
  username?: string;
  avatarId: string;
  playedAt: number;
  result: "win" | "loss" | "completed";
  gameMode: string;
}

export const FRIEND_LIMITS = Object.freeze({
  maxFriends: 250,
  maxPendingOutgoing: 50,
  repeatRequestCooldownMs: 60_000,
  inviteCooldownMs: 10_000,
  inviteTtlMs: 120_000
});

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
        `UPDATE users SET email = ?, google_photo_url = COALESCE(?, google_photo_url),
           photo_url = COALESCE(?, photo_url),
           last_active_at = ?, updated_at = ? WHERE id = ?`
      ).run(input.email.toLowerCase(), input.photoUrl ?? null, input.photoUrl ?? null, now, now, existing.id);
      return this.getPlayerProfile(existing.id)!;
    }

    const id = randomUUID();
    const displayName = cleanDisplayName(input.displayName);
    const username = this.uniqueUsername(displayName);
    this.db.prepare(
      `INSERT INTO users (
        id, auth_provider, provider_user_id, email, display_name, username,
        photo_url, google_photo_url, avatar_id, profile_frame_id, active_image_type,
        profile_image_visibility, level, xp, rank, coins,
        created_at, updated_at, last_active_at
      ) VALUES (?, 'google', ?, ?, ?, ?, ?, ?, 'avatar_01', 'default', ?,
        'everyone', 1, 0, 'Rookie', 250, ?, ?, ?)`
    ).run(
      id,
      input.providerUserId,
      input.email.toLowerCase(),
      displayName,
      username,
      input.photoUrl ?? null,
      input.photoUrl ?? null,
      input.photoUrl ? "google" : "avatar",
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
      photoUrl: resolveActiveImageUrl(user),
      googlePhotoUrl: user.google_photo_url ?? undefined,
      customPhotoUrl: user.custom_photo_url ?? undefined,
      selectedAvatarId: user.avatar_id,
      activeImageType: resolveActiveImageType(user),
      profileImageVisibility: normalizeImageVisibility(user.profile_image_visibility),
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
       active_image_type = ?, profile_image_visibility = ?, country = ?, bio = ?,
       selected_badge_id = ?, updated_at = ?, last_active_at = ? WHERE id = ?`
    ).run(
      input.displayName ?? current.displayName,
      input.username ?? current.username,
      input.selectedAvatarId ?? input.avatarId ?? current.avatarId,
      input.profileFrameId ?? current.profileFrameId,
      input.activeImageType ?? current.activeImageType,
      input.profileImageVisibility ?? current.profileImageVisibility,
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

  setCustomProfilePhoto(userId: string, photoUrl: string, storageKey: string): PlayerProfile | undefined {
    const now = Date.now();
    this.db.prepare(
      `UPDATE users SET custom_photo_url = ?, custom_photo_key = ?, active_image_type = 'custom',
       updated_at = ?, last_active_at = ? WHERE id = ?`
    ).run(photoUrl.slice(0, 2048), storageKey.slice(0, 512), now, now, userId);
    return this.getPlayerProfile(userId);
  }

  getCustomProfilePhotoKey(userId: string): string | undefined {
    const row = this.db.prepare("SELECT custom_photo_key FROM users WHERE id = ?")
      .get(userId) as { custom_photo_key: string | null } | undefined;
    return row?.custom_photo_key ?? undefined;
  }

  clearCustomProfilePhoto(userId: string): PlayerProfile | undefined {
    const current = this.getPlayerProfile(userId);
    if (!current) return undefined;
    const fallback = current.selectedAvatarId
      ? "avatar"
      : current.googlePhotoUrl
        ? "google"
        : "initials";
    const now = Date.now();
    this.db.prepare(
      `UPDATE users SET custom_photo_url = NULL, custom_photo_key = NULL,
       active_image_type = CASE WHEN active_image_type = 'custom' THEN ? ELSE active_image_type END,
       updated_at = ?, last_active_at = ? WHERE id = ?`
    ).run(fallback, now, now, userId);
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

  getSocialProfile(userId: string): SocialProfileRecord | undefined {
    const row = this.db.prepare(
      `SELECT id, display_name, username, photo_url, google_photo_url, custom_photo_url,
              active_image_type, profile_image_visibility, avatar_id, profile_frame_id,
              level, rank, last_active_at FROM users WHERE id = ?`
    ).get(userId) as Record<string, unknown> | undefined;
    return row ? socialProfileFromRow(row) : undefined;
  }

  searchSocialProfiles(currentUserId: string, query: string, limit = 20): SocialProfileRecord[] {
    const normalized = query.trim().replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 32);
    if (normalized.length < 2) return [];
    const pattern = `%${normalized}%`;
    const rows = this.db.prepare(
      `SELECT id, display_name, username, photo_url, google_photo_url, custom_photo_url,
              active_image_type, profile_image_visibility, avatar_id, profile_frame_id,
              level, rank, last_active_at
       FROM users
       WHERE id != ?
         AND (username LIKE ? COLLATE NOCASE OR id = ? OR display_name LIKE ? COLLATE NOCASE)
         AND NOT EXISTS (
           SELECT 1 FROM player_blocks b
           WHERE (b.blocker_user_id = ? AND b.blocked_user_id = users.id)
              OR (b.blocker_user_id = users.id AND b.blocked_user_id = ?)
         )
       ORDER BY CASE WHEN username = ? COLLATE NOCASE THEN 0 ELSE 1 END, username ASC
       LIMIT ?`
    ).all(currentUserId, pattern, normalized, pattern, currentUserId, currentUserId, normalized, Math.min(25, limit)) as Array<Record<string, unknown>>;
    return rows.map(socialProfileFromRow);
  }

  getRelationship(currentUserId: string, targetUserId: string): FriendRelationship {
    const block = this.db.prepare(
      `SELECT blocker_user_id FROM player_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?)`
    ).get(currentUserId, targetUserId, targetUserId, currentUserId) as { blocker_user_id: string } | undefined;
    if (block) return "blocked";
    const friendship = this.friendshipForPair(currentUserId, targetUserId);
    if (!friendship) return "none";
    if (friendship.status === "accepted") return "friends";
    return friendship.requesterUserId === currentUserId ? "request_sent" : "request_received";
  }

  listFriendIds(userId: string): string[] {
    const rows = this.db.prepare(
      `SELECT CASE WHEN requester_user_id = ? THEN addressee_user_id ELSE requester_user_id END AS friend_id
       FROM friendships
       WHERE status = 'accepted' AND (requester_user_id = ? OR addressee_user_id = ?)`
    ).all(userId, userId, userId) as Array<{ friend_id: string }>;
    return rows.map((row) => row.friend_id);
  }

  listFriendProfiles(userId: string): SocialProfileRecord[] {
    return this.listFriendIds(userId)
      .map((friendId) => this.getSocialProfile(friendId))
      .filter((profile): profile is SocialProfileRecord => Boolean(profile));
  }

  listFriendRequests(userId: string): FriendshipRecord[] {
    const rows = this.db.prepare(
      `SELECT id, requester_user_id, addressee_user_id, status, created_at, updated_at
       FROM friendships
       WHERE status = 'pending' AND (requester_user_id = ? OR addressee_user_id = ?)
       ORDER BY created_at DESC`
    ).all(userId, userId) as Array<Record<string, unknown>>;
    return rows.map(friendshipFromRow);
  }

  sendFriendRequest(requesterUserId: string, addresseeUserId: string, now = Date.now()): FriendshipRecord {
    if (requesterUserId === addresseeUserId) throw new Error("You cannot add yourself.");
    if (!this.getSocialProfile(addresseeUserId)) throw new Error("That player no longer exists.");
    if (this.isBlockedEitherWay(requesterUserId, addresseeUserId)) throw new Error("This player is unavailable.");
    if (this.listFriendIds(requesterUserId).length >= FRIEND_LIMITS.maxFriends) throw new Error("Your friends list is full.");
    const pendingCount = this.db.prepare(
      "SELECT COUNT(*) AS count FROM friendships WHERE requester_user_id = ? AND status = 'pending'"
    ).get(requesterUserId) as { count: number };
    if (pendingCount.count >= FRIEND_LIMITS.maxPendingOutgoing) throw new Error("You have reached the pending request limit.");
    const existing = this.friendshipForPair(requesterUserId, addresseeUserId);
    if (existing?.status === "accepted") throw new Error("You are already friends.");
    if (existing?.status === "pending") {
      throw new Error(existing.requesterUserId === requesterUserId ? "Friend request already sent." : "This player already sent you a request.");
    }
    const pairKey = friendshipPairKey(requesterUserId, addresseeUserId);
    const cooldown = this.db.prepare(
      "SELECT last_requested_at FROM friend_request_cooldowns WHERE pair_key = ?"
    ).get(pairKey) as { last_requested_at: number } | undefined;
    if (cooldown && now - cooldown.last_requested_at < FRIEND_LIMITS.repeatRequestCooldownMs) {
      throw new Error("Wait a minute before sending this player another request.");
    }
    const id = randomUUID();
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.prepare(
        `INSERT INTO friendships (id, pair_key, requester_user_id, addressee_user_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`
      ).run(id, pairKey, requesterUserId, addresseeUserId, now, now);
      this.db.prepare(
        `INSERT INTO friend_request_cooldowns (pair_key, last_requested_at) VALUES (?, ?)
         ON CONFLICT(pair_key) DO UPDATE SET last_requested_at = excluded.last_requested_at`
      ).run(pairKey, now);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    return this.friendshipById(id)!;
  }

  acceptFriendRequest(userId: string, requestId: string, now = Date.now()): FriendshipRecord {
    const request = this.friendshipById(requestId);
    if (!request || request.status !== "pending" || request.addresseeUserId !== userId) {
      throw new Error("That friend request is no longer available.");
    }
    if (this.isBlockedEitherWay(request.requesterUserId, request.addresseeUserId)) {
      throw new Error("That friend request can no longer be accepted.");
    }
    if (this.listFriendIds(request.requesterUserId).length >= FRIEND_LIMITS.maxFriends) {
      throw new Error("That player's friends list is full.");
    }
    if (this.listFriendIds(request.addresseeUserId).length >= FRIEND_LIMITS.maxFriends) {
      throw new Error("Your friends list is full.");
    }
    this.db.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(now, requestId);
    return this.friendshipById(requestId)!;
  }

  declineFriendRequest(userId: string, requestId: string): FriendshipRecord {
    const request = this.friendshipById(requestId);
    if (!request || request.status !== "pending" || request.addresseeUserId !== userId) {
      throw new Error("That friend request is no longer available.");
    }
    this.db.prepare("DELETE FROM friendships WHERE id = ?").run(requestId);
    return request;
  }

  cancelFriendRequest(userId: string, requestId: string): FriendshipRecord {
    const request = this.friendshipById(requestId);
    if (!request || request.status !== "pending" || request.requesterUserId !== userId) {
      throw new Error("That outgoing request is no longer available.");
    }
    this.db.prepare("DELETE FROM friendships WHERE id = ?").run(requestId);
    return request;
  }

  removeFriend(userId: string, friendUserId: string): void {
    const friendship = this.friendshipForPair(userId, friendUserId);
    if (!friendship || friendship.status !== "accepted") throw new Error("That player is not in your friends list.");
    this.db.prepare("DELETE FROM friendships WHERE id = ?").run(friendship.id);
  }

  blockPlayer(blockerUserId: string, blockedUserId: string, now = Date.now()): void {
    if (blockerUserId === blockedUserId) throw new Error("You cannot block yourself.");
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const friendship = this.friendshipForPair(blockerUserId, blockedUserId);
      if (friendship) this.db.prepare("DELETE FROM friendships WHERE id = ?").run(friendship.id);
      this.db.prepare(
        `INSERT OR IGNORE INTO player_blocks (id, blocker_user_id, blocked_user_id, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(randomUUID(), blockerUserId, blockedUserId, now);
      this.db.prepare(
        `UPDATE game_invites SET status = 'cancelled'
         WHERE status = 'pending' AND ((sender_user_id = ? AND recipient_user_id = ?) OR (sender_user_id = ? AND recipient_user_id = ?))`
      ).run(blockerUserId, blockedUserId, blockedUserId, blockerUserId);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  unblockPlayer(blockerUserId: string, blockedUserId: string): void {
    this.db.prepare("DELETE FROM player_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?")
      .run(blockerUserId, blockedUserId);
  }

  isBlockedEitherWay(firstUserId: string, secondUserId: string): boolean {
    return Boolean(this.db.prepare(
      `SELECT 1 FROM player_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?)`
    ).get(firstUserId, secondUserId, secondUserId, firstUserId));
  }

  createGameInvite(senderUserId: string, recipientUserId: string, roomCode: string, now = Date.now(), ttlMs = FRIEND_LIMITS.inviteTtlMs): GameInviteRecord {
    if (this.getRelationship(senderUserId, recipientUserId) !== "friends") throw new Error("Only friends can receive game invites.");
    this.expireGameInvites(now);
    const recent = this.db.prepare(
      `SELECT created_at FROM game_invites WHERE sender_user_id = ? AND recipient_user_id = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(senderUserId, recipientUserId) as { created_at: number } | undefined;
    if (recent && now - recent.created_at < FRIEND_LIMITS.inviteCooldownMs) throw new Error("Invite already sent. Give your friend a moment.");
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO game_invites (id, sender_user_id, recipient_user_id, room_code, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, senderUserId, recipientUserId, roomCode, now, now + ttlMs);
    return this.gameInviteById(id)!;
  }

  listPendingGameInvites(userId: string, now = Date.now()): GameInviteRecord[] {
    this.expireGameInvites(now);
    const rows = this.db.prepare(
      `SELECT * FROM game_invites WHERE recipient_user_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 20`
    ).all(userId) as Array<Record<string, unknown>>;
    return rows.map(gameInviteFromRow);
  }

  getGameInvite(inviteId: string): GameInviteRecord | undefined {
    return this.gameInviteById(inviteId);
  }

  respondToGameInvite(userId: string, inviteId: string, status: "accepted" | "declined", now = Date.now()): GameInviteRecord {
    this.expireGameInvites(now);
    const invite = this.gameInviteById(inviteId);
    if (!invite || invite.recipientUserId !== userId || invite.status !== "pending") {
      throw new Error("That invitation has expired or is no longer available.");
    }
    if (this.isBlockedEitherWay(invite.senderUserId, invite.recipientUserId)) throw new Error("That invitation is unavailable.");
    this.db.prepare("UPDATE game_invites SET status = ? WHERE id = ?").run(status, inviteId);
    return { ...invite, status };
  }

  listRecentPlayers(userId: string, limit = 20): RecentPlayerRecord[] {
    const rows = this.db.prepare(
      `SELECT id, recent_profile_id, display_name, username, avatar_id, played_at, result, game_mode
       FROM recent_players WHERE owner_user_id = ? ORDER BY played_at DESC LIMIT ?`
    ).all(userId, Math.min(50, limit)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      profileId: row.recent_profile_id ? String(row.recent_profile_id) : undefined,
      displayName: String(row.display_name),
      username: row.username ? String(row.username) : undefined,
      avatarId: String(row.avatar_id),
      playedAt: Number(row.played_at),
      result: row.result as RecentPlayerRecord["result"],
      gameMode: String(row.game_mode)
    }));
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
    this.recordRecentPlayers(state, completedAt, positions);
  }

  private recordRecentPlayers(state: GameState, completedAt: number, positions: string[]): void {
    const humans = state.players.filter((player) => !player.isBot);
    for (const owner of humans) {
      if (owner.accountType !== "registered" || !owner.profileId) continue;
      const ownerWon = owner.id === state.championId || (!state.championId && owner.id !== state.bhabhiId);
      for (const opponent of humans) {
        if (opponent.id === owner.id) continue;
        const profile = opponent.profileId ? this.getSocialProfile(opponent.profileId) : undefined;
        const recentKey = opponent.profileId ?? opponent.id;
        this.db.prepare(
          `INSERT INTO recent_players
           (id, owner_user_id, recent_profile_id, display_name, username, avatar_id, played_at, result, game_mode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET played_at = excluded.played_at, result = excluded.result`
        ).run(
          `${state.roomCode}:${owner.profileId}:${recentKey}`,
          owner.profileId,
          opponent.profileId ?? null,
          profile?.displayName ?? opponent.username,
          profile?.username ?? null,
          opponent.avatar,
          completedAt,
          ownerWon ? "win" : positions.includes(owner.id) ? "loss" : "completed",
          state.roomMode ?? state.settings.funMode
        );
      }
    }
  }

  private friendshipForPair(firstUserId: string, secondUserId: string): FriendshipRecord | undefined {
    const row = this.db.prepare(
      "SELECT id, requester_user_id, addressee_user_id, status, created_at, updated_at FROM friendships WHERE pair_key = ?"
    ).get(friendshipPairKey(firstUserId, secondUserId)) as Record<string, unknown> | undefined;
    return row ? friendshipFromRow(row) : undefined;
  }

  private friendshipById(id: string): FriendshipRecord | undefined {
    const row = this.db.prepare(
      "SELECT id, requester_user_id, addressee_user_id, status, created_at, updated_at FROM friendships WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? friendshipFromRow(row) : undefined;
  }

  private gameInviteById(id: string): GameInviteRecord | undefined {
    const row = this.db.prepare("SELECT * FROM game_invites WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? gameInviteFromRow(row) : undefined;
  }

  private expireGameInvites(now: number): void {
    this.db.prepare("UPDATE game_invites SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?").run(now);
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
       language = ?, activity_visibility = ?, friend_online_notifications = ?,
       share_avatar_in_results = ?, share_username_in_results = ? WHERE user_id = ?`
    ).run(
      preferences.tableTheme,
      preferences.cardBack,
      boolInt(preferences.soundEnabled),
      boolInt(preferences.musicEnabled),
      boolInt(preferences.vibrationEnabled),
      boolInt(preferences.reducedMotion),
      boolInt(preferences.highContrast),
      preferences.language,
      preferences.activityVisibility,
      boolInt(preferences.friendOnlineNotifications),
      boolInt(preferences.shareAvatarInResults),
      boolInt(preferences.shareUsernameInResults),
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
        google_photo_url TEXT,
        custom_photo_url TEXT,
        custom_photo_key TEXT,
        active_image_type TEXT NOT NULL DEFAULT 'google',
        profile_image_visibility TEXT NOT NULL DEFAULT 'everyone',
        avatar_id TEXT NOT NULL DEFAULT 'avatar_01',
        profile_frame_id TEXT NOT NULL DEFAULT 'default',
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
        language TEXT NOT NULL DEFAULT 'en',
        share_avatar_in_results INTEGER NOT NULL DEFAULT 1,
        share_username_in_results INTEGER NOT NULL DEFAULT 1
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

      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        pair_key TEXT NOT NULL UNIQUE,
        requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friend_request_cooldowns (
        pair_key TEXT PRIMARY KEY,
        last_requested_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_blocks (
        id TEXT PRIMARY KEY,
        blocker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        UNIQUE(blocker_user_id, blocked_user_id)
      );

      CREATE TABLE IF NOT EXISTS game_invites (
        id TEXT PRIMARY KEY,
        sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_code TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_players (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recent_profile_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT NOT NULL,
        username TEXT,
        avatar_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        result TEXT NOT NULL,
        game_mode TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_match_history_user_completed
        ON match_history (user_id, completed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships (requester_user_id, addressee_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_game_invites_recipient ON game_invites (recipient_user_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_recent_players_owner ON recent_players (owner_user_id, played_at DESC);

      INSERT OR IGNORE INTO achievements (id, name, description, icon, requirement, metric) VALUES
        ('first_table', 'First Table', 'Complete your first match.', 'cards', 1, 'gamesPlayed'),
        ('clean_escape', 'Clean Escape', 'Win five matches.', 'shield', 5, 'wins'),
        ('trick_master', 'Trick Master', 'Clear twenty-five tricks.', 'sparkles', 25, 'tricksWon'),
        ('hot_streak', 'On Fire', 'Build a three-game win streak.', 'flame', 3, 'bestWinStreak'),
        ('cup_champion', 'Cup Champion', 'Win a tournament.', 'trophy', 1, 'tournamentWins'),
        ('table_veteran', 'Table Veteran', 'Complete fifty matches.', 'crown', 50, 'gamesPlayed');
    `);
    this.ensureColumn("player_preferences", "activity_visibility", "TEXT NOT NULL DEFAULT 'friends'");
    this.ensureColumn("player_preferences", "friend_online_notifications", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("player_preferences", "share_avatar_in_results", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("player_preferences", "share_username_in_results", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("users", "google_photo_url", "TEXT");
    this.ensureColumn("users", "custom_photo_url", "TEXT");
    this.ensureColumn("users", "custom_photo_key", "TEXT");
    this.ensureColumn("users", "active_image_type", "TEXT NOT NULL DEFAULT 'google'");
    this.ensureColumn("users", "profile_image_visibility", "TEXT NOT NULL DEFAULT 'everyone'");
    this.db.exec(`
      UPDATE users SET google_photo_url = COALESCE(google_photo_url, photo_url)
        WHERE google_photo_url IS NULL AND photo_url IS NOT NULL;
      UPDATE users SET avatar_id = CASE avatar_id
        WHEN 'Aero' THEN 'avatar_01'
        WHEN 'Bolt' THEN 'avatar_02'
        WHEN 'Crown' THEN 'avatar_03'
        WHEN 'Drift' THEN 'avatar_04'
        WHEN 'Flux' THEN 'avatar_05'
        WHEN 'Glint' THEN 'avatar_06'
        WHEN 'Halo' THEN 'avatar_07'
        WHEN 'Ivy' THEN 'avatar_08'
        ELSE avatar_id END;
      UPDATE users SET profile_frame_id = CASE profile_frame_id
        WHEN 'classic' THEN 'default'
        WHEN 'emerald' THEN 'bronze'
        WHEN 'royal' THEN 'gold'
        WHEN 'champion' THEN 'tournament_champion'
        ELSE profile_frame_id END;
    `);
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((candidate) => candidate.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
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
    language: String(row.language ?? "en"),
    activityVisibility: (row.activity_visibility === "everyone" || row.activity_visibility === "nobody")
      ? row.activity_visibility
      : "friends",
    friendOnlineNotifications: Boolean(row.friend_online_notifications),
    shareAvatarInResults: row.share_avatar_in_results === undefined ? true : Boolean(row.share_avatar_in_results),
    shareUsernameInResults: row.share_username_in_results === undefined ? true : Boolean(row.share_username_in_results)
  };
}

function socialProfileFromRow(row: Record<string, unknown>): SocialProfileRecord {
  const imageRow = row as unknown as UserRow;
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    username: String(row.username),
    avatarUrl: resolveActiveImageUrl(imageRow),
    avatarId: String(row.avatar_id),
    profileFrameId: String(row.profile_frame_id),
    profileImageVisibility: normalizeImageVisibility(String(row.profile_image_visibility ?? "everyone")),
    level: Number(row.level),
    rank: String(row.rank),
    lastActiveAt: Number(row.last_active_at)
  };
}

function normalizeImageVisibility(value: unknown): PlayerProfile["profileImageVisibility"] {
  return value === "friends" || value === "nobody" ? value : "everyone";
}

function resolveActiveImageType(row: Pick<UserRow, "active_image_type" | "custom_photo_url" | "google_photo_url" | "avatar_id">): PlayerProfile["activeImageType"] {
  if (row.active_image_type === "custom" && row.custom_photo_url) return "custom";
  if (row.active_image_type === "avatar" && row.avatar_id) return "avatar";
  if (row.active_image_type === "google" && row.google_photo_url) return "google";
  if (row.active_image_type === "initials") return "initials";
  if (row.custom_photo_url) return "custom";
  if (row.avatar_id) return "avatar";
  if (row.google_photo_url) return "google";
  return "initials";
}

function resolveActiveImageUrl(row: Pick<UserRow, "active_image_type" | "custom_photo_url" | "google_photo_url" | "avatar_id">): string | undefined {
  const active = resolveActiveImageType(row);
  if (active === "custom") return row.custom_photo_url ?? undefined;
  if (active === "google") return row.google_photo_url ?? undefined;
  return undefined;
}

function friendshipFromRow(row: Record<string, unknown>): FriendshipRecord {
  return {
    id: String(row.id),
    requesterUserId: String(row.requester_user_id),
    addresseeUserId: String(row.addressee_user_id),
    status: row.status as FriendshipRecord["status"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function gameInviteFromRow(row: Record<string, unknown>): GameInviteRecord {
  return {
    id: String(row.id),
    senderUserId: String(row.sender_user_id),
    recipientUserId: String(row.recipient_user_id),
    roomCode: String(row.room_code),
    status: row.status as GameInviteStatus,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at)
  };
}

function friendshipPairKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(":");
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

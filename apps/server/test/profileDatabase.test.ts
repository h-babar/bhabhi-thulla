import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGameState, createPlayer, getDailyRewardStatus, toPublicGameState } from "@getaway-cards/shared";
import { GameDatabase } from "../src/db.js";

function withDatabase(run: (database: GameDatabase) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "bhabhi-profile-"));
  const database = new GameDatabase(join(directory, "test.sqlite"));
  try {
    run(database);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("returning Google users receive the same permanent profile", () => {
  withDatabase((database) => {
    const first = database.getOrCreateGoogleProfile({
      providerUserId: "google-100",
      email: "player@example.com",
      displayName: "Table Hero"
    });
    const second = database.getOrCreateGoogleProfile({
      providerUserId: "google-100",
      email: "player@example.com",
      displayName: "Changed Google Name"
    });

    assert.equal(second.id, first.id);
    assert.equal(second.username, first.username);
    assert.equal(second.stats.gamesPlayed, 0);
    assert.equal(second.email, "player@example.com");
  });
});

test("daily rewards add coins once and remain idempotent after refresh", () => {
  withDatabase((database) => {
    const profile = database.getOrCreateGoogleProfile({
      providerUserId: "google-daily-reward",
      email: "rewards@example.com",
      displayName: "Reward Player"
    });

    const before = database.getDailyReward(profile.id);
    assert.equal(before.status?.canClaim, true);
    assert.equal(before.status?.rewardAmount, 50);

    const claimed = database.claimDailyReward(profile.id);
    assert.equal(claimed.awardedCoins, 50);
    assert.equal(claimed.profile?.coins, 300);
    assert.equal(claimed.status?.claimedToday, true);

    const duplicate = database.claimDailyReward(profile.id);
    assert.equal(duplicate.awardedCoins, undefined);
    assert.equal(duplicate.profile?.coins, 300);
    assert.equal(duplicate.status?.canClaim, false);
  });
});

test("the seven-day reward track rolls back to day one cleanly", () => {
  const now = Date.parse("2026-08-19T12:00:00.000Z");
  const status = getDailyRewardStatus({
    lastClaimDate: "2026-08-18",
    streak: 7,
    totalClaims: 7
  }, now);

  assert.equal(status.nextRewardDay, 1);
  assert.equal(status.rewardAmount, 50);
  assert.equal(status.calendar[0]?.state, "available");
  assert.equal(status.calendar[6]?.state, "locked");
});

test("share-card privacy preferences persist with safe defaults", () => {
  withDatabase((database) => {
    const profile = database.getOrCreateGoogleProfile({
      providerUserId: "google-share-card",
      email: "share@example.com",
      displayName: "Share Player"
    });

    assert.equal(profile.preferences.shareAvatarInResults, true);
    assert.equal(profile.preferences.shareUsernameInResults, true);

    const updated = database.updatePlayerProfile(profile.id, {
      preferences: {
        shareAvatarInResults: false,
        shareUsernameInResults: false
      }
    });

    assert.equal(updated.preferences.shareAvatarInResults, false);
    assert.equal(updated.preferences.shareUsernameInResults, false);
  });
});

test("legacy custom images stay stored but resolve to a free profile source", () => {
  withDatabase((database) => {
    const profile = database.getOrCreateGoogleProfile({
      providerUserId: "google-avatar-sources",
      email: "avatar@example.com",
      displayName: "Avatar Player",
      photoUrl: "https://images.example.com/google-photo.jpg"
    });

    const avatar = database.updatePlayerProfile(profile.id, {
      selectedAvatarId: "avatar_06",
      activeImageType: "avatar",
      profileFrameId: "gold",
      profileImageVisibility: "friends"
    });
    assert.equal(avatar.googlePhotoUrl, "https://images.example.com/google-photo.jpg");
    assert.equal(avatar.selectedAvatarId, "avatar_06");
    assert.equal(avatar.photoUrl, undefined);
    assert.equal(avatar.profileImageVisibility, "friends");

    const custom = database.setCustomProfilePhoto(profile.id, "https://cdn.example.com/custom.webp", "avatars/player/custom.webp");
    assert.equal(custom.customPhotoUrl, "https://cdn.example.com/custom.webp");
    assert.equal(custom.activeImageType, "avatar");
    assert.equal(custom.photoUrl, undefined);
    const cleared = database.clearCustomProfilePhoto(profile.id);
    assert.equal(cleared.customPhotoUrl, undefined);
    assert.equal(cleared.activeImageType, "avatar");
    assert.equal(cleared.googlePhotoUrl, "https://images.example.com/google-photo.jpg");
  });
});

test("friend requests are canonical, reciprocal, and duplicate-safe", () => {
  withDatabase((database) => {
    const alice = database.getOrCreateGoogleProfile({ providerUserId: "friend-a", email: "a@example.com", displayName: "Alice Ace" });
    const bob = database.getOrCreateGoogleProfile({ providerUserId: "friend-b", email: "b@example.com", displayName: "Bob King" });
    const request = database.sendFriendRequest(alice.id, bob.id, 1_000);

    assert.equal(database.getRelationship(alice.id, bob.id), "request_sent");
    assert.equal(database.getRelationship(bob.id, alice.id), "request_received");
    assert.throws(() => database.sendFriendRequest(alice.id, bob.id, 2_000), /already sent/i);
    assert.throws(() => database.sendFriendRequest(bob.id, alice.id, 2_000), /already sent you/i);

    database.acceptFriendRequest(bob.id, request.id, 3_000);
    assert.equal(database.getRelationship(alice.id, bob.id), "friends");
    assert.deepEqual(database.listFriendIds(alice.id), [bob.id]);
    assert.deepEqual(database.listFriendIds(bob.id), [alice.id]);
  });
});

test("blocking removes friendships and prevents requests and invitations", () => {
  withDatabase((database) => {
    const alice = database.getOrCreateGoogleProfile({ providerUserId: "block-a", email: "a@example.com", displayName: "Alice" });
    const bob = database.getOrCreateGoogleProfile({ providerUserId: "block-b", email: "b@example.com", displayName: "Bob" });
    const request = database.sendFriendRequest(alice.id, bob.id, 1_000);
    database.acceptFriendRequest(bob.id, request.id, 2_000);
    database.blockPlayer(alice.id, bob.id, 3_000);

    assert.equal(database.getRelationship(alice.id, bob.id), "blocked");
    assert.equal(database.listFriendIds(alice.id).length, 0);
    assert.throws(() => database.sendFriendRequest(bob.id, alice.id, 100_000), /unavailable/i);
    assert.throws(() => database.createGameInvite(bob.id, alice.id, "ROOM11", 100_000), /friends/i);
  });
});

test("accepted friends can exchange expiring game invitations", () => {
  withDatabase((database) => {
    const alice = database.getOrCreateGoogleProfile({ providerUserId: "invite-a", email: "a@example.com", displayName: "Alice" });
    const bob = database.getOrCreateGoogleProfile({ providerUserId: "invite-b", email: "b@example.com", displayName: "Bob" });
    const request = database.sendFriendRequest(alice.id, bob.id, 1_000);
    database.acceptFriendRequest(bob.id, request.id, 2_000);
    const invite = database.createGameInvite(alice.id, bob.id, "ROOM22", 10_000, 30_000);

    assert.equal(database.listPendingGameInvites(bob.id, 20_000)[0]?.roomCode, "ROOM22");
    assert.equal(database.respondToGameInvite(bob.id, invite.id, "accepted", 20_000).status, "accepted");
    assert.equal(database.listPendingGameInvites(bob.id, 20_000).length, 0);
  });
});

test("social search exposes public profile fields and respects blocks", () => {
  withDatabase((database) => {
    const alice = database.getOrCreateGoogleProfile({ providerUserId: "search-a", email: "private-a@example.com", displayName: "Alice Search" });
    const bob = database.getOrCreateGoogleProfile({ providerUserId: "search-b", email: "private-b@example.com", displayName: "Bob Search" });
    const result = database.searchSocialProfiles(alice.id, bob.username);

    assert.equal(result[0]?.id, bob.id);
    assert.equal("email" in result[0]!, false);
    database.blockPlayer(alice.id, bob.id);
    assert.equal(database.searchSocialProfiles(alice.id, bob.username).length, 0);
  });
});

test("generated usernames remain unique and profile edits enforce availability", () => {
  withDatabase((database) => {
    const first = database.getOrCreateGoogleProfile({
      providerUserId: "google-101",
      email: "first@example.com",
      displayName: "Card Ace"
    });
    const second = database.getOrCreateGoogleProfile({
      providerUserId: "google-102",
      email: "second@example.com",
      displayName: "Card Ace"
    });

    assert.notEqual(first.username, second.username);
    assert.equal(database.isUsernameAvailable(first.username, first.id), true);
    assert.equal(database.isUsernameAvailable(first.username, second.id), false);
  });
});

test("guest progress can only be merged once", () => {
  withDatabase((database) => {
    const profile = database.getOrCreateGoogleProfile({
      providerUserId: "google-103",
      email: "merge@example.com",
      displayName: "Merge Player"
    });
    const transfer = {
      guestId: "guest-device-500",
      displayName: "Guest Hero",
      avatarId: "Crown",
      coins: 90,
      stats: { gamesPlayed: 4, wins: 3, losses: 1, tricksWon: 12 },
      achievementProgress: { first_table: 1 },
      preferences: { tableTheme: "royal" }
    };

    const merged = database.mergeGuestProgress(profile.id, transfer)!;
    const repeated = database.mergeGuestProgress(profile.id, transfer)!;

    assert.equal(merged.coins, 340);
    assert.equal(merged.stats.gamesPlayed, 4);
    assert.equal(merged.stats.wins, 3);
    assert.equal(merged.displayName, "Guest Hero");
    assert.equal(merged.avatarId, "Crown");
    assert.equal(merged.preferences.tableTheme, "royal");
    assert.equal(repeated.coins, 340);
    assert.equal(repeated.stats.gamesPlayed, 4);
  });
});

test("completed match statistics are recorded exactly once", () => {
  withDatabase((database) => {
    const profile = database.getOrCreateGoogleProfile({
      providerUserId: "google-104",
      email: "winner@example.com",
      displayName: "Match Winner"
    });
    const winner = createPlayer({
      id: "winner-seat",
      username: profile.displayName,
      avatar: profile.avatarId,
      accountType: "registered",
      profileId: profile.id
    }, 500);
    const bot = createPlayer({ id: "bot-seat", username: "Bot", avatar: "Bolt", isBot: true }, 500);
    const state = createGameState("MATCH1", winner, undefined, 500);
    state.players.push(bot);
    state.status = "game_over";
    state.round = 1;
    state.championId = winner.id;
    state.bhabhiId = bot.id;
    state.escapeOrder = [winner.id, bot.id];
    state.history.push({ id: "start-match-1", at: 600, type: "start", message: "Match started." });
    state.updatedAt = 1_000;

    database.recordSnapshot(state);
    database.recordSnapshot(state);

    const recorded = database.getPlayerProfile(profile.id)!;
    const publicWinner = toPublicGameState(state).players.find((player) => player.id === winner.id)!;
    assert.equal(recorded.stats.gamesPlayed, 1);
    assert.equal(recorded.stats.wins, 1);
    assert.equal(recorded.recentMatches.length, 1);
    assert.equal("profileId" in publicWinner, false);
    assert.equal("email" in publicWinner, false);
  });
});

test("public game avatars respect everyone, friends, nobody, and self visibility", () => {
  const owner = createPlayer({
    id: "owner-seat",
    username: "Private Photo",
    avatar: "avatar_03",
    avatarUrl: "https://images.example.com/private.webp",
    profileFrameId: "gold",
    profileImageVisibility: "nobody",
    accountType: "registered",
    profileId: "profile-owner"
  }, 100);
  const viewer = createPlayer({
    id: "viewer-seat",
    username: "Viewer",
    avatar: "avatar_02",
    profileImageVisibility: "everyone",
    accountType: "registered",
    profileId: "profile-viewer"
  }, 100);
  const state = createGameState("PRIVACY", owner, undefined, 100);
  state.players.push(viewer);

  const strangerView = toPublicGameState(state, viewer.id, () => false).players[0]!;
  const selfView = toPublicGameState(state, owner.id, () => false).players[0]!;
  assert.equal(strangerView.avatarUrl, undefined);
  assert.equal(strangerView.avatar, "initials");
  assert.equal(selfView.avatarUrl, "https://images.example.com/private.webp");
  assert.equal(selfView.avatar, "avatar_03");

  owner.profileImageVisibility = "friends";
  state.spectators.push({
    id: "spectator-seat",
    sessionId: "spectator-session",
    profileId: "profile-spectator",
    username: "Friend Spectator",
    avatar: "avatar_04",
    profileImageVisibility: "everyone",
    connected: true,
    joinedAt: 100,
    lastSeenAt: 100
  });
  const friendSpectatorView = toPublicGameState(
    state,
    "spectator-seat",
    (ownerProfileId, viewerProfileId) =>
      ownerProfileId === "profile-owner" && viewerProfileId === "profile-spectator"
  );
  assert.equal(friendSpectatorView.players[0]?.avatarUrl, "https://images.example.com/private.webp");
  assert.equal("profileId" in friendSpectatorView.spectators[0]!, false);
});

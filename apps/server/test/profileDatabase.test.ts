import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGameState, createPlayer, toPublicGameState } from "@getaway-cards/shared";
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

import type { GameEvent, GameState, RoundSummary } from "@getaway-cards/shared";
import { mkdirSync } from "node:fs";
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
    `);
  }
}

import {
  createGameState,
  createPlayer,
  type GameState,
  type TournamentState
} from "@getaway-cards/shared";
import assert from "node:assert/strict";
import test from "node:test";
import { getRoomCleanupPlan, RoomManager } from "../src/roomManager.js";

class FakeDatabase {
  readonly deletedRooms: string[] = [];
  readonly snapshots: GameState[] = [];

  recordSnapshot(state: GameState): void {
    this.snapshots.push(state);
  }

  deleteRoomSnapshot(roomCode: string): void {
    this.deletedRooms.push(roomCode);
  }
}

function makeState(): GameState {
  const now = Date.now();
  const player = createPlayer({
    id: "player-1",
    sessionId: "session-1",
    username: "Tester",
    avatar: "Aero"
  }, now);
  return createGameState("ABC123", player, undefined, now);
}

function makeTournament(status: TournamentState["status"]): TournamentState {
  const now = Date.now();
  return {
    id: "tournament-1",
    status,
    playerId: "player-1",
    playerNationCode: "GB",
    playerNationName: "United Kingdom",
    difficulty: "normal",
    stageIndex: 0,
    stages: [],
    startedAt: now,
    updatedAt: now
  };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test("completed matches receive a short cleanup window", () => {
  const state = makeState();
  state.status = "game_over";

  assert.deepEqual(getRoomCleanupPlan(state, { matchResultsMs: 250 }), {
    delayMs: 250,
    reason: "match_complete",
    message: "Match complete. The room closed automatically."
  });
});

test("an active tournament stage remains available for progression", () => {
  const state = makeState();
  state.status = "game_over";
  state.tournament = makeTournament("active");

  assert.equal(getRoomCleanupPlan(state), undefined);
});

test("an abandoned room is hidden immediately and then deleted", async () => {
  const db = new FakeDatabase();
  const closed: string[] = [];
  const manager = new RoomManager(
    db,
    () => undefined,
    (payload) => closed.push(payload.reason),
    { reconnectGraceMs: 20 }
  );
  const created = manager.createRoom({ username: "Tester", avatar: "Aero" });

  assert.equal(created.ok, true);
  manager.attachSocket("socket-1", created.roomCode!, created.playerId!);
  manager.disconnectSocket("socket-1");

  assert.equal(manager.listRooms().length, 0);
  await wait(50);
  assert.equal(manager.getPublicState(created.roomCode!), undefined);
  assert.deepEqual(db.deletedRooms, [created.roomCode]);
  assert.deepEqual(closed, ["abandoned"]);
});

test("rejoining within the grace window cancels room deletion", async () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(
    db,
    () => undefined,
    () => undefined,
    { reconnectGraceMs: 35 }
  );
  const created = manager.createRoom({ username: "Tester", avatar: "Aero" });

  manager.attachSocket("socket-1", created.roomCode!, created.playerId!);
  manager.disconnectSocket("socket-1");
  await wait(10);

  const rejoined = manager.joinRoom({
    roomCode: created.roomCode!,
    sessionId: created.sessionId,
    username: "Tester",
    avatar: "Aero"
  });
  manager.attachSocket("socket-2", rejoined.roomCode!, rejoined.playerId!);

  await wait(55);
  assert.equal(rejoined.ok, true);
  assert.ok(manager.getPublicState(created.roomCode!));
  assert.deepEqual(db.deletedRooms, []);
  assert.equal(manager.listRooms().length, 1);
});

test("disconnecting an old socket keeps a player with another socket online", () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(db, () => undefined);
  const created = manager.createRoom({ username: "Tester", avatar: "Aero" });

  manager.attachSocket("socket-old", created.roomCode!, created.playerId!);
  manager.attachSocket("socket-new", created.roomCode!, created.playerId!);
  manager.disconnectSocket("socket-old");

  assert.equal(manager.listRooms().length, 1);
  assert.equal(
    manager.getPublicState(created.roomCode!, created.playerId!)?.players[0]?.connected,
    true
  );
});

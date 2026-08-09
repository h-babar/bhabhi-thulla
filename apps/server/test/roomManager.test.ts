import {
  applyTemporaryBotMove,
  applyTimeoutAutoPlay,
  createGameState,
  createPlayer,
  type Card,
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

function makeTimeoutState(): GameState {
  const now = Date.now() - 10_000;
  const human = createPlayer({
    id: "human",
    sessionId: "human-session",
    username: "Ali",
    avatar: "Aero"
  }, now);
  const bot = createPlayer({
    id: "bot",
    username: "Knox Bot",
    avatar: "Aero",
    isBot: true,
    botDifficulty: "normal"
  }, now);
  const cards: Record<string, Card> = {
    low: { id: "low", rank: "2", suit: "hearts" },
    high: { id: "high", rank: "10", suit: "hearts" },
    spare: { id: "spare", rank: "A", suit: "clubs" },
    lead: { id: "lead", rank: "7", suit: "hearts" },
    botSpare: { id: "bot-spare", rank: "4", suit: "clubs" }
  };
  human.hand = [cards.high!, cards.low!, cards.spare!];
  bot.hand = [cards.botSpare!];
  const state = createGameState("AFK123", human, { turnSeconds: 10 }, now);
  state.players.push(bot);
  state.status = "playing";
  state.activePlayerId = human.id;
  state.leadSuit = "hearts";
  state.trickLeaderId = bot.id;
  state.trick = [{ playerId: bot.id, username: bot.username, card: cards.lead!, offSuit: false }];
  state.turnId = "turn-one";
  state.turnStartedAt = now;
  state.turnDeadline = now + 10_000;
  state.turnEndsAt = state.turnDeadline;
  return state;
}

test("first timeout auto-plays the lowest legal card without changing identity", () => {
  const state = makeTimeoutState();
  const next = applyTimeoutAutoPlay(state, "human", 2, Date.now());
  const player = next.players.find((candidate) => candidate.id === "human")!;

  assert.equal(player.hand.some((card) => card.id === "low"), false);
  assert.equal(player.username, "Ali");
  assert.equal(player.isBot, false);
  assert.equal(player.controlState, "auto-play");
  assert.equal(player.consecutiveTimeouts, 1);
  assert.notEqual(next.turnId, state.turnId);
  assert.match(next.history[0]!.message, /Time expired - Auto Play/);
});

test("second consecutive timeout enables temporary bot control on the human seat", () => {
  const state = makeTimeoutState();
  state.players[0]!.consecutiveTimeouts = 1;
  state.players[0]!.missedTurnStreak = 1;
  const next = applyTimeoutAutoPlay(state, "human", 2, Date.now());
  const player = next.players.find((candidate) => candidate.id === "human")!;

  assert.equal(player.controlState, "temporary-bot");
  assert.equal(player.consecutiveTimeouts, 2);
  assert.equal(player.sessionId, "human-session");
  assert.equal(player.isBot, false);
  assert.match(next.history[0]!.message, /temporarily taken over/);
});

test("temporary bot moves preserve the human seat control and reliability state", () => {
  const state = makeTimeoutState();
  const player = state.players[0]!;
  player.controlState = "temporary-bot";
  player.connectionState = "afk";
  player.consecutiveTimeouts = 2;
  player.missedTurnStreak = 2;
  const next = applyTemporaryBotMove(
    state,
    player.id,
    { type: "play", cardIds: ["low"] },
    Date.now()
  );
  const updated = next.players.find((candidate) => candidate.id === player.id)!;

  assert.equal(updated.controlState, "temporary-bot");
  assert.equal(updated.connectionState, "afk");
  assert.equal(updated.consecutiveTimeouts, 2);
  assert.equal(updated.username, "Ali");
});

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
  const created = manager.createRoom({ username: "Tester", avatar: "Aero", visibility: "public" });

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
  const created = manager.createRoom({ username: "Tester", avatar: "Aero", visibility: "public" });

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
  const created = manager.createRoom({ username: "Tester", avatar: "Aero", visibility: "public" });

  manager.attachSocket("socket-old", created.roomCode!, created.playerId!);
  manager.attachSocket("socket-new", created.roomCode!, created.playerId!);
  manager.disconnectSocket("socket-old");

  assert.equal(manager.listRooms().length, 1);
  assert.equal(
    manager.getPublicState(created.roomCode!, created.playerId!)?.players[0]?.connected,
    true
  );
});

test("disconnect reserves the human seat under temporary bot control", () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(db, () => undefined, () => undefined, {
    playerReconnectGraceMs: 120_000,
    reconnectGraceMs: 5
  });
  const created = manager.createRoom({ username: "Ali", avatar: "Aero" });
  manager.attachSocket("socket-1", created.roomCode!, created.playerId!);
  manager.disconnectSocket("socket-1");

  const player = manager.getPublicState(created.roomCode!, created.playerId!)?.players[0];
  assert.equal(player?.connected, false);
  assert.equal(player?.connectionState, "disconnected");
  assert.equal(player?.controlState, "temporary-bot");
  assert.ok((player?.reconnectDeadline ?? 0) > Date.now());
});

test("registered players can recover an active seat from another device", async () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(db, () => undefined, () => undefined, {
    reconnectGraceMs: 100,
    matchResultsMs: 5
  });
  const created = manager.createRoom({
    username: "Ali",
    avatar: "Aero",
    accountType: "registered",
    identityId: "profile-ali",
    profileId: "profile-ali"
  });
  manager.addBot({ roomCode: created.roomCode!, difficulty: "normal" }, created.playerId!);
  manager.startGame(created.roomCode!, created.playerId!);
  manager.attachSocket("laptop", created.roomCode!, created.playerId!);
  manager.disconnectSocket("laptop");

  const active = manager.findActiveGame("profile-ali");
  assert.equal(active?.roomCode, created.roomCode);

  const rejoined = manager.rejoinActive({
    username: "Ali",
    avatar: "Aero",
    accountType: "registered",
    identityId: "profile-ali",
    profileId: "profile-ali"
  });
  manager.attachSocket("phone", rejoined.roomCode!, rejoined.playerId!);
  const player = rejoined.state?.players.find((candidate) => candidate.isYou);

  assert.equal(rejoined.ok, true);
  assert.equal(player?.connectionState, "reconnecting");
  assert.equal(player?.controlState, "temporary-bot");
  assert.equal(player?.username, "Ali");
  assert.equal(manager.getSocketSeat("laptop"), undefined);
  assert.equal(manager.getSocketSeat("phone")?.participantId, created.playerId);

  const tookControl = manager.takeControl(created.roomCode!, created.playerId!, rejoined.state?.turnId);
  const controlledPlayer = manager.getPublicState(created.roomCode!, created.playerId!)?.players.find(
    (candidate) => candidate.isYou
  );
  assert.equal(tookControl.ok, true);
  assert.equal(controlledPlayer?.controlState, "human");
  assert.equal(controlledPlayer?.connectionState, "online");
  manager.quitRoom(created.roomCode!, created.playerId!, false);
  await wait(15);
});

test("quick play marks the room so its compact HUD can omit round progress", async () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(
    db,
    () => undefined,
    () => undefined,
    { reconnectGraceMs: 10 }
  );
  const created = manager.quickPlay({ username: "Tester", avatar: "Aero" });

  assert.equal(manager.getPublicState(created.roomCode!, created.playerId!)?.roomMode, "quick");
  manager.quitRoom(created.roomCode!, created.playerId!, false);
  await wait(25);
  assert.equal(manager.getPublicState(created.roomCode!), undefined);
});

test("only public rooms are discoverable while private rooms remain joinable by code", () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(db, () => undefined);
  const privateRoom = manager.createRoom({
    username: "Private Host",
    avatar: "Aero",
    visibility: "private"
  });
  const publicRoom = manager.createRoom({
    username: "Public Host",
    avatar: "Aero",
    visibility: "public"
  });

  manager.attachSocket("private-host", privateRoom.roomCode!, privateRoom.playerId!);
  manager.attachSocket("public-host", publicRoom.roomCode!, publicRoom.playerId!);

  assert.deepEqual(manager.listRooms().map((room) => room.roomCode), [publicRoom.roomCode]);

  const joinedPrivateRoom = manager.joinRoom({
    roomCode: privateRoom.roomCode!,
    username: "Invited Player",
    avatar: "Aero"
  });
  assert.equal(joinedPrivateRoom.ok, true);
  assert.equal(joinedPrivateRoom.roomCode, privateRoom.roomCode);
});

test("a replacement spectator can reclaim their original bot seat", () => {
  const db = new FakeDatabase();
  const manager = new RoomManager(db, () => undefined);
  const created = manager.createRoom({
    username: "Tester",
    avatar: "Aero",
    settings: { maxPlayers: 2 }
  });
  manager.addBot(
    { roomCode: created.roomCode!, difficulty: "normal" },
    created.playerId!
  );

  const replaced = manager.quitRoom(created.roomCode!, created.playerId!, true);
  const spectator = replaced.state?.spectators.find((candidate) => candidate.isYou);
  assert.equal(replaced.stayedAsSpectator, true);
  assert.equal(spectator?.replacedPlayerId, created.playerId);
  assert.equal(
    replaced.state?.players.find((player) => player.id === created.playerId)?.isBot,
    true
  );

  const reclaimed = manager.reclaimBotSeat(created.roomCode!, replaced.playerId!);
  const restoredPlayer = reclaimed.state?.players.find((player) => player.isYou);
  assert.equal(reclaimed.ok, true);
  assert.equal(reclaimed.playerId, created.playerId);
  assert.equal(reclaimed.sessionId, created.sessionId);
  assert.equal(restoredPlayer?.username, "Tester");
  assert.equal(restoredPlayer?.isBot, false);
  assert.equal(reclaimed.state?.spectators.length, 0);
});

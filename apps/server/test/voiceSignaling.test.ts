import type { GameState, VoiceForwardedSessionSignal } from "@getaway-cards/shared";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { RoomManager } from "../src/roomManager.js";
import { VoiceSignalingService } from "../src/voiceSignaling.js";

class FakeDatabase {
  recordSnapshot(_state: GameState): void {}
  deleteRoomSnapshot(_roomCode: string): void {}
}

class FakeSocket {
  readonly events: Array<{ event: string; payload: unknown }> = [];
  constructor(readonly id: string) {}
  emit(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

class FakeIo {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };
  readonly roomEvents: Array<{ roomId: string; event: string; payload: unknown }> = [];
  to(roomId: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.roomEvents.push({ roomId, event, payload });
      }
    };
  }
}

function setupVoiceRoom() {
  const manager = new RoomManager(new FakeDatabase(), () => undefined);
  const alice = manager.createRoom({ username: "Alice", avatar: "Aero" });
  const bob = manager.joinRoom({ roomCode: alice.roomCode!, username: "Bob", avatar: "Bolt" });
  manager.attachSocket("alice-socket", alice.roomCode!, alice.playerId!);
  manager.attachSocket("bob-socket", bob.roomCode!, bob.playerId!);

  const io = new FakeIo();
  const aliceSocket = new FakeSocket("alice-socket");
  const bobSocket = new FakeSocket("bob-socket");
  io.sockets.sockets.set(aliceSocket.id, aliceSocket);
  io.sockets.sockets.set(bobSocket.id, bobSocket);
  const voice = new VoiceSignalingService(io as never, manager, {
    stunUrls: ["stun:test.example:3478"],
    turnUrls: [],
    turnCredentialTtlSeconds: 3600
  });
  return { manager, voice, io, alice, bob, aliceSocket, bobSocket };
}

test("voice discovery includes only opted-in seated humans and defers peer discovery until after join", async () => {
  const { voice, alice, bob, aliceSocket, bobSocket } = setupVoiceRoom();
  const first = voice.join(aliceSocket as never, { roomId: alice.roomCode! });
  const second = voice.join(bobSocket as never, { roomId: bob.roomCode! });

  assert.equal(first.ok, true);
  assert.equal(first.participants?.length, 1);
  assert.deepEqual(second.participants?.map((participant) => participant.displayName).sort(), ["Alice", "Bob"]);
  assert.deepEqual(second.iceServers, [{ urls: ["stun:test.example:3478"] }]);
  assert.equal(aliceSocket.events.some((item) => item.event === "voice:participants"), false);

  await new Promise<void>((resolve) => setImmediate(resolve));
  const discovery = aliceSocket.events.filter((item) => item.event === "voice:participants").at(-1)?.payload as {
    participants: Array<{ displayName: string }>;
  };
  assert.deepEqual(discovery.participants.map((participant) => participant.displayName).sort(), ["Alice", "Bob"]);
});

test("voice join returns short-lived TURN relay credentials when configured", () => {
  const { manager, io, alice, aliceSocket } = setupVoiceRoom();
  const secret = "test-turn-rest-secret";
  const voice = new VoiceSignalingService(io as never, manager, {
    stunUrls: ["stun:test.example:3478"],
    turnUrls: [
      "turn:relay.example:80?transport=udp",
      "turns:relay.example:443?transport=tcp"
    ],
    turnRestSecret: secret,
    turnCredentialTtlSeconds: 3600
  });

  const response = voice.join(aliceSocket as never, { roomId: alice.roomCode! });
  const relay = response.iceServers?.[1];

  assert.equal(response.ok, true);
  assert.deepEqual(relay?.urls, [
    "turn:relay.example:80?transport=udp",
    "turns:relay.example:443?transport=tcp"
  ]);
  assert.match(relay?.username ?? "", /^\d+:/);
  assert.equal(
    relay?.credential,
    createHmac("sha1", secret).update(relay?.username ?? "").digest("base64")
  );
  assert.ok(Number((relay?.username ?? "0:").split(":", 1)[0]) > Math.floor(Date.now() / 1000));
});

test("voice offer identity is server-derived and delivered only inside the room", () => {
  const { voice, alice, bob, aliceSocket, bobSocket } = setupVoiceRoom();
  voice.join(aliceSocket as never, { roomId: alice.roomCode! });
  voice.join(bobSocket as never, { roomId: bob.roomCode! });

  const response = voice.forwardSession(aliceSocket as never, "voice:offer", {
    roomId: alice.roomCode!,
    intendedRecipientPlayerId: bob.playerId!,
    description: { type: "offer", sdp: "v=0\r\ns=voice-test\r\n" }
  });
  const relayed = bobSocket.events.find((item) => item.event === "voice:offer")?.payload as VoiceForwardedSessionSignal;

  assert.equal(response.ok, true);
  assert.equal(relayed.senderPlayerId, alice.playerId);
  assert.equal(relayed.intendedRecipientPlayerId, bob.playerId);
  assert.equal(relayed.roomId, alice.roomCode);
});

test("cross-room recipients and spoofed room IDs are rejected", () => {
  const { manager, voice, alice, aliceSocket } = setupVoiceRoom();
  const carol = manager.createRoom({ username: "Carol", avatar: "Crown" });
  const carolSocket = new FakeSocket("carol-socket");
  manager.attachSocket(carolSocket.id, carol.roomCode!, carol.playerId!);
  voice.join(aliceSocket as never, { roomId: alice.roomCode! });
  voice.join(carolSocket as never, { roomId: carol.roomCode! });

  const crossRoom = voice.forwardSession(aliceSocket as never, "voice:offer", {
    roomId: alice.roomCode!,
    intendedRecipientPlayerId: carol.playerId!,
    description: { type: "offer", sdp: "v=0\r\ns=cross-room\r\n" }
  });
  const spoofedRoom = voice.updateMute(aliceSocket as never, {
    roomId: carol.roomCode!,
    isSelfMuted: true
  });

  assert.equal(crossRoom.ok, false);
  assert.equal(spoofedRoom.ok, false);
});

test("bot-only modes and spectators cannot join voice", async () => {
  const manager = new RoomManager(
    new FakeDatabase(),
    () => undefined,
    () => undefined,
    { reconnectGraceMs: 5 }
  );
  const quick = manager.quickPlay({ username: "Solo", avatar: "Aero" });
  const spectatorRoom = manager.createRoom({ username: "Host", avatar: "Bolt", settings: { maxPlayers: 2 } });
  manager.addBot({ roomCode: spectatorRoom.roomCode!, difficulty: "normal" }, spectatorRoom.playerId!);
  manager.startGame(spectatorRoom.roomCode!, spectatorRoom.playerId!);
  const spectator = manager.joinRoom({ roomCode: spectatorRoom.roomCode!, username: "Viewer", avatar: "Flux", asSpectator: true });
  manager.attachSocket("quick-socket", quick.roomCode!, quick.playerId!);
  manager.attachSocket("spectator-socket", spectator.roomCode!, spectator.playerId!);
  const io = new FakeIo();
  const voice = new VoiceSignalingService(io as never, manager, {
    stunUrls: [],
    turnUrls: [],
    turnCredentialTtlSeconds: 3600
  });

  const quickResult = voice.join(new FakeSocket("quick-socket") as never, { roomId: quick.roomCode! });
  const spectatorResult = voice.join(new FakeSocket("spectator-socket") as never, { roomId: spectator.roomCode! });

  assert.equal(quickResult.ok, false);
  assert.match(quickResult.error ?? "", /bot-only|offline/i);
  assert.equal(spectatorResult.ok, false);
  assert.match(spectatorResult.error ?? "", /seated human/i);

  manager.quitRoom(quick.roomCode!, quick.playerId!, false);
  manager.quitRoom(spectatorRoom.roomCode!, spectator.playerId!, false);
  manager.quitRoom(spectatorRoom.roomCode!, spectatorRoom.playerId!, false);
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
});

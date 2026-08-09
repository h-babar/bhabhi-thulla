import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GameDatabase } from "../src/db.js";
import { FriendsService } from "../src/friendsService.js";
import { RoomManager } from "../src/roomManager.js";

class FakeSocket {
  readonly joined = new Set<string>();
  constructor(readonly id: string) {}
  join(room: string): void { this.joined.add(room); }
  leave(room: string): void { this.joined.delete(room); }
}

class FakeIo {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };
  readonly events: Array<{ room: string; event: string; payload: unknown }> = [];
  to(room: string) {
    return { emit: (event: string, payload: unknown) => this.events.push({ room, event, payload }) };
  }
}

test("registered friends receive real-time requests and playable room invitations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bhabhi-friends-"));
  const database = new GameDatabase(join(directory, "friends.sqlite"));
  const io = new FakeIo();
  const manager = new RoomManager(database, () => undefined, () => undefined, { reconnectGraceMs: 5 });
  const aliceSocket = new FakeSocket("alice-socket");
  const bobSocket = new FakeSocket("bob-socket");
  io.sockets.sockets.set(aliceSocket.id, aliceSocket);
  io.sockets.sockets.set(bobSocket.id, bobSocket);
  const identities = {
    alice: { uid: "social-alice", email: "alice@example.com", name: "Alice Social" },
    bob: { uid: "social-bob", email: "bob@example.com", name: "Bob Social" }
  } as const;
  const service = new FriendsService(
    io as never,
    database,
    manager,
    (socketId, roomCode, participantId) => {
      if (roomCode && participantId) manager.attachSocket(socketId, roomCode, participantId);
    },
    async (token) => identities[token as keyof typeof identities]
  );

  try {
    const aliceAuth = await service.authenticate(aliceSocket as never, "alice");
    const bobAuth = await service.authenticate(bobSocket as never, "bob");
    const aliceId = database.findProfileByProviderUserId("social-alice")!.id;
    const bobId = database.findProfileByProviderUserId("social-bob")!.id;

    assert.equal(aliceAuth.ok, true);
    assert.equal(bobAuth.ok, true);
    assert.equal(service.requestFriend(aliceSocket as never, bobId).ok, true);
    assert.ok(io.events.some((item) => item.room.endsWith(bobId) && item.event === "friends:request"));

    const requestId = service.snapshot(bobId).incomingRequests[0]!.id;
    assert.equal(service.acceptRequest(bobSocket as never, requestId).ok, true);
    assert.equal(service.snapshot(aliceId).friends[0]?.id, bobId);
    assert.equal(service.snapshot(bobId).onlineCount, 1);

    database.updatePlayerProfile(aliceId, { preferences: { friendOnlineNotifications: true } });
    service.disconnect(bobSocket.id);
    await service.authenticate(bobSocket as never, "bob");
    assert.ok(io.events.some((item) =>
      item.room.endsWith(aliceId) &&
      item.event === "friends:notification" &&
      (item.payload as { type?: string }).type === "presence"
    ));

    const invite = service.inviteFriend(aliceSocket as never, bobId);
    assert.equal(invite.ok, true);
    assert.ok(invite.roomJoin?.roomCode);
    assert.ok(io.events.some((item) => item.room.endsWith(bobId) && item.event === "friends:invite"));

    const inviteId = service.snapshot(bobId).gameInvites[0]!.id;
    const accepted = service.acceptInvite(bobSocket as never, inviteId);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.roomCode, invite.roomJoin?.roomCode);
  } finally {
    const seat = manager.getSocketSeat(aliceSocket.id);
    if (seat) manager.quitRoom(seat.roomCode, seat.participantId, false);
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

import type {
  ClientToServerEvents,
  FriendActionResponse,
  FriendNotification,
  FriendPresence,
  FriendRequestItem,
  FriendsAuthResponse,
  FriendsSnapshot,
  GameInviteItem,
  RecentPlayerItem,
  ServerToClientEvents,
  SocialPlayerProfile
} from "@getaway-cards/shared";
import type { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { verifyFirebaseToken } from "./auth.js";
import type {
  FriendshipRecord,
  GameDatabase,
  GameInviteRecord,
  SocialProfileRecord
} from "./db.js";
import type { RoomManager, SocialRoomInfo } from "./roomManager.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AttachRoom = (socketId: string, roomCode?: string, participantId?: string) => void;
interface SocialAuthToken { uid: string; email?: string; name?: string; picture?: string }
type SocialTokenVerifier = (token: string) => Promise<SocialAuthToken>;

interface PresenceCandidate {
  status: FriendPresence["status"];
  activity: string;
  room?: SocialRoomInfo;
}

const SOCIAL_ROOM_PREFIX = "friends:user:";
const ACTION_WINDOW_MS = 60_000;
const ACTIONS_PER_WINDOW = 45;

export class FriendsService {
  private readonly socketUsers = new Map<string, string>();
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly awaySockets = new Set<string>();
  private readonly actionBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly presenceMemory = new Map<string, FriendPresence["status"]>();

  constructor(
    private readonly io: GameServer,
    private readonly db: GameDatabase,
    private readonly roomManager: RoomManager,
    private readonly attachRoom: AttachRoom,
    private readonly verifyToken: SocialTokenVerifier = verifyFirebaseToken
  ) {}

  async authenticate(socket: GameSocket, authToken: string): Promise<FriendsAuthResponse> {
    try {
      const decoded = await this.verifyToken(authToken);
      const profile = this.db.getOrCreateGoogleProfile({
        providerUserId: decoded.uid,
        email: decoded.email ?? `${decoded.uid}@private.firebase`,
        displayName: decoded.name ?? "Player",
        photoUrl: decoded.picture
      });
      const previousUserId = this.socketUsers.get(socket.id);
      if (previousUserId) socket.leave(this.socialRoom(previousUserId));
      this.detachSocket(socket.id, false);
      this.socketUsers.set(socket.id, profile.id);
      const sockets = this.userSockets.get(profile.id) ?? new Set<string>();
      sockets.add(socket.id);
      this.userSockets.set(profile.id, sockets);
      socket.join(this.socialRoom(profile.id));
      const snapshot = this.snapshot(profile.id);
      this.rememberSnapshotPresence(profile.id, snapshot);
      this.broadcastPresence(profile.id);
      return { ok: true, snapshot };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Your social session could not be verified.") };
    }
  }

  refresh(socket: GameSocket): FriendsAuthResponse {
    const userId = this.requireUser(socket.id);
    return userId.ok ? { ok: true, snapshot: this.snapshot(userId.userId) } : userId;
  }

  signOut(socket: GameSocket) {
    const userId = this.socketUsers.get(socket.id);
    if (!userId) return { ok: true as const };
    socket.leave(this.socialRoom(userId));
    this.detachSocket(socket.id, true);
    return { ok: true as const };
  }

  search(socket: GameSocket, query: string) {
    const user = this.requireUser(socket.id);
    if (!user.ok) return user;
    if (!this.consumeAction(socket.id, 2)) return { ok: false, error: "Too many searches. Try again shortly." };
    const players = this.db.searchSocialProfiles(user.userId, query).map((profile) =>
      this.toSocialProfile(profile, user.userId)
    );
    return { ok: true as const, players };
  }

  requestFriend(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const request = this.db.sendFriendRequest(userId, cleanId(profileId));
      this.pushSnapshots(userId, request.addresseeUserId);
      this.notify(request.addresseeUserId, "friends:request", {
        type: "request",
        message: `${this.db.getSocialProfile(userId)?.displayName ?? "A player"} sent you a friend request.`
      });
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  acceptRequest(socket: GameSocket, requestId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const request = this.db.acceptFriendRequest(userId, cleanId(requestId));
      this.pushSnapshots(request.requesterUserId, request.addresseeUserId);
      this.notify(request.requesterUserId, "friends:requestAccepted", {
        type: "request_accepted",
        message: `${this.db.getSocialProfile(userId)?.displayName ?? "Your friend"} accepted your friend request.`
      });
      this.broadcastPresence(request.requesterUserId);
      this.broadcastPresence(request.addresseeUserId);
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  declineRequest(socket: GameSocket, requestId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const request = this.db.declineFriendRequest(userId, cleanId(requestId));
      this.pushSnapshots(request.requesterUserId, request.addresseeUserId);
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  cancelRequest(socket: GameSocket, requestId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const request = this.db.cancelFriendRequest(userId, cleanId(requestId));
      this.pushSnapshots(request.requesterUserId, request.addresseeUserId);
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  removeFriend(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const targetId = cleanId(profileId);
      this.db.removeFriend(userId, targetId);
      this.pushSnapshots(userId, targetId);
      this.io.to(this.socialRoom(targetId)).emit("friends:removed", { profileId: userId });
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  blockPlayer(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const targetId = cleanId(profileId);
      this.db.blockPlayer(userId, targetId);
      this.pushSnapshots(userId, targetId);
      this.io.to(this.socialRoom(targetId)).emit("friends:removed", { profileId: userId });
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  unblockPlayer(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      this.db.unblockPlayer(userId, cleanId(profileId));
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  inviteFriend(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const recipientId = cleanId(profileId);
      if (this.db.getRelationship(userId, recipientId) !== "friends") {
        throw new Error("Only friends can receive game invites.");
      }
      const recipientPresence = this.presenceFor(recipientId, userId);
      if (recipientPresence.status === "offline") throw new Error("Your friend is offline.");
      if (recipientPresence.status === "in_match" || recipientPresence.status === "in_tournament") {
        throw new Error(`${this.db.getSocialProfile(recipientId)?.displayName ?? "Your friend"} is currently in a match.`);
      }
      if (recipientPresence.status === "in_room" || recipientPresence.status === "in_lobby") {
        throw new Error(`${this.db.getSocialProfile(recipientId)?.displayName ?? "Your friend"} is already in another room.`);
      }

      let roomJoin: FriendActionResponse["roomJoin"];
      let roomCode = this.roomForSocket(socket.id)?.roomCode;
      if (roomCode) {
        const room = this.roomManager.getSocialRoomInfo(roomCode);
        if (!room?.joinable) throw new Error(room ? "This room cannot accept another player." : "This room has expired.");
      } else {
        const sender = this.db.getPlayerProfile(userId);
        if (!sender) throw new Error("Your player profile could not be loaded.");
        roomJoin = this.roomManager.createRoom({
          username: sender.displayName,
          avatar: sender.avatarId,
          avatarUrl: sender.photoUrl,
          profileFrameId: sender.profileFrameId,
          profileImageVisibility: sender.profileImageVisibility,
          level: sender.level,
          identityId: sender.id,
          profileId: sender.id,
          accountType: "registered",
          rankBadge: sender.rank,
          visibility: "private",
          settings: { maxPlayers: 6 }
        });
        if (!roomJoin.ok || !roomJoin.roomCode || !roomJoin.playerId) {
          throw new Error(roomJoin.error ?? "A private room could not be created.");
        }
        roomCode = roomJoin.roomCode;
        this.attachRoom(socket.id, roomJoin.roomCode, roomJoin.playerId);
      }

      const invite = this.db.createGameInvite(userId, recipientId, roomCode);
      const item = this.toGameInvite(invite, recipientId);
      this.pushSnapshots(userId, recipientId);
      this.notify(recipientId, "friends:invite", {
        type: "invite",
        message: `${this.db.getSocialProfile(userId)?.displayName ?? "A friend"} invited you to play Bhabhi Thulla.`,
        invite: item
      });
      this.syncSocket(socket.id);
      return { ok: true, roomCode, roomJoin, snapshot: this.snapshot(userId) };
    });
  }

  acceptInvite(socket: GameSocket, inviteId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const existing = this.db.getGameInvite(cleanId(inviteId));
      if (!existing || existing.recipientUserId !== userId || existing.status !== "pending" || existing.expiresAt <= Date.now()) {
        throw new Error("That invitation has expired or is no longer available.");
      }
      const room = this.roomManager.getSocialRoomInfo(existing.roomCode);
      if (!room) throw new Error("That room has expired.");
      if (!room.joinable) throw new Error(room.playerCount >= room.maxPlayers ? "Room is full." : "That match is no longer accepting players.");
      const invite = this.db.respondToGameInvite(userId, existing.id, "accepted");
      this.pushSnapshots(invite.senderUserId, invite.recipientUserId);
      this.notify(invite.senderUserId, "friends:inviteAccepted", {
        type: "invite_accepted",
        message: `${this.db.getSocialProfile(userId)?.displayName ?? "Your friend"} accepted your game invitation.`
      });
      return { ok: true, roomCode: invite.roomCode, snapshot: this.snapshot(userId) };
    });
  }

  declineInvite(socket: GameSocket, inviteId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const invite = this.db.respondToGameInvite(userId, cleanId(inviteId), "declined");
      this.pushSnapshots(invite.senderUserId, invite.recipientUserId);
      this.notify(invite.senderUserId, "friends:inviteDeclined", {
        type: "invite_declined",
        message: `${this.db.getSocialProfile(userId)?.displayName ?? "Your friend"} declined your game invitation.`
      });
      return { ok: true, snapshot: this.snapshot(userId) };
    });
  }

  joinFriend(socket: GameSocket, profileId: string): FriendActionResponse {
    return this.runAction(socket, (userId) => {
      const friendId = cleanId(profileId);
      if (this.db.getRelationship(userId, friendId) !== "friends") throw new Error("That player is not in your friends list.");
      const room = this.roomForUser(friendId);
      if (!room) throw new Error("Your friend is not in a joinable room.");
      if (room.visibility !== "public") throw new Error("That friend is at a private table. Ask them for an invitation.");
      if (!room.joinable) throw new Error(room.playerCount >= room.maxPlayers ? "Room is full." : "That match has locked late joins.");
      return { ok: true, roomCode: room.roomCode };
    });
  }

  setAway(socket: GameSocket, away: boolean) {
    const user = this.requireUser(socket.id);
    if (!user.ok) return user;
    if (away) this.awaySockets.add(socket.id);
    else this.awaySockets.delete(socket.id);
    this.broadcastPresence(user.userId);
    return { ok: true as const };
  }

  syncSocket(socketId: string): void {
    const userId = this.socketUsers.get(socketId);
    if (userId) this.broadcastPresence(userId);
  }

  refreshRoom(roomCode: string): void {
    const room = this.roomManager.getSocialRoomInfo(roomCode);
    for (const profileId of room?.registeredProfileIds ?? []) this.broadcastPresence(profileId);
  }

  refreshAllPresence(): void {
    for (const userId of this.userSockets.keys()) this.broadcastPresence(userId);
  }

  disconnect(socketId: string): void {
    this.detachSocket(socketId, true);
  }

  snapshot(userId: string): FriendsSnapshot {
    const friends = this.db.listFriendProfiles(userId).map((profile) => this.toSocialProfile(profile, userId));
    friends.sort(compareFriends);
    const requests = this.db.listFriendRequests(userId);
    const incomingRequests = requests
      .filter((request) => request.addresseeUserId === userId)
      .map((request) => this.toFriendRequest(request, userId));
    const outgoingRequests = requests
      .filter((request) => request.requesterUserId === userId)
      .map((request) => this.toFriendRequest(request, userId));
    const gameInvites = this.db.listPendingGameInvites(userId).map((invite) => this.toGameInvite(invite, userId));
    const recentPlayers = this.db.listRecentPlayers(userId).map((recent): RecentPlayerItem => ({
      id: recent.id,
      profile: recent.profileId
        ? this.db.getSocialProfile(recent.profileId)
          ? this.toSocialProfile(this.db.getSocialProfile(recent.profileId)!, userId)
          : undefined
        : undefined,
      displayName: recent.displayName,
      username: recent.username,
      avatarId: recent.avatarId,
      playedAt: recent.playedAt,
      result: recent.result,
      gameMode: recent.gameMode
    }));
    return {
      friends,
      incomingRequests,
      outgoingRequests,
      gameInvites,
      recentPlayers,
      onlineCount: friends.filter((friend) => friend.presence.status !== "offline").length
    };
  }

  private toSocialProfile(profile: SocialProfileRecord, viewerId: string): SocialPlayerProfile {
    const relationship = this.db.getRelationship(viewerId, profile.id);
    const canSeeImage = viewerId === profile.id || profile.profileImageVisibility === "everyone" || (
      profile.profileImageVisibility === "friends" && relationship === "friends"
    );
    return {
      id: profile.id,
      displayName: profile.displayName,
      username: profile.username,
      avatarId: canSeeImage ? profile.avatarId : "initials",
      selectedAvatarId: canSeeImage ? profile.avatarId : undefined,
      avatarUrl: canSeeImage ? profile.avatarUrl : undefined,
      photoUrl: canSeeImage ? profile.avatarUrl : undefined,
      profileFrameId: profile.profileFrameId,
      rank: profile.rank,
      level: profile.level,
      relationship,
      presence: this.presenceFor(profile.id, viewerId)
    };
  }

  private toFriendRequest(request: FriendshipRecord, viewerId: string): FriendRequestItem {
    const otherId = request.requesterUserId === viewerId ? request.addresseeUserId : request.requesterUserId;
    const profile = this.db.getSocialProfile(otherId);
    if (!profile) throw new Error("Friend request profile is missing.");
    return {
      id: request.id,
      direction: request.requesterUserId === viewerId ? "outgoing" : "incoming",
      profile: this.toSocialProfile(profile, viewerId),
      createdAt: request.createdAt
    };
  }

  private toGameInvite(invite: GameInviteRecord, viewerId: string): GameInviteItem {
    const sender = this.db.getSocialProfile(invite.senderUserId);
    const recipient = this.db.getSocialProfile(invite.recipientUserId);
    if (!sender || !recipient) throw new Error("Invitation profile is missing.");
    return {
      id: invite.id,
      sender: this.toSocialProfile(sender, viewerId),
      recipient: this.toSocialProfile(recipient, viewerId),
      status: invite.status,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt
    };
  }

  private presenceFor(profileId: string, viewerId: string): FriendPresence {
    const profile = this.db.getPlayerProfile(profileId);
    const socketIds = [...(this.userSockets.get(profileId) ?? [])].filter((socketId) => this.io.sockets.sockets.has(socketId));
    const candidates = socketIds.map((socketId) => this.presenceCandidate(socketId));
    let candidate = candidates.sort((first, second) => presenceWeight(second.status) - presenceWeight(first.status))[0];
    if (!candidate) {
      const reserved = this.roomManager.getReservedProfileRoom(profileId);
      if (reserved) {
        const tournament = reserved.room.roomMode === "tournament";
        candidate = {
          status: tournament ? "in_tournament" : "in_match",
          activity: reserved.connectionState === "disconnected"
            ? "In Match • Disconnected"
            : reserved.controlState === "temporary-bot"
              ? "Away • In Match"
              : "In Match",
          room: { ...reserved.room, joinable: false }
        };
      }
    }
    if (!candidate) {
      return { profileId, status: "offline", activity: "Offline", joinable: false, lastActiveAt: profile?.lastActiveAt ?? Date.now() };
    }
    const isFriend = viewerId === profileId || this.db.getRelationship(viewerId, profileId) === "friends";
    const canSeeActivity = profile?.preferences.activityVisibility === "everyone" ||
      (profile?.preferences.activityVisibility !== "nobody" && isFriend);
    return {
      profileId,
      status: candidate.status,
      activity: canSeeActivity ? candidate.activity : candidate.status === "offline" ? "Offline" : "Online",
      joinable: Boolean(canSeeActivity && candidate.room?.visibility === "public" && candidate.room.joinable),
      lastActiveAt: profile?.lastActiveAt ?? Date.now()
    };
  }

  private presenceCandidate(socketId: string): PresenceCandidate {
    if (this.awaySockets.has(socketId)) return { status: "away", activity: "Away" };
    const room = this.roomForSocket(socketId);
    if (!room) return { status: "online", activity: "Available to Play" };
    if (room.roomMode === "tournament") return { status: "in_tournament", activity: "Playing Tournament", room };
    if (room.status === "playing" || room.status === "round_over") {
      return { status: "in_match", activity: `Playing ${formatMode(room.roomMode)}`, room };
    }
    return {
      status: room.visibility === "private" ? "in_room" : "in_lobby",
      activity: room.visibility === "private" ? "In Private Room" : "In Lobby",
      room
    };
  }

  private roomForSocket(socketId: string): SocialRoomInfo | undefined {
    const seat = this.roomManager.getSocketSeat(socketId);
    return seat ? this.roomManager.getSocialRoomInfo(seat.roomCode) : undefined;
  }

  private roomForUser(userId: string): SocialRoomInfo | undefined {
    for (const socketId of this.userSockets.get(userId) ?? []) {
      const room = this.roomForSocket(socketId);
      if (room) return room;
    }
    return undefined;
  }

  private pushSnapshots(...userIds: string[]): void {
    for (const userId of new Set(userIds)) {
      const snapshot = this.snapshot(userId);
      this.rememberSnapshotPresence(userId, snapshot);
      this.io.to(this.socialRoom(userId)).emit("friends:snapshot", snapshot);
    }
  }

  private broadcastPresence(userId: string): void {
    for (const friendId of this.db.listFriendIds(userId)) {
      const presence = this.presenceFor(userId, friendId);
      this.io.to(this.socialRoom(friendId)).emit("friends:presence", {
        presence
      });
      const memoryKey = `${friendId}:${userId}`;
      const previous = this.presenceMemory.get(memoryKey);
      const preferences = this.db.getPlayerProfile(friendId)?.preferences;
      if (previous === "offline" && presence.status !== "offline" && preferences?.friendOnlineNotifications) {
        const notification: FriendNotification = {
          id: randomUUID(),
          type: "presence",
          message: `${this.db.getSocialProfile(userId)?.displayName ?? "A friend"} is online now.`,
          createdAt: Date.now()
        };
        this.io.to(this.socialRoom(friendId)).emit("friends:notification", notification);
      }
      this.presenceMemory.set(memoryKey, presence.status);
    }
  }

  private rememberSnapshotPresence(viewerId: string, snapshot: FriendsSnapshot): void {
    for (const friend of snapshot.friends) {
      this.presenceMemory.set(`${viewerId}:${friend.id}`, friend.presence.status);
    }
  }

  private notify(
    userId: string,
    event: "friends:request" | "friends:requestAccepted" | "friends:invite" | "friends:inviteAccepted" | "friends:inviteDeclined",
    notification: Omit<FriendNotification, "id" | "createdAt">
  ): void {
    const payload: FriendNotification = { ...notification, id: randomUUID(), createdAt: Date.now() };
    this.io.to(this.socialRoom(userId)).emit(event, payload);
    this.io.to(this.socialRoom(userId)).emit("friends:notification", payload);
  }

  private runAction(socket: GameSocket, action: (userId: string) => FriendActionResponse): FriendActionResponse {
    const user = this.requireUser(socket.id);
    if (!user.ok) return user;
    if (!this.consumeAction(socket.id, 1)) return { ok: false, error: "Too many social actions. Try again shortly." };
    try {
      return action(user.userId);
    } catch (error) {
      return { ok: false, error: errorMessage(error, "That social action could not be completed.") };
    }
  }

  private requireUser(socketId: string): { ok: true; userId: string } | { ok: false; error: string } {
    const userId = this.socketUsers.get(socketId);
    return userId ? { ok: true, userId } : { ok: false, error: "Sign in to use permanent friends." };
  }

  private consumeAction(socketId: string, weight: number): boolean {
    const now = Date.now();
    const bucket = this.actionBuckets.get(socketId);
    if (!bucket || bucket.resetAt <= now) {
      this.actionBuckets.set(socketId, { count: weight, resetAt: now + ACTION_WINDOW_MS });
      return true;
    }
    if (bucket.count + weight > ACTIONS_PER_WINDOW) return false;
    bucket.count += weight;
    return true;
  }

  private detachSocket(socketId: string, broadcast: boolean): void {
    const userId = this.socketUsers.get(socketId);
    if (!userId) return;
    this.socketUsers.delete(socketId);
    this.awaySockets.delete(socketId);
    this.actionBuckets.delete(socketId);
    const sockets = this.userSockets.get(userId);
    sockets?.delete(socketId);
    if (!sockets?.size) this.userSockets.delete(userId);
    if (broadcast) this.broadcastPresence(userId);
  }

  private socialRoom(userId: string): string {
    return `${SOCIAL_ROOM_PREFIX}${userId}`;
  }
}

function cleanId(value: string): string {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!cleaned) throw new Error("That player or request is invalid.");
  return cleaned;
}

function compareFriends(first: SocialPlayerProfile, second: SocialPlayerProfile): number {
  const presence = presenceWeight(second.presence.status) - presenceWeight(first.presence.status);
  return presence || first.displayName.localeCompare(second.displayName);
}

function presenceWeight(status: FriendPresence["status"]): number {
  if (status === "online" || status === "in_lobby") return 4;
  if (status === "away" || status === "in_room") return 3;
  if (status === "in_match" || status === "in_tournament") return 2;
  return 0;
}

function formatMode(mode: SocialRoomInfo["roomMode"]): string {
  if (!mode || mode === "quick") return "Classic";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

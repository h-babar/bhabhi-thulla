import type { RoomJoinResponse } from "./socket.js";

export type PresenceStatus =
  | "online"
  | "in_lobby"
  | "in_room"
  | "in_match"
  | "in_tournament"
  | "away"
  | "offline";

export type FriendRelationship =
  | "none"
  | "request_sent"
  | "request_received"
  | "friends"
  | "blocked";

export type ActivityVisibility = "everyone" | "friends" | "nobody";

export interface FriendPresence {
  profileId: string;
  status: PresenceStatus;
  activity: string;
  joinable: boolean;
  lastActiveAt: number;
}

export interface SocialPlayerProfile {
  id: string;
  displayName: string;
  username: string;
  avatarId: string;
  selectedAvatarId?: string;
  avatarUrl?: string;
  photoUrl?: string;
  profileFrameId: string;
  rank: string;
  level: number;
  relationship: FriendRelationship;
  presence: FriendPresence;
}

export interface FriendRequestItem {
  id: string;
  direction: "incoming" | "outgoing";
  profile: SocialPlayerProfile;
  createdAt: number;
}

export type GameInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export interface GameInviteItem {
  id: string;
  sender: SocialPlayerProfile;
  recipient: SocialPlayerProfile;
  status: GameInviteStatus;
  createdAt: number;
  expiresAt: number;
}

export interface RecentPlayerItem {
  id: string;
  profile?: SocialPlayerProfile;
  displayName: string;
  username?: string;
  avatarId: string;
  playedAt: number;
  result: "win" | "loss" | "completed";
  gameMode: string;
}

export interface FriendsSnapshot {
  friends: SocialPlayerProfile[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  gameInvites: GameInviteItem[];
  recentPlayers: RecentPlayerItem[];
  onlineCount: number;
}

export interface FriendsAuthPayload {
  authToken: string;
}

export interface FriendsAuthResponse {
  ok: boolean;
  snapshot?: FriendsSnapshot;
  error?: string;
}

export interface FriendTargetPayload {
  profileId: string;
}

export interface FriendRequestActionPayload {
  requestId: string;
}

export interface FriendInviteActionPayload {
  inviteId: string;
}

export interface FriendSearchPayload {
  query: string;
}

export interface FriendSearchResponse {
  ok: boolean;
  players?: SocialPlayerProfile[];
  error?: string;
}

export interface FriendActionResponse {
  ok: boolean;
  snapshot?: FriendsSnapshot;
  roomCode?: string;
  roomJoin?: RoomJoinResponse;
  error?: string;
}

export interface FriendNotification {
  id: string;
  type: "request" | "request_accepted" | "invite" | "invite_accepted" | "invite_declined" | "presence";
  message: string;
  createdAt: number;
  invite?: GameInviteItem;
}

export interface FriendPresencePayload {
  presence: FriendPresence;
}

export interface FriendsAwayPayload {
  away: boolean;
}

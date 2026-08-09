import type {
  FriendActionResponse,
  FriendNotification,
  FriendsSnapshot,
  SocialPlayerProfile
} from "@getaway-cards/shared";
import { create } from "zustand";
import { getGameSocket, type GameSocket, useGameStore } from "./gameStore.js";

export type FriendsTab = "online" | "all" | "requests" | "add";

interface FriendsStore {
  open: boolean;
  tab: FriendsTab;
  authenticated: boolean;
  loading: boolean;
  actionId?: string;
  error?: string;
  snapshot: FriendsSnapshot;
  searchResults: SocialPlayerProfile[];
  notifications: FriendNotification[];
  openPanel: (tab?: FriendsTab) => void;
  closePanel: () => void;
  setTab: (tab: FriendsTab) => void;
  authenticate: (authToken: string) => void;
  reset: () => void;
  refresh: () => void;
  search: (query: string) => void;
  sendRequest: (profileId: string) => void;
  acceptRequest: (requestId: string) => void;
  declineRequest: (requestId: string) => void;
  cancelRequest: (requestId: string) => void;
  removeFriend: (profileId: string) => void;
  blockPlayer: (profileId: string) => void;
  unblockPlayer: (profileId: string) => void;
  inviteFriend: (profileId: string) => void;
  acceptInvite: (inviteId: string) => void;
  declineInvite: (inviteId: string) => void;
  joinFriend: (profileId: string) => void;
  dismissNotification: (notificationId: string) => void;
  clearError: () => void;
  setAway: (away: boolean) => void;
}

const emptySnapshot: FriendsSnapshot = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  gameInvites: [],
  recentPlayers: [],
  onlineCount: 0
};

let installedSocket: GameSocket | undefined;

export const useFriendsStore = create<FriendsStore>((set, get) => {
  const socketOrError = (): GameSocket | undefined => {
    const socket = getGameSocket();
    if (!socket?.connected) {
      set({ error: "The social service is reconnecting. Try again in a moment." });
      return undefined;
    }
    return socket;
  };

  const installListeners = (socket: GameSocket): void => {
    if (installedSocket === socket) return;
    installedSocket = socket;
    socket.on("friends:snapshot", (snapshot) => set({ snapshot, authenticated: true }));
    socket.on("friends:presence", ({ presence }) => {
      set((current) => {
        const friends = current.snapshot.friends
          .map((friend) => friend.id === presence.profileId ? { ...friend, presence } : friend)
          .sort(compareFriends);
        return {
          snapshot: {
            ...current.snapshot,
            friends,
            onlineCount: friends.filter((friend) => friend.presence.status !== "offline").length
          }
        };
      });
    });
    socket.on("friends:notification", (notification) => {
      set((current) => ({
        notifications: current.notifications.some((item) => item.id === notification.id)
          ? current.notifications
          : [notification, ...current.notifications].slice(0, 6)
      }));
    });
    socket.on("friends:removed", () => get().refresh());
  };

  const action = (
    event:
      | "friends:request"
      | "friends:acceptRequest"
      | "friends:declineRequest"
      | "friends:cancelRequest"
      | "friends:remove"
      | "friends:block"
      | "friends:unblock"
      | "friends:invite"
      | "friends:acceptInvite"
      | "friends:declineInvite"
      | "friends:joinFriend",
    payload: { profileId: string } | { requestId: string } | { inviteId: string },
    actionId: string,
    onSuccess?: (response: FriendActionResponse) => void
  ): void => {
    const socket = socketOrError();
    if (!socket) return;
    set({ actionId, error: undefined });
    const callback = (response: FriendActionResponse) => {
      set({
        actionId: undefined,
        snapshot: response.snapshot ?? get().snapshot,
        error: response.ok ? undefined : response.error ?? "That action could not be completed."
      });
      if (response.ok) onSuccess?.(response);
    };
    if (event === "friends:request" || event === "friends:remove" || event === "friends:block" || event === "friends:unblock" || event === "friends:invite" || event === "friends:joinFriend") {
      socket.emit(event, payload as { profileId: string }, callback);
    } else if (event === "friends:acceptRequest" || event === "friends:declineRequest" || event === "friends:cancelRequest") {
      socket.emit(event, payload as { requestId: string }, callback);
    } else {
      socket.emit(event, payload as { inviteId: string }, callback);
    }
  };

  return {
    open: false,
    tab: "online",
    authenticated: false,
    loading: false,
    snapshot: emptySnapshot,
    searchResults: [],
    notifications: [],
    openPanel: (tab = "online") => set({ open: true, tab, error: undefined }),
    closePanel: () => set({ open: false, error: undefined }),
    setTab: (tab) => set({ tab, error: undefined }),
    authenticate: (authToken) => {
      const socket = getGameSocket();
      if (!socket?.connected) return;
      installListeners(socket);
      set({ loading: true, error: undefined });
      socket.emit("friends:authenticate", { authToken }, (response) => {
        set({
          loading: false,
          authenticated: response.ok,
          snapshot: response.snapshot ?? emptySnapshot,
          error: response.ok ? undefined : response.error ?? "Friends could not be loaded."
        });
      });
    },
    reset: () => {
      const socket = getGameSocket();
      if (socket?.connected && get().authenticated) socket.emit("friends:disconnect", () => undefined);
      set({ authenticated: false, snapshot: emptySnapshot, searchResults: [], notifications: [], error: undefined });
    },
    refresh: () => {
      const socket = socketOrError();
      if (!socket || !get().authenticated) return;
      socket.emit("friends:refresh", (response) => {
        if (response.ok && response.snapshot) set({ snapshot: response.snapshot });
      });
    },
    search: (query) => {
      const socket = socketOrError();
      if (!socket) return;
      const cleanQuery = query.trim();
      if (cleanQuery.length < 2) {
        set({ searchResults: [], error: undefined });
        return;
      }
      set({ loading: true, error: undefined });
      socket.emit("friends:search", { query: cleanQuery }, (response) => {
        set({ loading: false, searchResults: response.players ?? [], error: response.ok ? undefined : response.error });
      });
    },
    sendRequest: (profileId) => action("friends:request", { profileId }, profileId, () => {
      set((current) => ({
        searchResults: current.searchResults.map((profile) =>
          profile.id === profileId ? { ...profile, relationship: "request_sent" } : profile
        )
      }));
    }),
    acceptRequest: (requestId) => action("friends:acceptRequest", { requestId }, requestId),
    declineRequest: (requestId) => action("friends:declineRequest", { requestId }, requestId),
    cancelRequest: (requestId) => action("friends:cancelRequest", { requestId }, requestId),
    removeFriend: (profileId) => action("friends:remove", { profileId }, profileId),
    blockPlayer: (profileId) => action("friends:block", { profileId }, profileId),
    unblockPlayer: (profileId) => action("friends:unblock", { profileId }, profileId),
    inviteFriend: (profileId) => action("friends:invite", { profileId }, profileId, (response) => {
      if (response.roomJoin) useGameStore.getState().enterRoomFromSocial(response.roomJoin);
    }),
    acceptInvite: (inviteId) => action("friends:acceptInvite", { inviteId }, inviteId, (response) => {
      if (response.roomCode) useGameStore.getState().joinRoom(response.roomCode);
      set((current) => ({ notifications: current.notifications.filter((item) => item.invite?.id !== inviteId) }));
    }),
    declineInvite: (inviteId) => action("friends:declineInvite", { inviteId }, inviteId, () => {
      set((current) => ({ notifications: current.notifications.filter((item) => item.invite?.id !== inviteId) }));
    }),
    joinFriend: (profileId) => action("friends:joinFriend", { profileId }, profileId, (response) => {
      if (response.roomCode) useGameStore.getState().joinRoom(response.roomCode);
    }),
    dismissNotification: (notificationId) => set((current) => ({
      notifications: current.notifications.filter((notification) => notification.id !== notificationId)
    })),
    clearError: () => set({ error: undefined }),
    setAway: (away) => {
      const socket = getGameSocket();
      if (socket?.connected && get().authenticated) socket.emit("friends:setAway", { away }, () => undefined);
    }
  };
});

function compareFriends(first: SocialPlayerProfile, second: SocialPlayerProfile): number {
  const weight = (profile: SocialPlayerProfile) => {
    if (profile.presence.status === "online" || profile.presence.status === "in_lobby") return 3;
    if (profile.presence.status === "offline") return 0;
    return 2;
  };
  return weight(second) - weight(first) || first.displayName.localeCompare(second.displayName);
}

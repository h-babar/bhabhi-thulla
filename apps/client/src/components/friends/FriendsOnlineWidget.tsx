import { ChevronRight, Gamepad2, UsersRound } from "lucide-react";
import { useAuthStore } from "../../store/authStore.js";
import { useFriendsStore } from "../../store/friendsStore.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";
import { PresenceIndicator } from "./PresenceIndicator.js";

export function FriendsOnlineWidget() {
  const registered = useAuthStore((state) => state.status === "registered");
  const snapshot = useFriendsStore((state) => state.snapshot);
  const openPanel = useFriendsStore((state) => state.openPanel);
  const invite = useFriendsStore((state) => state.inviteFriend);
  if (!registered) return null;
  const online = snapshot.friends.filter((friend) => friend.presence.status !== "offline").slice(0, 3);
  return (
    <section className="home-friends-widget">
      <header><span><UsersRound size={18} /></span><div><p>Friends online</p><h3>{snapshot.onlineCount} available now</h3></div><button onClick={() => openPanel("online")}>View all <ChevronRight size={15} /></button></header>
      <div>{online.map((friend) => <article key={friend.id}><PlayerAvatar name={friend.displayName} avatarId={friend.avatarId} photoUrl={friend.photoUrl} size="sm" /><div><strong>{friend.displayName}</strong><small>{friend.presence.activity}</small></div><PresenceIndicator status={friend.presence.status} label={false} />{friend.presence.status === "online" ? <button onClick={() => invite(friend.id)} aria-label={`Invite ${friend.displayName}`}><Gamepad2 size={16} /></button> : null}</article>)}{online.length === 0 ? <p className="home-friends-empty">No friends online. Add recent players to build your crew.</p> : null}</div>
    </section>
  );
}

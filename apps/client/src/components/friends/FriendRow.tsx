import type { SocialPlayerProfile } from "@getaway-cards/shared";
import { Ban, Gamepad2, LogIn, MoreHorizontal, UserMinus } from "lucide-react";
import { useState } from "react";
import { useFriendsStore } from "../../store/friendsStore.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";
import { PresenceIndicator } from "./PresenceIndicator.js";

export function FriendRow({ friend }: { friend: SocialPlayerProfile }) {
  const inviteFriend = useFriendsStore((state) => state.inviteFriend);
  const joinFriend = useFriendsStore((state) => state.joinFriend);
  const removeFriend = useFriendsStore((state) => state.removeFriend);
  const blockPlayer = useFriendsStore((state) => state.blockPlayer);
  const actionId = useFriendsStore((state) => state.actionId);
  const [menuOpen, setMenuOpen] = useState(false);
  const available = friend.presence.status === "online" || friend.presence.status === "away";
  return (
    <article className="friend-row">
      <div className="friend-avatar-wrap">
        <PlayerAvatar name={friend.displayName} avatarId={friend.avatarId} photoUrl={friend.photoUrl} frame={friend.profileFrameId} size="md" />
        <PresenceIndicator status={friend.presence.status} label={false} />
      </div>
      <div className="friend-row-copy">
        <div><strong>{friend.displayName}</strong><span>@{friend.username}</span></div>
        <small><b>{friend.rank}</b> Level {friend.level}</small>
        <p>{friend.presence.activity}</p>
      </div>
      <div className="friend-row-actions">
        {friend.presence.joinable ? (
          <button className="friend-action is-primary" onClick={() => joinFriend(friend.id)} disabled={actionId === friend.id}>
            <LogIn size={16} /> Join
          </button>
        ) : available ? (
          <button className="friend-action is-primary" onClick={() => inviteFriend(friend.id)} disabled={actionId === friend.id}>
            <Gamepad2 size={16} /> Invite
          </button>
        ) : null}
        <div className="friend-more">
          <button aria-label={`More actions for ${friend.displayName}`} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>
          {menuOpen ? (
            <div className="friend-more-menu">
              <button onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Remove ${friend.displayName} from your friends?`)) removeFriend(friend.id);
              }}><UserMinus size={15} /> Remove friend</button>
              <button className="is-danger" onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Block ${friend.displayName}? They will not be able to contact or invite you.`)) blockPlayer(friend.id);
              }}><Ban size={15} /> Block player</button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

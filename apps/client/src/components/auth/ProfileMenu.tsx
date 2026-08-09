import { Award, ChevronDown, History, LogOut, Save, Settings, UserRound, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { PlayerAvatar } from "./PlayerAvatar.js";
import { useGameStore } from "../../store/gameStore.js";
import { useFriendsStore } from "../../store/friendsStore.js";

interface ProfileMenuProps {
  compact?: boolean;
  onSettings?: () => void;
}

export function ProfileMenu({ compact = false, onSettings }: ProfileMenuProps) {
  const guest = useAuthStore((state) => state.guest);
  const profile = useAuthStore((state) => state.profile);
  const openProfile = useAuthStore((state) => state.openProfile);
  const openUpgrade = useAuthStore((state) => state.openUpgrade);
  const logout = useAuthStore((state) => state.logout);
  const changePlayer = useAuthStore((state) => state.changePlayer);
  const leaveRoom = useGameStore((state) => state.leaveRoom);
  const openFriends = useFriendsStore((state) => state.openPanel);
  const friendBadge = useFriendsStore((state) => state.snapshot.incomingRequests.length + state.snapshot.gameInvites.length);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = profile ?? guest;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!current) return null;
  const runMenuAction = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };
  const viewProfile = () => runMenuAction(openProfile);

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <button className={`profile-menu-trigger ${compact ? "is-compact" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <PlayerAvatar name={current.displayName} avatarId={current.avatarId} photoUrl={profile?.photoUrl} frame={profile?.profileFrameId} size="sm" />
        {!compact ? <span><strong>{current.displayName}</strong><small>{profile ? `@${profile.username}` : "Guest"}</small></span> : null}
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="profile-menu-popover">
          <header>
            <PlayerAvatar name={current.displayName} avatarId={current.avatarId} photoUrl={profile?.photoUrl} frame={profile?.profileFrameId} size="md" />
            <div><strong>{current.displayName}</strong><span>{profile ? `@${profile.username}` : "Guest account"}</span></div>
            {profile ? <b>{profile.rank}</b> : <b>Guest</b>}
          </header>
          <button onClick={viewProfile}><UserRound size={17} /> View profile</button>
          <button onClick={() => runMenuAction(() => openFriends(friendBadge ? "requests" : "online"))}><UsersRound size={17} /> Friends{friendBadge ? <b className="profile-friends-badge">{friendBadge}</b> : null}</button>
          {profile ? <button onClick={viewProfile}><History size={17} /> Match history</button> : null}
          {profile ? <button onClick={viewProfile}><Award size={17} /> Achievements</button> : null}
          {!profile ? <button className="is-accent" onClick={() => runMenuAction(openUpgrade)}><Save size={17} /> Save progress with Google</button> : null}
          {onSettings ? <button onClick={() => runMenuAction(onSettings)}><Settings size={17} /> Settings</button> : null}
          <div className="profile-menu-divider" />
          <button onClick={() => runMenuAction(() => { leaveRoom(); void (profile ? logout() : changePlayer()); })}><LogOut size={17} /> {profile ? "Log out" : "Change player"}</button>
        </div>
      ) : null}
    </div>
  );
}

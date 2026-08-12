import type { FriendRequestItem, SocialPlayerProfile } from "@getaway-cards/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, Gamepad2, Search, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { type FriendsTab, useFriendsStore } from "../../store/friendsStore.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";
import { Modal } from "../Modal.js";
import { FriendRow } from "./FriendRow.js";
import { PresenceIndicator } from "./PresenceIndicator.js";

const tabs: Array<{ id: FriendsTab; label: string }> = [
  { id: "online", label: "Online" },
  { id: "all", label: "All Friends" },
  { id: "requests", label: "Requests" },
  { id: "add", label: "Add Friend" }
];

export function FriendsPanel() {
  const open = useFriendsStore((state) => state.open);
  const tab = useFriendsStore((state) => state.tab);
  const closePanel = useFriendsStore((state) => state.closePanel);
  const setTab = useFriendsStore((state) => state.setTab);
  const snapshot = useFriendsStore((state) => state.snapshot);
  const error = useFriendsStore((state) => state.error);
  const registered = useAuthStore((state) => state.status === "registered");
  const openUpgrade = useAuthStore((state) => state.openUpgrade);
  const requestBadge = snapshot.incomingRequests.length + snapshot.gameInvites.length;
  return (
    <Modal open={open} onClose={closePanel} title="Friends" eyebrow={`${snapshot.onlineCount} online now`} wide className="friends-modal">
      {!registered ? (
        <GuestFriendsGate onUpgrade={() => { closePanel(); openUpgrade(); }} />
      ) : (
        <div className="friends-panel-layout">
          <nav className="friends-tabs" aria-label="Friends sections">
            {tabs.map((item) => (
              <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>
                {item.label}
                {item.id === "requests" && requestBadge > 0 ? <b>{requestBadge}</b> : null}
              </button>
            ))}
          </nav>
          {error ? <div className="friends-error">{error}</div> : null}
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="friends-tab-content" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              {tab === "online" ? <FriendList friends={snapshot.friends.filter((friend) => friend.presence.status !== "offline")} empty="No friends are online yet." /> : null}
              {tab === "all" ? <AllFriends /> : null}
              {tab === "requests" ? <FriendRequestList /> : null}
              {tab === "add" ? <AddFriendSearch /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </Modal>
  );
}

function FriendList({ friends, empty }: { friends: SocialPlayerProfile[]; empty: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => friends.filter((friend) => `${friend.displayName} ${friend.username}`.toLowerCase().includes(query.toLowerCase())), [friends, query]);
  return (
    <section>
      {friends.length > 6 ? <label className="friends-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search friends" /></label> : null}
      <div className="friend-list">
        {filtered.map((friend) => <FriendRow key={friend.id} friend={friend} />)}
        {filtered.length === 0 ? <EmptyFriends icon={<UsersRound />} text={empty} /> : null}
      </div>
    </section>
  );
}

function AllFriends() {
  const friends = useFriendsStore((state) => state.snapshot.friends);
  const profile = useAuthStore((state) => state.profile);
  const updateRegistered = useAuthStore((state) => state.updateRegistered);
  return (
    <div className="friends-all-layout">
      <FriendList friends={friends} empty="Build your table crew from Add Friend or Recent Players." />
      <section className="friend-privacy-card">
        <ShieldCheck size={19} />
        <div><strong>Activity privacy</strong><small>Choose who can see detailed room and match activity.</small></div>
        <select
          value={profile?.preferences.activityVisibility ?? "friends"}
          onChange={(event) => void updateRegistered({ preferences: { activityVisibility: event.target.value as "everyone" | "friends" | "nobody" } })}
          aria-label="Who can see game activity"
        >
          <option value="everyone">Everyone</option>
          <option value="friends">Friends only</option>
          <option value="nobody">Nobody</option>
        </select>
      </section>
      <label className="friend-online-toggle">
        <span><strong>Friend online notifications</strong><small>Show a quiet notice when a friend becomes available.</small></span>
        <input
          type="checkbox"
          checked={profile?.preferences.friendOnlineNotifications ?? false}
          onChange={(event) => void updateRegistered({ preferences: { friendOnlineNotifications: event.target.checked } })}
        />
      </label>
    </div>
  );
}

function FriendRequestList() {
  const snapshot = useFriendsStore((state) => state.snapshot);
  const accept = useFriendsStore((state) => state.acceptRequest);
  const decline = useFriendsStore((state) => state.declineRequest);
  const cancel = useFriendsStore((state) => state.cancelRequest);
  const acceptInvite = useFriendsStore((state) => state.acceptInvite);
  const declineInvite = useFriendsStore((state) => state.declineInvite);
  return (
    <div className="friend-request-sections">
      {snapshot.gameInvites.length > 0 ? (
        <section><h3>Game invitations</h3>{snapshot.gameInvites.map((invite) => (
          <article className="friend-request-card is-invite" key={invite.id}>
            <PlayerAvatar name={invite.sender.displayName} avatarId={invite.sender.selectedAvatarId ?? invite.sender.avatarId} photoUrl={invite.sender.avatarUrl ?? invite.sender.photoUrl} frame={invite.sender.profileFrameId} size="md" />
            <div><strong>{invite.sender.displayName}</strong><span>Invited you to a private table</span><small><Clock3 size={13} /> Expires shortly</small></div>
            <div><button className="is-accept" onClick={() => acceptInvite(invite.id)}><Gamepad2 size={15} /> Join</button><button onClick={() => declineInvite(invite.id)}>Decline</button></div>
          </article>
        ))}</section>
      ) : null}
      <RequestSection title="Incoming" requests={snapshot.incomingRequests} onPrimary={accept} onSecondary={decline} />
      <RequestSection title="Sent" requests={snapshot.outgoingRequests} onSecondary={cancel} />
      {snapshot.incomingRequests.length + snapshot.outgoingRequests.length + snapshot.gameInvites.length === 0 ? <EmptyFriends icon={<Check />} text="You are all caught up." /> : null}
    </div>
  );
}

function RequestSection({ title, requests, onPrimary, onSecondary }: { title: string; requests: FriendRequestItem[]; onPrimary?: (id: string) => void; onSecondary: (id: string) => void }) {
  if (!requests.length) return null;
  return <section><h3>{title}</h3>{requests.map((request) => (
    <article className="friend-request-card" key={request.id}>
      <PlayerAvatar name={request.profile.displayName} avatarId={request.profile.selectedAvatarId ?? request.profile.avatarId} photoUrl={request.profile.avatarUrl ?? request.profile.photoUrl} frame={request.profile.profileFrameId} size="md" />
      <div><strong>{request.profile.displayName}</strong><span>@{request.profile.username}</span><small>{request.profile.rank} - Level {request.profile.level}</small></div>
      <div>{onPrimary ? <button className="is-accept" onClick={() => onPrimary(request.id)}>Accept</button> : <em>Pending</em>}<button onClick={() => onSecondary(request.id)}>{onPrimary ? "Decline" : "Cancel"}</button></div>
    </article>
  ))}</section>;
}

function AddFriendSearch() {
  const [query, setQuery] = useState("");
  const search = useFriendsStore((state) => state.search);
  const results = useFriendsStore((state) => state.searchResults);
  const recent = useFriendsStore((state) => state.snapshot.recentPlayers);
  useEffect(() => {
    const timer = window.setTimeout(() => search(query), 300);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  return (
    <div className="add-friend-layout">
      <label className="friends-search is-large"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username or player ID" autoFocus /></label>
      {query.trim().length >= 2 ? <div className="friend-search-results">{results.map((profile) => <SearchResult key={profile.id} profile={profile} />)}{results.length === 0 ? <p>No matching public player profiles.</p> : null}</div> : null}
      <section className="recent-players"><h3>Recent Players</h3>{recent.length ? recent.map((item) => item.profile ? <SearchResult key={item.id} profile={item.profile} meta={`${item.result} - ${new Date(item.playedAt).toLocaleDateString()}`} /> : null) : <EmptyFriends icon={<Clock3 />} text="Players from completed multiplayer matches will appear here." />}</section>
    </div>
  );
}

function SearchResult({ profile, meta }: { profile: SocialPlayerProfile; meta?: string }) {
  const sendRequest = useFriendsStore((state) => state.sendRequest);
  const accept = useFriendsStore((state) => state.acceptRequest);
  const request = useFriendsStore((state) => state.snapshot.incomingRequests.find((item) => item.profile.id === profile.id));
  return (
    <article className="friend-search-row">
      <PlayerAvatar name={profile.displayName} avatarId={profile.selectedAvatarId ?? profile.avatarId} photoUrl={profile.avatarUrl ?? profile.photoUrl} frame={profile.profileFrameId} size="md" onlineState={profile.presence.status === "in_match" || profile.presence.status === "in_tournament" ? "busy" : profile.presence.status === "online" ? "online" : "offline"} />
      <div><strong>{profile.displayName}</strong><span>@{profile.username}</span><small>{meta ?? `${profile.rank} - Level ${profile.level}`}</small></div>
      <PresenceIndicator status={profile.presence.status} label={false} />
      {profile.relationship === "none" ? <button onClick={() => sendRequest(profile.id)}><UserPlus size={16} /> Add Friend</button> : null}
      {profile.relationship === "request_sent" ? <button disabled><Clock3 size={16} /> Request Sent</button> : null}
      {profile.relationship === "request_received" && request ? <button onClick={() => accept(request.id)}><Check size={16} /> Accept</button> : null}
      {profile.relationship === "friends" ? <button disabled><Check size={16} /> Friends</button> : null}
    </article>
  );
}

function EmptyFriends({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="friends-empty"><span>{icon}</span><p>{text}</p></div>;
}

function GuestFriendsGate({ onUpgrade }: { onUpgrade: () => void }) {
  return <div className="guest-friends-gate"><span><UsersRound size={30} /></span><h3>Keep your table crew</h3><p>Create a free profile to add friends and play with them again later. Guest gameplay stays available.</p><button onClick={onUpgrade}>Continue with Google</button><small>Your email is never shown in player search.</small></div>;
}

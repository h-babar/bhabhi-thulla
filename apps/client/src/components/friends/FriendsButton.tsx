import { UsersRound } from "lucide-react";
import { useAuthStore } from "../../store/authStore.js";
import { type FriendsTab, useFriendsStore } from "../../store/friendsStore.js";

interface FriendsButtonProps {
  compact?: boolean;
  className?: string;
  label?: string;
  openTab?: FriendsTab;
}

export function FriendsButton({ compact = false, className = "", label = "Friends", openTab }: FriendsButtonProps) {
  const registered = useAuthStore((state) => state.status === "registered");
  const snapshot = useFriendsStore((state) => state.snapshot);
  const openPanel = useFriendsStore((state) => state.openPanel);
  const badge = snapshot.incomingRequests.length + snapshot.gameInvites.length;
  return (
    <button
      type="button"
      className={`friends-button ${compact ? "is-compact" : ""} ${className}`}
      onClick={() => openPanel(openTab ?? (badge ? "requests" : "online"))}
      aria-label={`${label}${registered ? `, ${snapshot.onlineCount} online` : ""}`}
    >
      <UsersRound size={compact ? 18 : 19} />
      {!compact ? <span>{label} <small>{registered ? `${snapshot.onlineCount} online` : "Social"}</small></span> : null}
      {badge > 0 ? <b>{Math.min(99, badge)}</b> : null}
    </button>
  );
}

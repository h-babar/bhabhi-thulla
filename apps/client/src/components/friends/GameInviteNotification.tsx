import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, X } from "lucide-react";
import { useEffect } from "react";
import { useFriendsStore } from "../../store/friendsStore.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";

export function GameInviteNotification() {
  const notifications = useFriendsStore((state) => state.notifications);
  const acceptInvite = useFriendsStore((state) => state.acceptInvite);
  const declineInvite = useFriendsStore((state) => state.declineInvite);
  const dismiss = useFriendsStore((state) => state.dismissNotification);
  const error = useFriendsStore((state) => state.error);
  const clearError = useFriendsStore((state) => state.clearError);
  const notification = notifications.find((item) => item.type === "invite" && item.invite);
  const notice = notifications.find((item) => item.type !== "invite");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dismiss(notice.id), 5_000);
    return () => window.clearTimeout(timer);
  }, [dismiss, notice]);
  return <><AnimatePresence>{notification?.invite ? (
    <motion.aside className="game-invite-toast" initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}>
      <button className="game-invite-close" onClick={() => dismiss(notification.id)} aria-label="Dismiss invitation"><X size={15} /></button>
      <PlayerAvatar name={notification.invite.sender.displayName} avatarId={notification.invite.sender.selectedAvatarId ?? notification.invite.sender.avatarId} photoUrl={notification.invite.sender.avatarUrl ?? notification.invite.sender.photoUrl} frame={notification.invite.sender.profileFrameId} size="md" onlineState="online" />
      <div><small>Game invitation</small><strong>{notification.invite.sender.displayName}</strong><p>invited you to play Bhabhi Thulla</p></div>
      <button className="is-join" onClick={() => acceptInvite(notification.invite!.id)}><Gamepad2 size={16} /> Join</button>
      <button onClick={() => declineInvite(notification.invite!.id)}>Decline</button>
    </motion.aside>
  ) : null}</AnimatePresence><AnimatePresence>{error || notice ? (
    <motion.aside className={`social-notice-toast ${error ? "is-error" : ""}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
      <span>{error ?? notice?.message}</span>
      <button onClick={() => error ? clearError() : notice && dismiss(notice.id)} aria-label="Dismiss social notification"><X size={15} /></button>
    </motion.aside>
  ) : null}</AnimatePresence></>;
}

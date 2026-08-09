import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { useFriendsStore } from "../../store/friendsStore.js";
import { useGameStore } from "../../store/gameStore.js";
import { FriendsPanel } from "./FriendsPanel.js";
import { GameInviteNotification } from "./GameInviteNotification.js";

export function FriendsProvider({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const idToken = useAuthStore((state) => state.idToken);
  const socketStatus = useGameStore((state) => state.socketStatus);
  const authenticate = useFriendsStore((state) => state.authenticate);
  const reset = useFriendsStore((state) => state.reset);
  const setAway = useFriendsStore((state) => state.setAway);

  useEffect(() => {
    if (status === "registered" && idToken && socketStatus === "online") authenticate(idToken);
    if (status !== "registered") reset();
  }, [authenticate, idToken, reset, socketStatus, status]);

  useEffect(() => {
    const update = () => setAway(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, [setAway]);

  return <>{children}<FriendsPanel /><GameInviteNotification /></>;
}

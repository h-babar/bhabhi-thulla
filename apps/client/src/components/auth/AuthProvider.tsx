import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { useGameStore } from "../../store/gameStore.js";
import { GuestUpgradeModal } from "./GuestUpgradeModal.js";
import { LoginPanel } from "./LoginPanel.js";
import { ProfilePage } from "./ProfilePage.js";
import { AlertTriangle, X } from "lucide-react";

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);
  const status = useAuthStore((state) => state.status);
  const guest = useAuthStore((state) => state.guest);
  const profile = useAuthStore((state) => state.profile);
  const recordGuestMatch = useAuthStore((state) => state.recordGuestMatch);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const gameState = useGameStore((state) => state.state);
  const playerId = useGameStore((state) => state.playerId);
  const recordedMatchRef = useRef<string | undefined>(undefined);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    if (!guest || status !== "guest" || gameState?.status !== "game_over" || !playerId) return;
    const matchKey = `${gameState.roomCode}:${gameState.updatedAt}`;
    if (recordedMatchRef.current === matchKey) return;
    recordedMatchRef.current = matchKey;
    const tricksWon = gameState.history.filter(
      (event) => event.playerId === playerId && event.type === "play" && event.message.toLowerCase().includes("cleared")
    ).length;
    recordGuestMatch({
      won: gameState.championId ? gameState.championId === playerId : gameState.bhabhiId !== playerId,
      wasBhabhi: gameState.bhabhiId === playerId,
      tricksWon,
      tournamentWin: gameState.tournament?.status === "won"
    });
  }, [gameState, guest, playerId, recordGuestMatch, status]);

  const hasIdentity = (status === "guest" && guest) || (status === "registered" && profile);
  return (
    <>
      {hasIdentity ? children : <LoginPanel />}
      <ProfilePage />
      <GuestUpgradeModal />
      {hasIdentity && error ? (
        <div className="auth-global-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss account error"><X size={16} /></button>
        </div>
      ) : null}
    </>
  );
}

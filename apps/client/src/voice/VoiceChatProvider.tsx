import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getGameSocket, useGameStore } from "../store/gameStore.js";
import {
  VoiceChatManager,
  type VoicePreferences,
  type VoiceSnapshot
} from "./VoiceChatManager.js";

interface VoiceContextValue extends VoiceSnapshot {
  available: boolean;
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleSelfMute: () => void;
  toggleDeafen: () => void;
  setParticipantMuted: (playerId: string, muted: boolean) => void;
  setParticipantVolume: (playerId: string, volume: number) => void;
  reportParticipant: (playerId: string) => void;
  updatePreferences: (preferences: Partial<VoicePreferences>) => Promise<void>;
  clearNotice: () => void;
}

const emptySnapshot: VoiceSnapshot = {
  status: "unavailable",
  enabled: false,
  selfMuted: false,
  deafened: false,
  inputLevel: 0,
  participants: [],
  inputDevices: [],
  outputDevices: [],
  preferences: {
    pushToTalk: false,
    pushToTalkKey: "Space",
    sensitivity: 0.16,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    masterVolume: 0.8
  }
};

const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);

export function VoiceChatProvider({ children }: { children: ReactNode }) {
  const state = useGameStore((store) => store.state);
  const playerId = useGameStore((store) => store.playerId);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(emptySnapshot);
  const managerRef = useRef<VoiceChatManager | undefined>(undefined);
  const me = state?.players.find((player) => player.id === playerId);
  const available = Boolean(
    state &&
    playerId &&
    me &&
    !me.isBot &&
    state.settings.voiceEnabled &&
    state.roomMode !== "quick" &&
    state.roomMode !== "bots" &&
    state.tournament?.offline !== true
  );

  useEffect(() => {
    const socket = getGameSocket();
    if (!available || !socket || !state?.roomCode || !playerId) {
      managerRef.current?.destroy();
      managerRef.current = undefined;
      setSnapshot({ ...emptySnapshot, status: available ? "available" : "unavailable" });
      return undefined;
    }

    const manager = new VoiceChatManager(socket, state.roomCode, playerId, setSnapshot);
    managerRef.current = manager;
    setSnapshot((current) => ({ ...current, status: "available" }));
    return () => {
      manager.destroy();
      if (managerRef.current === manager) managerRef.current = undefined;
    };
  }, [available, playerId, state?.roomCode]);

  const value = useMemo<VoiceContextValue>(() => ({
    ...snapshot,
    available,
    joinVoice: async () => managerRef.current?.join(),
    leaveVoice: async () => managerRef.current?.leave(),
    toggleSelfMute: () => managerRef.current?.toggleSelfMute(),
    toggleDeafen: () => managerRef.current?.toggleDeafen(),
    setParticipantMuted: (id, muted) => managerRef.current?.setParticipantMuted(id, muted),
    setParticipantVolume: (id, volume) => managerRef.current?.setParticipantVolume(id, volume),
    reportParticipant: (id) => managerRef.current?.reportParticipant(id),
    updatePreferences: async (preferences) => managerRef.current?.updatePreferences(preferences),
    clearNotice: () => managerRef.current?.clearNotice()
  }), [available, snapshot]);

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceChat(): VoiceContextValue {
  const context = useContext(VoiceContext);
  if (!context) throw new Error("useVoiceChat must be used inside VoiceChatProvider.");
  return context;
}

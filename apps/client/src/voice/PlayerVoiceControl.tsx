import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Radio, ShieldAlert, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useVoiceChat } from "./VoiceChatProvider.js";

export function PlayerVoiceControl({ playerId, isBot, isYou }: { playerId: string; isBot: boolean; isYou: boolean }) {
  const voice = useVoiceChat();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!voice.available || isBot) return null;

  const participant = voice.participants.find((item) => item.playerId === playerId);
  const disconnected = !participant || participant.connectionState === "disconnected" || participant.connectionState === "failed";
  const locallyMuted = Boolean(participant?.isLocallyMuted);
  const selfMuted = Boolean(participant?.isSelfMuted);
  const speaking = Boolean(participant?.isSpeaking && !locallyMuted);
  const label = disconnected
    ? "Not connected to voice"
    : locallyMuted
      ? "Muted locally"
      : selfMuted
        ? "Microphone muted"
        : speaking
          ? "Speaking"
          : "Connected to voice";

  const click = () => {
    if (isYou && voice.enabled) voice.toggleSelfMute();
    else if (!isYou) setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          "player-voice-button",
          speaking && "is-speaking",
          (selfMuted || locallyMuted) && "is-muted",
          disconnected && "is-disconnected"
        )}
        onClick={click}
        aria-label={label}
        title={isYou ? `${label}. Click to toggle your microphone` : `${label}. Open player voice controls`}
      >
        {disconnected ? <WifiOff size={13} /> : locallyMuted ? <VolumeX size={13} /> : selfMuted ? <MicOff size={13} /> : speaking ? <Radio size={13} /> : <Mic size={13} />}
        <span className="sr-only">{label}</span>
      </button>
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {open && !isYou ? (
            <motion.div
              className="player-voice-popover"
              style={popoverPosition(buttonRef.current)}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
            >
              <div className="player-voice-popover-head">
                <div><strong>Player audio</strong><small>{label}</small></div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close player voice controls"><X size={15} /></button>
              </div>
              <button
                type="button"
                disabled={disconnected}
                onClick={() => voice.setParticipantMuted(playerId, !locallyMuted)}
              >
                {locallyMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {locallyMuted ? "Unmute this player" : "Mute this player"}
              </button>
              <label>
                Player volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={participant?.volume ?? 1}
                  disabled={disconnected}
                  onChange={(event) => voice.setParticipantVolume(playerId, Number(event.target.value))}
                />
              </label>
              <button type="button" className="player-report-button" disabled={disconnected} onClick={() => voice.reportParticipant(playerId)}>
                <ShieldAlert size={16} /> Report player
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      ) : null}
    </>
  );
}

function popoverPosition(element: HTMLElement | null): CSSProperties {
  const rect = element?.getBoundingClientRect();
  const width = 240;
  const left = rect ? Math.min(window.innerWidth - width - 12, Math.max(12, rect.left - width / 2 + rect.width / 2)) : 12;
  const top = rect ? Math.min(window.innerHeight - 230, rect.bottom + 10) : 12;
  return { left, top, width };
}

import { avatarSpritePosition } from "@getaway-cards/shared";
import { clsx } from "clsx";
import { Crown, Mic, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { playerInitials } from "../../lib/playerInitials.js";

export type PlayerAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type PlayerOnlineState = "online" | "busy" | "offline";

export interface PlayerAvatarProps {
  name: string;
  avatarId?: string;
  photoUrl?: string;
  frame?: string;
  size?: PlayerAvatarSize;
  onlineState?: PlayerOnlineState;
  isSpeaking?: boolean;
  isCurrentTurn?: boolean;
  isHost?: boolean;
  isGuest?: boolean;
  isBot?: boolean;
  isDisconnected?: boolean;
  level?: number;
  rank?: string;
  showLevel?: boolean;
  decorative?: boolean;
  className?: string;
}

export function PlayerAvatar({
  name,
  avatarId = "initials",
  photoUrl,
  frame = "default",
  size = "md",
  onlineState,
  isSpeaking = false,
  isCurrentTurn = false,
  isHost = false,
  isGuest = false,
  isBot = false,
  isDisconnected = false,
  level,
  rank,
  showLevel = false,
  decorative = false,
  className
}: PlayerAvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const sprite = useMemo(() => avatarSpritePosition(avatarId), [avatarId]);
  const speaking = isSpeaking && !isBot;

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [photoUrl]);

  const stateLabels = [
    onlineState === "online" ? "online" : onlineState === "busy" ? "in a match" : onlineState === "offline" ? "offline" : undefined,
    speaking ? "speaking" : undefined,
    isCurrentTurn ? "current turn" : undefined,
    isHost ? "host" : undefined,
    isDisconnected ? "disconnected" : undefined
  ].filter(Boolean);
  const label = `${name} profile picture${stateLabels.length ? `, ${stateLabels.join(", ")}` : ""}`;

  return (
    <span
      className={clsx(
        "player-avatar-shell",
        `player-avatar-shell-${size}`,
        isCurrentTurn && "is-current-turn",
        speaking && "is-speaking",
        isDisconnected && "is-disconnected",
        className
      )}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      title={rank ? `${name} - ${rank}${level ? `, level ${level}` : ""}` : label}
    >
      <span
        className={clsx("profile-avatar", `profile-avatar-${size}`, `profile-frame-${frame}`)}
        data-avatar-id={avatarId}
      >
        <span className="profile-avatar-fallback" aria-hidden="true">
          {sprite ? (
            <span
              className="profile-avatar-sprite"
              style={{
                "--avatar-x": `${sprite.x}%`,
                "--avatar-y": `${sprite.y}%`
              } as CSSProperties}
            />
          ) : (
            <span className="profile-avatar-initials">{playerInitials(name)}</span>
          )}
        </span>
        {photoUrl && !failed ? (
          <img
            className={clsx("profile-avatar-photo", loaded && "is-loaded")}
            src={photoUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading={size === "lg" || size === "xl" ? "eager" : "lazy"}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}
      </span>
      {onlineState ? <OnlineStatusBadge state={isDisconnected ? "offline" : onlineState} /> : null}
      {speaking ? <span className="avatar-speaking-icon" aria-hidden="true"><Mic size={10} /></span> : null}
      {isDisconnected ? <span className="avatar-disconnected-icon" aria-hidden="true"><WifiOff size={10} /></span> : null}
      {isHost ? <span className="avatar-host-badge" aria-hidden="true"><Crown size={12} /></span> : null}
      {isGuest ? <span className="avatar-guest-badge">Guest</span> : null}
      {showLevel && level ? <RankBadge level={level} rank={rank} /> : null}
      <span className="sr-only">{stateLabels.join(", ")}</span>
    </span>
  );
}

export function OnlineStatusBadge({ state }: { state: PlayerOnlineState }) {
  const label = state === "busy" ? "Busy, in match" : state === "online" ? "Online" : "Offline";
  return <span className={clsx("avatar-online-badge", `is-${state}`)} title={label}><span className="sr-only">{label}</span></span>;
}

export function RankBadge({ level, rank }: { level: number; rank?: string }) {
  return <span className="avatar-level-badge" title={rank ? `${rank}, level ${level}` : `Level ${level}`}>{level}</span>;
}

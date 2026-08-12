import type { PublicPlayerState } from "@getaway-cards/shared";
import clsx from "clsx";
import { Bot, Crown } from "lucide-react";
import { PlayerAvatar } from "./auth/PlayerAvatar.js";

interface PlayerBadgeProps {
  player: PublicPlayerState;
  active?: boolean;
  host?: boolean;
  compact?: boolean;
}

export function PlayerBadge({ player, active = false, host = false, compact = false }: PlayerBadgeProps) {
  const compactStatus = active
    ? player.isBot
      ? "Thinking..."
      : "Your turn"
    : "Waiting";
  const lobbyStatus = player.isBot
    ? "Bot ready"
    : player.ready
      ? "Ready"
      : "Not ready";
  const statusText = !player.connected
    ? "Disconnected • Bot Playing"
    : player.connectionState === "reconnecting"
      ? "Reconnected • Bot Playing"
      : player.controlState === "temporary-bot"
        ? player.autoPlayEnabled
          ? "Auto Play ON"
          : "AFK • Auto Playing"
        : player.controlState === "auto-play"
          ? "AFK • Card auto-played"
    : compact
      ? compactStatus
      : player.handCount === 0
        ? lobbyStatus
        : `${player.handCount} card${player.handCount === 1 ? "" : "s"} / ${player.score} escapes`;

  return (
    <div
      className={clsx(
        "player-badge relative flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2 transition",
        active
          ? "player-badge-active border-amber-300 bg-amber-200/25 shadow-[0_0_30px_rgba(249,199,79,0.25)]"
          : "border-white/15 bg-white/10",
        compact && "px-2 py-1.5"
      )}
    >
      <div className="player-avatar-token relative shrink-0">
        <PlayerAvatar
          name={player.username}
          avatarId={player.avatar}
          photoUrl={player.avatarUrl}
          frame={player.profileFrameId}
          size="sm"
          onlineState={player.connected ? "online" : "offline"}
          isCurrentTurn={active}
          isHost={host}
          isGuest={player.accountType === "guest"}
          isBot={player.isBot}
          isDisconnected={!player.connected}
          level={player.level}
          rank={player.rankBadge}
        />
        <span className="player-count-bubble">{player.handCount}</span>
      </div>
      <div className="player-info-stack min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="player-name-line truncate text-sm font-black text-white">{player.username}</p>
          {player.rankBadge ? <span className="player-rank-chip">{player.rankBadge}</span> : null}
          {host ? <Crown className="text-amber-200" size={14} /> : null}
          {player.isBot ? <Bot className="text-teal-100" size={14} /> : null}
        </div>
        <p className="player-status-line text-xs font-semibold text-white/70">
          {statusText}
        </p>
      </div>
    </div>
  );
}

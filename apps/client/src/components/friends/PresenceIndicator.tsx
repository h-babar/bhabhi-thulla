import type { PresenceStatus } from "@getaway-cards/shared";

export function PresenceIndicator({ status, label = true }: { status: PresenceStatus; label?: boolean }) {
  const tone = status === "offline" ? "offline" : status === "online" || status === "in_lobby" ? "online" : "busy";
  return (
    <span className={`friend-presence is-${tone}`} title={formatPresence(status)}>
      <i aria-hidden="true" />
      {label ? <span>{formatPresence(status)}</span> : null}
    </span>
  );
}

function formatPresence(status: PresenceStatus): string {
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

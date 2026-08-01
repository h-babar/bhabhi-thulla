import { AVATAR_PRESETS } from "@getaway-cards/shared";
import { PlayerAvatar } from "./PlayerAvatar.js";

interface AvatarSelectorProps {
  value: string;
  name: string;
  onChange: (avatarId: string) => void;
}

export function AvatarSelector({ value, name, onChange }: AvatarSelectorProps) {
  return (
    <div className="avatar-selector" role="group" aria-label="Select game avatar">
      {AVATAR_PRESETS.map((avatarId) => (
        <button
          type="button"
          key={avatarId}
          className={value === avatarId ? "is-selected" : ""}
          onClick={() => onChange(avatarId)}
          aria-pressed={value === avatarId}
        >
          <PlayerAvatar name={name} avatarId={avatarId} size="sm" />
          <span>{avatarId}</span>
        </button>
      ))}
    </div>
  );
}

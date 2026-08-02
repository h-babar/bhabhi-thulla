import { clsx } from "clsx";
import { playerInitials } from "../../lib/playerInitials.js";

interface PlayerAvatarProps {
  name: string;
  avatarId: string;
  photoUrl?: string;
  frame?: string;
  size?: "sm" | "md" | "lg";
}

export function PlayerAvatar({ name, avatarId, photoUrl, frame = "classic", size = "md" }: PlayerAvatarProps) {
  return (
    <span
      className={clsx("profile-avatar", `profile-avatar-${size}`, `profile-frame-${frame}`)}
      aria-label={`${name} avatar`}
      data-avatar-id={avatarId}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span>{playerInitials(name)}</span>
      )}
    </span>
  );
}

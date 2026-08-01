import { clsx } from "clsx";

interface PlayerAvatarProps {
  name: string;
  avatarId: string;
  photoUrl?: string;
  frame?: string;
  size?: "sm" | "md" | "lg";
}

export function PlayerAvatar({ name, avatarId, photoUrl, frame = "classic", size = "md" }: PlayerAvatarProps) {
  return (
    <span className={clsx("profile-avatar", `profile-avatar-${size}`, `profile-frame-${frame}`)} aria-label={`${name} avatar`}>
      {photoUrl ? (
        <img src={photoUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span>{avatarId.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

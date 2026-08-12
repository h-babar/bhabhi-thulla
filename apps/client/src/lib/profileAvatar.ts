import type { PlayerProfile } from "@getaway-cards/shared";

export function profileAvatarSource(
  profile: PlayerProfile | undefined,
  fallbackAvatarId = "initials"
): { avatarId: string; photoUrl?: string } {
  if (!profile) return { avatarId: fallbackAvatarId };
  if (profile.activeImageType === "google" && profile.googlePhotoUrl) {
    return {
      avatarId: profile.selectedAvatarId ?? fallbackAvatarId,
      photoUrl: profile.googlePhotoUrl
    };
  }
  if (profile.activeImageType === "initials") return { avatarId: "initials" };
  return { avatarId: profile.selectedAvatarId ?? profile.avatarId ?? fallbackAvatarId };
}

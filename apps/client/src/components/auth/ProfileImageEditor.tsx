import type { ProfileImageType, ProfileImageVisibility } from "@getaway-cards/shared";
import { Check, CircleUserRound, Cloud, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { Modal } from "../Modal.js";
import { AvatarGallery } from "./AvatarGallery.js";
import { ImageCropper } from "./ImageCropper.js";
import { PlayerAvatar } from "./PlayerAvatar.js";
import { ProfileImageUpload } from "./ProfileImageUpload.js";

export function ProfileImageEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const guest = useAuthStore((state) => state.guest);
  const profile = useAuthStore((state) => state.profile);
  const updateGuest = useAuthStore((state) => state.updateGuest);
  const updateRegistered = useAuthStore((state) => state.updateRegistered);
  const uploadProfileImage = useAuthStore((state) => state.uploadProfileImage);
  const deleteCustomProfileImage = useAuthStore((state) => state.deleteCustomProfileImage);
  const openUpgrade = useAuthStore((state) => state.openUpgrade);
  const current = profile ?? guest;
  const [type, setType] = useState<ProfileImageType>("avatar");
  const [avatarId, setAvatarId] = useState("avatar_01");
  const [visibility, setVisibility] = useState<ProfileImageVisibility>("everyone");
  const [cropUrl, setCropUrl] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open || !current) return;
    setType(profile?.activeImageType ?? (current.avatarId === "initials" ? "initials" : "avatar"));
    setAvatarId(profile?.selectedAvatarId ?? current.avatarId ?? "avatar_01");
    setVisibility(profile?.profileImageVisibility ?? "everyone");
    setError(undefined);
  }, [current, open, profile]);

  useEffect(() => () => { if (cropUrl) URL.revokeObjectURL(cropUrl); }, [cropUrl]);

  const preview = useMemo(() => {
    if (type === "custom") return profile?.customPhotoUrl;
    if (type === "google") return profile?.googlePhotoUrl;
    return undefined;
  }, [profile, type]);
  if (!current) return null;

  const save = async () => {
    setSaving(true);
    setError(undefined);
    if (profile) {
      const ok = await updateRegistered({
        avatarId,
        selectedAvatarId: avatarId,
        activeImageType: type,
        profileImageVisibility: visibility
      });
      setSaving(false);
      if (ok) onClose();
      else setError("Your profile image choice could not be saved.");
      return;
    }
    updateGuest({ avatarId: type === "initials" ? "initials" : avatarId });
    setSaving(false);
    onClose();
  };

  const uploadCrop = async (blob: Blob) => {
    setSaving(true);
    setError(undefined);
    const ok = await uploadProfileImage(blob);
    setSaving(false);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl(undefined);
    if (ok) setType("custom");
    else setError("The photo could not be uploaded. Please try another image.");
  };

  return (
    <Modal open={open} onClose={onClose} title="Profile image" wide className="profile-image-editor-modal" eyebrow="Player identity">
      {cropUrl ? (
        <ImageCropper sourceUrl={cropUrl} onCancel={() => { URL.revokeObjectURL(cropUrl); setCropUrl(undefined); }} onComplete={(blob) => void uploadCrop(blob)} />
      ) : (
        <div className="profile-image-editor">
          <aside className="profile-image-preview-panel">
            <span>Live preview</span>
            <PlayerAvatar
              name={current.displayName}
              avatarId={type === "initials" ? "initials" : avatarId}
              photoUrl={preview}
              frame={profile?.profileFrameId}
              size="xl"
              onlineState="online"
              level={profile?.level}
              rank={profile?.rank}
              showLevel={Boolean(profile)}
            />
            <strong>{current.displayName}</strong>
            <small>{profile ? `@${profile.username}` : "Guest player"}</small>
            <div className="profile-privacy-control">
              <label htmlFor="profile-image-visibility">Visible to</label>
              <select id="profile-image-visibility" value={visibility} disabled={!profile} onChange={(event) => setVisibility(event.target.value as ProfileImageVisibility)}>
                <option value="everyone">Everyone</option>
                <option value="friends">Friends only</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
          </aside>
          <section className="profile-image-options">
            <div className="profile-image-source-grid">
              <button type="button" className={`profile-image-source-button ${type === "google" ? "is-selected" : ""}`} disabled={!profile?.googlePhotoUrl} onClick={() => setType("google")}>
                <Cloud size={19} /><span><strong>Google Photo</strong><small>{profile?.googlePhotoUrl ? "Use your synced Google image" : "Not available"}</small></span>{type === "google" ? <Check size={17} /> : null}
              </button>
              {profile ? (
                <ProfileImageUpload onError={setError} onSelect={(_, sourceUrl) => { if (cropUrl) URL.revokeObjectURL(cropUrl); setCropUrl(sourceUrl); }} />
              ) : (
                <button type="button" className="profile-image-source-button" onClick={openUpgrade}><Cloud size={19} /><span><strong>Upload Photo</strong><small>Save progress to upload</small></span></button>
              )}
              <button type="button" className={`profile-image-source-button ${type === "initials" ? "is-selected" : ""}`} onClick={() => setType("initials")}>
                <CircleUserRound size={19} /><span><strong>Use Initials</strong><small>Always available, never broken</small></span>{type === "initials" ? <Check size={17} /> : null}
              </button>
              {profile?.customPhotoUrl ? (
                <button type="button" className="profile-image-source-button is-danger" onClick={async () => { setSaving(true); const ok = await deleteCustomProfileImage(); setSaving(false); if (ok && type === "custom") setType("avatar"); }}>
                  <Trash2 size={19} /><span><strong>Remove Upload</strong><small>Keep Google photo and avatars</small></span>
                </button>
              ) : null}
            </div>
            <div className="profile-image-avatar-heading">
              <div><strong>Choose Avatar</strong><small>Original Bhabhi Thulla characters</small></div>
              <button type="button" className={type === "avatar" ? "is-selected" : ""} onClick={() => setType("avatar")}><ShieldCheck size={16} /> Use selected</button>
            </div>
            <AvatarGallery value={avatarId} name={current.displayName} onChange={(next) => { setAvatarId(next); setType("avatar"); }} />
            {error ? <p className="profile-image-error" role="alert">{error}</p> : null}
          </section>
        </div>
      )}
      {!cropUrl ? (
        <div className="profile-editor-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="is-primary" disabled={saving || (type === "custom" && !profile?.customPhotoUrl) || (type === "google" && !profile?.googlePhotoUrl)} onClick={() => void save()}>
            {saving ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />} Save image
          </button>
        </div>
      ) : null}
    </Modal>
  );
}

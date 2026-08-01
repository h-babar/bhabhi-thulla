import { NATION_OPTIONS, type UpdatePlayerProfileInput } from "@getaway-cards/shared";
import { Check, LoaderCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { Modal } from "../Modal.js";
import { AvatarSelector } from "./AvatarSelector.js";

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const guest = useAuthStore((state) => state.guest);
  const profile = useAuthStore((state) => state.profile);
  const updateGuest = useAuthStore((state) => state.updateGuest);
  const updateRegistered = useAuthStore((state) => state.updateRegistered);
  const checkUsername = useAuthStore((state) => state.checkUsername);
  const [form, setForm] = useState<UpdatePlayerProfileInput>({});
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const current = profile ?? guest;

  useEffect(() => {
    if (!open || !current) return;
    setForm({
      displayName: current.displayName,
      username: profile?.username,
      avatarId: current.avatarId,
      profileFrameId: profile?.profileFrameId,
      country: profile?.country,
      bio: profile?.bio
    });
    setAvailability("idle");
  }, [current, open, profile]);

  useEffect(() => {
    if (!profile || !form.username || form.username === profile.username) {
      setAvailability("idle");
      return undefined;
    }
    setAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkUsername(form.username!);
        setForm((value) => ({ ...value, username: result.normalized }));
        setAvailability(result.available ? "available" : "taken");
      } catch {
        setAvailability("taken");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [checkUsername, form.username, profile]);

  if (!current) return null;

  const save = async (): Promise<void> => {
    setSaving(true);
    if (profile) {
      const saved = await updateRegistered(form);
      setSaving(false);
      if (saved) onClose();
      return;
    }
    updateGuest({ displayName: form.displayName, avatarId: form.avatarId });
    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit profile">
      <div className="edit-profile-form">
        <label>
          <span>Display name</span>
          <input className="field" maxLength={24} value={form.displayName ?? ""} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        </label>
        {profile ? (
          <>
            <label>
              <span>Unique username</span>
              <div className="profile-field-status">
                <input className="field" maxLength={16} value={form.username ?? ""} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} />
                {availability === "checking" ? <LoaderCircle className="animate-spin" size={17} /> : null}
                {availability === "available" ? <Check className="text-emerald-400" size={17} /> : null}
                {availability === "taken" ? <XCircle className="text-rose-400" size={17} /> : null}
              </div>
              <small>{availability === "taken" ? "Unavailable or invalid username" : "Letters, numbers, and underscores only"}</small>
            </label>
            <label>
              <span>Google email</span>
              <input className="field" value={profile.email} disabled />
              <small>Your private email is never shown to other players.</small>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span>Country or region</span>
                <select className="field" value={form.country ?? ""} onChange={(event) => setForm({ ...form, country: event.target.value })}>
                  <option value="">Not set</option>
                  {NATION_OPTIONS.map((nation) => <option key={nation.code} value={nation.code}>{nation.name}</option>)}
                </select>
              </label>
              <label>
                <span>Profile frame</span>
                <select className="field" value={form.profileFrameId ?? "classic"} onChange={(event) => setForm({ ...form, profileFrameId: event.target.value })}>
                  <option value="classic">Classic</option>
                  <option value="emerald">Emerald</option>
                  <option value="royal">Royal</option>
                  <option value="champion">Champion</option>
                </select>
              </label>
            </div>
            <label>
              <span>Short bio</span>
              <textarea className="field min-h-24 resize-none" maxLength={160} value={form.bio ?? ""} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
            </label>
          </>
        ) : null}
        <div>
          <span className="profile-field-label">Game avatar</span>
          <AvatarSelector name={form.displayName ?? current.displayName} value={form.avatarId ?? current.avatarId} onChange={(avatarId) => setForm({ ...form, avatarId })} />
        </div>
        <button className="primary-button justify-center" disabled={saving || availability === "taken" || availability === "checking"} onClick={save}>
          {saving ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />}
          Save profile
        </button>
      </div>
    </Modal>
  );
}

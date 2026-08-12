import { BUILT_IN_AVATARS, type AvatarCategory } from "@getaway-cards/shared";
import { useMemo, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar.js";

const categories: Array<"All" | AvatarCategory> = ["All", "Players", "Royal", "Cards", "Classic", "Fun"];

export function AvatarGallery({ value, name, onChange }: { value?: string; name: string; onChange: (avatarId: string) => void }) {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const avatars = useMemo(
    () => category === "All" ? BUILT_IN_AVATARS : BUILT_IN_AVATARS.filter((avatar) => avatar.category === category),
    [category]
  );

  return (
    <section className="avatar-gallery" aria-label="Choose a built-in game avatar">
      <div className="avatar-gallery-tabs" role="tablist" aria-label="Avatar categories">
        {categories.map((item) => (
          <button type="button" role="tab" aria-selected={item === category} key={item} onClick={() => setCategory(item)}>{item}</button>
        ))}
      </div>
      <div className="avatar-gallery-grid" role="listbox" aria-label="Game avatars">
        {avatars.map((avatar) => (
          <button
            type="button"
            role="option"
            aria-selected={value === avatar.id}
            key={avatar.id}
            className={value === avatar.id ? "is-selected" : ""}
            onClick={() => onChange(avatar.id)}
          >
            <PlayerAvatar name={name} avatarId={avatar.id} size="md" decorative />
            <span>{avatar.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

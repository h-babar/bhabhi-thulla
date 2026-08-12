import { AvatarGallery } from "./AvatarGallery.js";

interface AvatarSelectorProps {
  value: string;
  name: string;
  onChange: (avatarId: string) => void;
}

export function AvatarSelector({ value, name, onChange }: AvatarSelectorProps) {
  return <AvatarGallery value={value} name={name} onChange={onChange} />;
}

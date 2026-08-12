import { ImagePlus } from "lucide-react";
import { useRef } from "react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ProfileImageUpload({ disabled = false, onSelect, onError }: {
  disabled?: boolean;
  onSelect: (file: File, sourceUrl: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = async (file: File) => {
    if (!ACCEPTED.has(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      onError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError("Profile photos must be no larger than 5 MB.");
      return;
    }
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < 256 || image.naturalHeight < 256) {
        URL.revokeObjectURL(sourceUrl);
        onError("Choose an image at least 256 by 256 pixels.");
        return;
      }
      onSelect(file, sourceUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      onError("That file could not be read as an image.");
    };
    image.src = sourceUrl;
  };

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) void validate(file);
        }}
      />
      <button type="button" className="profile-image-source-button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <ImagePlus size={19} />
        <span><strong>Upload Photo</strong><small>JPG, PNG or WebP, up to 5 MB</small></span>
      </button>
    </>
  );
}

import { Image, LoaderCircle } from "lucide-react";
import type { ShareableMatchResult } from "../../lib/matchResults.js";

export function MatchResultPreview({
  result,
  imageUrl,
  error
}: {
  result: ShareableMatchResult;
  imageUrl?: string;
  error?: string;
}) {
  return (
    <figure className="match-result-preview">
      <figcaption>
        <span><Image size={17} /> Share card preview</span>
        <small>1080 x 1350 PNG</small>
      </figcaption>
      <div className="match-result-preview-frame">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Shareable Bhabhi Thulla result showing ${result.players.map((player) => player.displayName).join(", ")}`}
          />
        ) : error ? (
          <div className="match-result-preview-state is-error">
            <Image size={28} />
            <span>{error}</span>
          </div>
        ) : (
          <div className="match-result-preview-state">
            <LoaderCircle className="animate-spin" size={28} />
            <span>Rendering result card...</span>
          </div>
        )}
      </div>
    </figure>
  );
}

import { Coins, Home, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { ShareableMatchResult } from "../../lib/matchResults.js";
import { renderMatchResultImage } from "../../lib/resultImageRenderer.js";
import { Modal } from "../Modal.js";
import { MatchResultCard } from "./MatchResultCard.js";
import { MatchResultPreview } from "./MatchResultPreview.js";
import { ShareResultActions } from "./ShareResultActions.js";
import { useAuthStore } from "../../store/authStore.js";

export function MatchResultModal({
  open,
  result,
  onClose,
  onRematch,
  onReturn,
  primaryActionLabel = "Rematch"
}: {
  open: boolean;
  result?: ShareableMatchResult;
  onClose: () => void;
  onRematch: () => void;
  onReturn: () => void;
  primaryActionLabel?: string;
}) {
  const [image, setImage] = useState<Blob>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [renderError, setRenderError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const guest = useAuthStore((store) => store.guest);
  const profile = useAuthStore((store) => store.profile);
  const refreshRewards = useAuthStore((store) => store.refreshRewards);

  useEffect(() => {
    if (!open || !result) return undefined;
    let active = true;
    let generatedUrl: string | undefined;
    setImage(undefined);
    setImageUrl(undefined);
    setRenderError(undefined);
    renderMatchResultImage(result)
      .then((blob) => {
        if (!active) return;
        generatedUrl = URL.createObjectURL(blob);
        setImage(blob);
        setImageUrl(generatedUrl);
      })
      .catch((error) => {
        if (active) setRenderError(error instanceof Error ? error.message : "Could not render the result card.");
      });

    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [open, result?.publicMatchId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(undefined), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (open && result) void refreshRewards();
  }, [open, refreshRewards, result?.publicMatchId]);

  if (!result) return null;
  const playUrl = typeof window === "undefined" ? "https://bhabhi-thulla-alpha.vercel.app" : window.location.origin;
  const currentPlayer = result.players.find((player) => player.isCurrentPlayer);
  const earnedCoins = currentPlayer ? (currentPlayer.becameBhabhi ? 35 : 120) : 0;
  const balance = profile?.coins ?? guest?.coins ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Match Complete"
      eyebrow="Final table result"
      wide
      className="match-result-modal"
    >
      <div className="match-result-modal-intro">
        <span><Trophy size={22} /></span>
        <div>
          <p>Your share card is ready</p>
          <small>Share the result in one tap or jump straight into another table.</small>
        </div>
      </div>

      {currentPlayer ? (
        <div className="match-reward-summary">
          <span className="match-reward-coin"><Coins size={22} /></span>
          <span className="match-reward-copy">
            <small>{currentPlayer.becameBhabhi ? "Participation reward" : "Escape reward"}</small>
            <strong>+{earnedCoins} Thulla Coins</strong>
          </span>
          <span className="match-reward-balance">
            <Sparkles size={15} /> Balance {balance.toLocaleString()}
          </span>
        </div>
      ) : null}

      <div className="match-result-modal-grid">
        <MatchResultCard result={result} />
        <MatchResultPreview result={result} imageUrl={imageUrl} error={renderError} />
      </div>

      <div className="match-result-main-actions">
        <button type="button" className="match-result-rematch" onClick={onRematch}>
          <RotateCcw size={20} />
          {primaryActionLabel}
        </button>
        <ShareResultActions result={result} image={image} playUrl={playUrl} onNotice={setNotice} />
      </div>

      <button type="button" className="match-result-return" onClick={onReturn}>
        <Home size={17} />
        Return to lobby
      </button>

      {notice ? <div className="match-result-toast" role="status">{notice}</div> : null}
    </Modal>
  );
}

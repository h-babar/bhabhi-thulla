import {
  formatMatchResultText,
  resultImageFileName,
  type ShareableMatchResult
} from "./matchResults.js";

export type ShareResultOutcome = "shared" | "copied" | "cancelled";

export async function shareMatchResult(
  result: ShareableMatchResult,
  image: Blob | undefined,
  playUrl: string
): Promise<ShareResultOutcome> {
  const text = formatMatchResultText(result, playUrl);
  const file = image ? new File([image], resultImageFileName(result), { type: "image/png" }) : undefined;

  try {
    if (navigator.share && file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Bhabhi Thulla - Match Result",
        text,
        files: [file]
      });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({
        title: "Bhabhi Thulla - Match Result",
        text,
        url: playUrl
      });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  await copyMatchResult(result, playUrl);
  return "copied";
}

export function shareMatchResultToWhatsApp(result: ShareableMatchResult, playUrl: string): void {
  const winner = result.players.find((player) => player.finalPosition === 1);
  const bhabhi = result.players.find((player) => player.becameBhabhi);
  const text = [
    winner ? `${winner.displayName} escaped first \ud83c\udfc6` : "Bhabhi Thulla match complete",
    bhabhi ? `${bhabhi.displayName} became Bhabhi \ud83d\ude02` : undefined,
    "Play Bhabhi Thulla with me:",
    playUrl
  ].filter(Boolean).join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export async function copyMatchResult(result: ShareableMatchResult, playUrl: string): Promise<void> {
  const text = formatMatchResultText(result, playUrl);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browsers can deny Clipboard API access when focus changes during a share flow.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy is unavailable. Select Share Result instead.");
}

export function downloadMatchResult(result: ShareableMatchResult, image: Blob): void {
  const url = URL.createObjectURL(image);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resultImageFileName(result);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

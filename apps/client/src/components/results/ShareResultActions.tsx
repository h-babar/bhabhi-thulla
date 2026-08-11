import { Copy, Download, LoaderCircle, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import type { ShareableMatchResult } from "../../lib/matchResults.js";
import {
  copyMatchResult,
  downloadMatchResult,
  shareMatchResult,
  shareMatchResultToWhatsApp
} from "../../lib/shareService.js";

type ActionName = "share" | "copy" | "download";

export function ShareResultActions({
  result,
  image,
  playUrl,
  onNotice
}: {
  result: ShareableMatchResult;
  image?: Blob;
  playUrl: string;
  onNotice: (message: string) => void;
}) {
  const [working, setWorking] = useState<ActionName>();

  const run = async (action: ActionName, callback: () => Promise<void>): Promise<void> => {
    setWorking(action);
    try {
      await callback();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "That action could not be completed.");
    } finally {
      setWorking(undefined);
    }
  };

  return (
    <div className="share-result-actions">
      <button
        type="button"
        className="share-result-primary"
        disabled={working !== undefined}
        aria-label="Share match result"
        onClick={() => run("share", async () => {
          const outcome = await shareMatchResult(result, image, playUrl);
          if (outcome === "copied") onNotice("Sharing is unavailable here, so the result was copied.");
          if (outcome === "shared") onNotice("Result shared");
        })}
      >
        {working === "share" ? <LoaderCircle className="animate-spin" size={19} /> : <Share2 size={19} />}
        Share Result
      </button>

      <div className="share-result-secondary">
        <button
          type="button"
          aria-label="Share result to WhatsApp"
          onClick={() => {
            shareMatchResultToWhatsApp(result, playUrl);
            onNotice("WhatsApp share opened");
          }}
        >
          <MessageCircle size={17} />
          WhatsApp
        </button>
        <button
          type="button"
          aria-label="Copy match result"
          disabled={working !== undefined}
          onClick={() => run("copy", async () => {
            await copyMatchResult(result, playUrl);
            onNotice("Result copied");
          })}
        >
          {working === "copy" ? <LoaderCircle className="animate-spin" size={17} /> : <Copy size={17} />}
          Copy
        </button>
        <button
          type="button"
          aria-label="Download result card image"
          disabled={!image || working !== undefined}
          onClick={() => run("download", async () => {
            if (!image) throw new Error("The image is still being prepared.");
            downloadMatchResult(result, image);
            onNotice("Result card downloaded");
          })}
        >
          {working === "download" ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
          Download
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {working ? `Working on ${working}` : ""}
      </span>
    </div>
  );
}

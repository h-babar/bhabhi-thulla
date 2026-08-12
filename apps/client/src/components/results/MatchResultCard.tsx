import clsx from "clsx";
import { Check, Crown, Smile } from "lucide-react";
import { getMatchResultCaption, type ShareableMatchResult } from "../../lib/matchResults.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";

export function MatchResultCard({ result }: { result: ShareableMatchResult }) {
  return (
    <section className="match-result-card" aria-label="Final match standings">
      <div className="match-result-card-heading">
        <span className="match-result-card-crest">BT</span>
        <div>
          <p>Match Complete</p>
          <h3>Final Table Result</h3>
        </div>
        <span className="match-result-public-id">#{result.publicMatchId}</span>
      </div>

      <p className="match-result-caption">{getMatchResultCaption(result)}</p>

      {result.tournament ? (
        <div className="match-result-tournament">
          <strong>{result.tournament.name}</strong>
          <span>{result.tournament.round} / {result.tournament.status}</span>
        </div>
      ) : null}

      <div className="match-result-ranking">
        {result.players.map((player) => (
          <article
            key={player.playerId}
            className={clsx(
              "match-result-player",
              player.finalPosition === 1 && "is-first",
              player.becameBhabhi && "is-bhabhi"
            )}
          >
            <PlayerAvatar className="match-result-avatar" name={player.displayName} avatarId={player.avatarId} photoUrl={player.avatarUrl} frame={player.profileFrameId} size="md" />
            <span className="match-result-player-copy">
              <strong title={player.displayName}>{player.displayName}</strong>
              <small>
                {player.becameBhabhi
                  ? "Became Bhabhi"
                  : player.finalPosition === 1
                    ? "Escaped First"
                    : "Escaped"}
              </small>
            </span>
            <span className="match-result-rank" aria-label={player.becameBhabhi ? "Bhabhi" : `Position ${player.finalPosition}`}>
              {player.becameBhabhi ? <Smile size={20} /> : player.finalPosition === 1 ? <Crown size={20} /> : <Check size={20} />}
              {player.becameBhabhi ? "BHABHI" : `#${player.finalPosition}`}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

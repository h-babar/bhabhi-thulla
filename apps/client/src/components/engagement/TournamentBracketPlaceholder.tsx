import clsx from "clsx";
import { Check, Crown, LockKeyhole } from "lucide-react";
import type { TournamentRound } from "../../data/engagementMock.js";

export function TournamentBracketPlaceholder({ rounds }: { rounds: TournamentRound[] }) {
  return (
    <div className="tournament-bracket-shell">
      <div className="tournament-bracket-grid" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(10.5rem, 1fr))` }}>
        {rounds.map((round, roundIndex) => (
          <section key={round.name} className="tournament-bracket-round">
            <div className="tournament-round-heading">
              <span>{roundIndex + 1}</span>
              <div><small>Stage {roundIndex + 1}</small><strong>{round.name}</strong></div>
            </div>
            <div className="tournament-round-slots">
              {round.slots.map((slot, slotIndex) => (
                <div
                  key={slot.id}
                  className={clsx(
                    "tournament-bracket-slot",
                    `is-${slot.status}`,
                    roundIndex < rounds.length - 1 && "has-connector"
                  )}
                >
                  <span className="tournament-slot-seed">{slot.player ? slotIndex + 1 : <LockKeyhole size={12} />}</span>
                  <span className="tournament-slot-player">{slot.player ?? "Awaiting qualifier"}</span>
                  {slot.status === "advanced" ? <Check size={15} /> : roundIndex === rounds.length - 1 && slot.player ? <Crown size={15} /> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

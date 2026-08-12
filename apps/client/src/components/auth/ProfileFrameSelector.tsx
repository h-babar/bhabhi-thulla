import { Check, LockKeyhole } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar.js";

interface FrameOption {
  id: string;
  label: string;
  level: number;
  tournamentWins?: number;
}

const frames: FrameOption[] = [
  { id: "default", label: "Default", level: 1 },
  { id: "bronze", label: "Bronze", level: 2 },
  { id: "silver", label: "Silver", level: 4 },
  { id: "gold", label: "Gold", level: 7 },
  { id: "platinum", label: "Platinum", level: 10 },
  { id: "diamond", label: "Diamond", level: 15 },
  { id: "master", label: "Master", level: 20 },
  { id: "tournament_champion", label: "Champion", level: 1, tournamentWins: 1 }
];

export function ProfileFrameSelector({ value, name, avatarId, photoUrl, level = 1, tournamentWins = 0, onChange }: {
  value?: string;
  name: string;
  avatarId?: string;
  photoUrl?: string;
  level?: number;
  tournamentWins?: number;
  onChange: (frameId: string) => void;
}) {
  return (
    <section className="profile-frame-selector" aria-label="Choose a profile frame">
      {frames.map((frame) => {
        const unlocked = level >= frame.level && tournamentWins >= (frame.tournamentWins ?? 0);
        const selected = (value ?? "default") === frame.id;
        const requirement = frame.tournamentWins ? "Win a tournament" : `Reach level ${frame.level}`;
        return (
          <button
            type="button"
            key={frame.id}
            className={selected ? "is-selected" : ""}
            disabled={!unlocked}
            aria-pressed={selected}
            title={unlocked ? frame.label : requirement}
            onClick={() => onChange(frame.id)}
          >
            <PlayerAvatar name={name} avatarId={avatarId} photoUrl={photoUrl} frame={frame.id} size="sm" decorative />
            <span><strong>{frame.label}</strong><small>{unlocked ? "Unlocked" : requirement}</small></span>
            {selected ? <Check size={16} /> : !unlocked ? <LockKeyhole size={15} /> : null}
          </button>
        );
      })}
    </section>
  );
}

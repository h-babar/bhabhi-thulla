import type { PublicGameState } from "@getaway-cards/shared";

export interface ShareableMatchResultPlayer {
  playerId: string;
  displayName: string;
  avatarId?: string;
  avatarUrl?: string;
  finalPosition: number;
  escaped: boolean;
  becameBhabhi: boolean;
  isCurrentPlayer: boolean;
}

export interface ShareableMatchResult {
  publicMatchId: string;
  completedAt: string;
  gameMode: string;
  roomType: string;
  playerCount: number;
  durationSeconds?: number;
  roundLabel?: string;
  players: ShareableMatchResultPlayer[];
  tournament?: {
    name: string;
    round: string;
    status: "qualified" | "champion" | "eliminated" | "complete";
  };
  teamResult?: {
    teamAName: string;
    teamAScore: number;
    teamBName: string;
    teamBScore: number;
  };
}

interface MatchResultBuildOptions {
  currentPlayerId?: string;
  currentAvatarUrl?: string;
  includeCurrentAvatar?: boolean;
  currentUsername?: string;
  includeCurrentUsername?: boolean;
}

const modeLabels: Record<PublicGameState["settings"]["funMode"], string> = {
  classic: "Classic",
  turbo: "Turbo",
  marathon: "Marathon",
  reverse: "Reverse Rules"
};

const roomLabels: Record<NonNullable<PublicGameState["roomMode"]>, string> = {
  private: "Private Room",
  quick: "Quick Match",
  bots: "Bot Table",
  tournament: "Tournament"
};

export function buildShareableMatchResult(
  state: PublicGameState,
  options: MatchResultBuildOptions = {}
): ShareableMatchResult | undefined {
  const summary = state.roundSummaries[0];
  const completedTournamentStage = state.roomMode === "tournament" && state.status === "round_over";
  if (!summary || (state.status !== "game_over" && !completedTournamentStage)) return undefined;

  const escapeRank = new Map(state.escapeOrder.map((id, index) => [id, index + 1]));
  const players = summary.scoreLines
    .map((line) => {
      const publicPlayer = state.players.find((player) => player.id === line.playerId);
      const becameBhabhi = line.isBhabhi || line.playerId === state.bhabhiId;
      const isCurrentPlayer = line.playerId === options.currentPlayerId || Boolean(publicPlayer?.isYou);
      const position = becameBhabhi
        ? summary.scoreLines.length
        : escapeRank.get(line.playerId) ?? Math.max(1, summary.scoreLines.length - 1);
      const avatarUrl = isCurrentPlayer
        ? options.includeCurrentAvatar === false
          ? undefined
          : options.currentAvatarUrl ?? safeAvatarUrl(publicPlayer?.avatar)
        : safeAvatarUrl(publicPlayer?.avatar);

      return {
        playerId: publicPlayerKey(line.playerId, summary.id),
        displayName: cleanDisplayName(
          isCurrentPlayer && options.includeCurrentUsername !== false && options.currentUsername
            ? options.currentUsername
            : line.username
        ),
        avatarId: publicPlayer?.avatar,
        avatarUrl,
        finalPosition: position,
        escaped: line.escaped && !becameBhabhi,
        becameBhabhi,
        isCurrentPlayer
      } satisfies ShareableMatchResultPlayer;
    })
    .sort((left, right) => left.finalPosition - right.finalPosition);

  const startedAt = state.history
    .filter((event) => event.type === "start")
    .reduce<number | undefined>((earliest, event) => earliest === undefined ? event.at : Math.min(earliest, event.at), undefined);
  const durationSeconds = startedAt
    ? Math.max(1, Math.round((summary.at - startedAt) / 1000))
    : undefined;
  const activeTournamentStage = state.tournament?.stages[state.tournament.stageIndex];

  return {
    publicMatchId: publicPlayerKey(summary.id, String(summary.at)).slice(0, 6).toUpperCase(),
    completedAt: new Date(summary.at).toISOString(),
    gameMode: modeLabels[state.settings.funMode],
    roomType: roomLabels[state.roomMode ?? "private"],
    playerCount: players.length,
    durationSeconds,
    roundLabel: `Round ${state.round}`,
    players,
    tournament: state.tournament
      ? {
          name: state.tournament.eventName ?? `${state.tournament.playerNationName} Thulla Cup`,
          round: activeTournamentStage?.name ?? "Final",
          status: state.tournament.status === "won"
            ? "champion"
            : state.tournament.status === "eliminated"
              ? "eliminated"
              : activeTournamentStage?.status === "complete"
                ? "qualified"
                : "complete"
        }
      : undefined
  };
}

export function formatMatchResultText(result: ShareableMatchResult, playUrl: string): string {
  const lines = result.players.map((player) => {
    if (player.becameBhabhi) return `\ud83d\ude02 ${player.displayName} - BHABHI`;
    if (player.finalPosition === 1) return `\ud83e\udd47 ${player.displayName} - Escaped First`;
    return `\u2705 ${player.displayName} - Escaped`;
  });

  const tournament = result.tournament
    ? [``, `${result.tournament.name} - ${result.tournament.round}`]
    : [];

  return [
    "Bhabhi Thulla - Match Result",
    "",
    ...lines,
    ...tournament,
    "",
    `Play: ${playUrl}`
  ].join("\n");
}

export function getMatchResultCaption(result: ShareableMatchResult): string {
  const current = result.players.find((player) => player.isCurrentPlayer);
  if (result.tournament?.status === "champion") return "Cup secured. Champion of the table!";
  if (result.tournament?.status === "qualified") return "Qualified for the next round!";
  if (current?.finalPosition === 1) return `Top escape! ${current.displayName} got out first.`;
  if (current?.becameBhabhi) return "Not my finest round. Rematch?";
  return "That one came down to the wire.";
}

export function formatMatchDuration(seconds: number | undefined): string {
  if (!seconds) return "Fast finish";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

export function resultImageFileName(result: ShareableMatchResult): string {
  const date = result.completedAt.slice(0, 10);
  return `bhabhi-thulla-match-${date}-${result.publicMatchId}.png`;
}

function safeAvatarUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^(?:https:\/\/|data:image\/)/i.test(value) ? value : undefined;
}

function cleanDisplayName(value: string): string {
  const cleaned = value.replace(/[<>\u0000-\u001f]/g, "").trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 24) || "Player";
}

function publicPlayerKey(value: string, salt: string): string {
  let hash = 2166136261;
  const input = `${salt}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

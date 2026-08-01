import type { GameSettings, Rank, Suit, TournamentNation } from "./types.js";

export const CARD_SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;

export const CARD_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 6,
  handSize: 0,
  targetScore: 5,
  turnSeconds: 20,
  allowSpectators: true,
  funMode: "classic"
};

export const DEAL_ANIMATION_MS = 3000;

export const TRICK_REVEAL_MS = 4200;

export const RANK_POINTS: Record<Rank, number> = {
  A: 14,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13
};

export const ACTION_RANKS: ReadonlySet<Rank> = new Set();

export const SUIT_LABELS: Record<Suit, string> = {
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
  spades: "Spades"
};

export const SUIT_GLYPHS: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠"
};

export const BOT_NAMES = [
  "Mara",
  "Knox",
  "Vega",
  "Iris",
  "Sol",
  "Juno",
  "Rook",
  "Echo"
] as const;

export const AVATAR_PRESETS = [
  "Aero",
  "Bolt",
  "Crown",
  "Drift",
  "Flux",
  "Glint",
  "Halo",
  "Ivy"
] as const;

export const NATION_OPTIONS: TournamentNation[] = [
  { code: "PAK", name: "Pakistan", flag: "🇵🇰" },
  { code: "ENG", name: "England", flag: "🇬🇧" },
  { code: "IND", name: "India", flag: "🇮🇳" },
  { code: "USA", name: "United States", flag: "🇺🇸" },
  { code: "BRA", name: "Brazil", flag: "🇧🇷" },
  { code: "FRA", name: "France", flag: "🇫🇷" },
  { code: "GER", name: "Germany", flag: "🇩🇪" },
  { code: "ESP", name: "Spain", flag: "🇪🇸" },
  { code: "ITA", name: "Italy", flag: "🇮🇹" },
  { code: "TUR", name: "Turkey", flag: "🇹🇷" },
  { code: "CAN", name: "Canada", flag: "🇨🇦" },
  { code: "AUS", name: "Australia", flag: "🇦🇺" },
  { code: "ARG", name: "Argentina", flag: "🇦🇷" },
  { code: "POR", name: "Portugal", flag: "🇵🇹" },
  { code: "NED", name: "Netherlands", flag: "🇳🇱" },
  { code: "BEL", name: "Belgium", flag: "🇧🇪" },
  { code: "SUI", name: "Switzerland", flag: "🇨🇭" },
  { code: "SWE", name: "Sweden", flag: "🇸🇪" },
  { code: "NOR", name: "Norway", flag: "🇳🇴" },
  { code: "DEN", name: "Denmark", flag: "🇩🇰" },
  { code: "POL", name: "Poland", flag: "🇵🇱" },
  { code: "JPN", name: "Japan", flag: "🇯🇵" },
  { code: "KOR", name: "South Korea", flag: "🇰🇷" },
  { code: "CHN", name: "China", flag: "🇨🇳" },
  { code: "MEX", name: "Mexico", flag: "🇲🇽" },
  { code: "MAR", name: "Morocco", flag: "🇲🇦" },
  { code: "EGY", name: "Egypt", flag: "🇪🇬" },
  { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "UAE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "RSA", name: "South Africa", flag: "🇿🇦" },
  { code: "NZL", name: "New Zealand", flag: "🇳🇿" }
];

export function getNationByCode(code: string): TournamentNation | undefined {
  return NATION_OPTIONS.find((nation) => nation.code === code.trim().toUpperCase());
}

export function isSuit(value: string): value is Suit {
  return CARD_SUITS.includes(value as Suit);
}

export function isActionRank(rank: Rank): boolean {
  return ACTION_RANKS.has(rank);
}

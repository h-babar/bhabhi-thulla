import type { BotDifficulty } from "@getaway-cards/shared";

export type TournamentStatus = "open" | "live" | "upcoming" | "completed" | "private";
export type TournamentKind = "daily" | "weekly" | "weekend" | "private" | "offline";
export type LeaderboardKind = "dailyWins" | "weeklyPoints" | "champions" | "teams";

export interface TournamentPlayer {
  id: string;
  name: string;
  avatar: string;
  seed: number;
  status: "ready" | "playing" | "qualified" | "eliminated";
}

export interface MatchScheduleItem {
  id: string;
  title: string;
  time: string;
  table: string;
  status: "scheduled" | "live" | "completed";
  participants: string[];
  result?: string;
}

export interface TournamentRound {
  name: string;
  slots: Array<{
    id: string;
    player?: string;
    status: "empty" | "waiting" | "advanced" | "eliminated";
  }>;
}

export interface TournamentItem {
  id: string;
  kind: TournamentKind;
  status: TournamentStatus;
  name: string;
  entryStatus: string;
  startTime: string;
  players: number;
  maxPlayers: number;
  reward: string;
  mode: string;
  tier: string;
  format: string;
  duration: string;
  checkIn: string;
  currentStage: string;
  description: string;
  entryRequirements: string[];
  rules: string[];
  rewardDetails: string[];
  playerList: TournamentPlayer[];
  schedule: MatchScheduleItem[];
  bracket: TournamentRound[];
  playMode: "online" | "offline";
  difficulty?: BotDifficulty;
  turnSeconds?: number;
}

export interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  reward: string;
  progress: number;
  goal: number;
  resetAt: string;
  completed: boolean;
  claimed: boolean;
}

export interface WeeklyMission {
  id: string;
  title: string;
  progress: number;
  goal: number;
  points: number;
}

export interface WeeklyEvent {
  id: string;
  title: string;
  subtitle: string;
  resetAt: string;
  seasonPoints: number;
  rewardChest: {
    name: string;
    tier: string;
    progress: number;
    goal: number;
    rewards: string[];
  };
  missions: WeeklyMission[];
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  avatar: string;
  wins: number;
  points: number;
  badge: string;
}

export interface EngagementMockData {
  tournaments: TournamentItem[];
  offlineTournaments: TournamentItem[];
  dailyChallenges: ChallengeItem[];
  weeklyEvent: WeeklyEvent;
  leaderboards: Record<LeaderboardKind, LeaderboardEntry[]>;
}

const names = [
  ["Hamza", "HB"],
  ["Mara Bot", "MB"],
  ["Knox Bot", "KB"],
  ["Vega Bot", "VB"],
  ["Ayaan", "AY"],
  ["Sana", "SA"],
  ["Zain", "ZA"],
  ["Noor", "NO"],
  ["Rayan", "RY"],
  ["Amara", "AM"],
  ["Tariq", "TA"],
  ["Lina", "LI"]
] as const;

export function getEngagementMockData(now = new Date()): EngagementMockData {
  const resetDaily = nextHour(now, 24);
  const weeklyReset = addDays(startOfNextWeek(now), 0);
  const tournaments: TournamentItem[] = [
    tournament({
      id: "daily-thulla-cup",
      kind: "daily",
      status: "open",
      name: "Daily Thulla Cup",
      entryStatus: "Open now",
      startOffsetMinutes: 42,
      players: 38,
      maxPlayers: 64,
      reward: "1,200 Season Points",
      mode: "Classic 20s",
      description: "A fast daily bracket for players who want one serious run before the reset.",
      now
    }),
    tournament({
      id: "weekly-championship",
      kind: "weekly",
      status: "upcoming",
      name: "Weekly Championship",
      entryStatus: "Qualify with 500 SP",
      startOffsetMinutes: 430,
      players: 92,
      maxPlayers: 128,
      reward: "Gold Chest + Champion Badge",
      mode: "Marathon",
      description: "The headline weekly championship with group stage seeding and knockout finals.",
      now
    }),
    tournament({
      id: "weekend-knockout",
      kind: "weekend",
      status: "live",
      name: "Weekend Knockout",
      entryStatus: "Spectate live",
      startOffsetMinutes: -18,
      players: 24,
      maxPlayers: 32,
      reward: "Weekend Crown",
      mode: "Turbo 10s",
      description: "A pressure-heavy weekend event where every slow turn can ruin the run.",
      now
    }),
    tournament({
      id: "private-majlis",
      kind: "private",
      status: "private",
      name: "Private Majlis Tournament",
      entryStatus: "Invite code required",
      startOffsetMinutes: 125,
      players: 7,
      maxPlayers: 16,
      reward: "Custom Room Trophy",
      mode: "Private Classic",
      description: "Create a private competitive bracket for friends, family, or club nights.",
      now
    }),
    tournament({
      id: "rookie-rush",
      kind: "daily",
      status: "upcoming",
      name: "Rookie Rush",
      entryStatus: "Opens soon",
      startOffsetMinutes: 210,
      players: 15,
      maxPlayers: 32,
      reward: "Starter Chest",
      mode: "Easy Bots Allowed",
      description: "A calmer bracket for newer players learning clean suit-following and Dhulla control.",
      now
    }),
    tournament({
      id: "night-aces",
      kind: "weekly",
      status: "completed",
      name: "Night Aces Final",
      entryStatus: "Completed",
      startOffsetMinutes: -940,
      players: 64,
      maxPlayers: 64,
      reward: "Hall of Fame Slot",
      mode: "Classic",
      description: "Yesterday's final, archived for champion history and replay-style presentation.",
      now
    })
  ];
  const offlineTournaments: TournamentItem[] = [
    offlineTournament({
      id: "rookie-road-cup",
      name: "Rookie Road Cup",
      difficulty: "easy",
      turnSeconds: 20,
      reward: "350 SP + Bronze Card Sleeve",
      tier: "Starter Division",
      description: "A forgiving four-stage solo cup with readable bot play and room to learn every table situation.",
      now
    }),
    offlineTournament({
      id: "emerald-solo-circuit",
      name: "Emerald Solo Circuit",
      difficulty: "normal",
      turnSeconds: 18,
      reward: "700 SP + Emerald Card Back",
      tier: "Pro Division",
      description: "Balanced AI, tighter turns, and a full Group-to-Final run built for regular competitive practice.",
      now
    }),
    offlineTournament({
      id: "midnight-masters",
      name: "Midnight Masters",
      difficulty: "hard",
      turnSeconds: 15,
      reward: "1,250 SP + Midnight Crown",
      tier: "Masters Division",
      description: "The serious solo test: expert bots conserve suits, pressure weak hands, and punish rushed decisions.",
      now
    })
  ];

  return {
    tournaments,
    offlineTournaments,
    dailyChallenges: [
      {
        id: "daily-bot-win",
        title: "Win 1 game against bots",
        description: "Beat any bot table before the daily reset.",
        reward: "250 SP + Bronze Chest",
        progress: 0,
        goal: 1,
        resetAt: resetDaily,
        completed: false,
        claimed: false
      },
      {
        id: "daily-three-tricks",
        title: "Win 3 tricks in a row",
        description: "Control the table and win three consecutive tricks.",
        reward: "180 SP",
        progress: 2,
        goal: 3,
        resetAt: resetDaily,
        completed: false,
        claimed: false
      },
      {
        id: "daily-legal-cards",
        title: "Play 5 legal cards correctly",
        description: "Follow suit cleanly and avoid invalid plays.",
        reward: "100 SP",
        progress: 5,
        goal: 5,
        resetAt: resetDaily,
        completed: true,
        claimed: false
      },
      {
        id: "daily-expert-bot",
        title: "Beat Expert Bot once",
        description: "Win against a hard bot table.",
        reward: "Expert Token",
        progress: 0,
        goal: 1,
        resetAt: resetDaily,
        completed: false,
        claimed: false
      }
    ],
    weeklyEvent: {
      id: "season-heatwave",
      title: "Royal Green Season",
      subtitle: "Earn season points from tournaments, missions, and clean wins.",
      resetAt: weeklyReset,
      seasonPoints: 1840,
      rewardChest: {
        name: "Weekly Reward Chest",
        tier: "Gold",
        progress: 4200,
        goal: 6000,
        rewards: ["Gold Card Back", "1,500 SP", "Tournament Ticket"]
      },
      missions: [
        { id: "weekly-win-10", title: "Win 10 games", progress: 6, goal: 10, points: 900 },
        { id: "weekly-play-25", title: "Play 25 matches", progress: 14, goal: 25, points: 700 },
        { id: "weekly-join-3", title: "Join 3 tournaments", progress: 1, goal: 3, points: 650 },
        { id: "weekly-tricks-30", title: "Win 30 tricks", progress: 22, goal: 30, points: 500 },
        { id: "weekly-daily-5", title: "Complete 5 daily challenges", progress: 3, goal: 5, points: 850 }
      ]
    },
    leaderboards: {
      dailyWins: leaderboard(["Daily Ace", "Fast Climber", "Clean Suit", "Hot Streak"], 18),
      weeklyPoints: leaderboard(["Season Shark", "Gold Run", "Table Boss", "Grinder"], 84),
      champions: leaderboard(["Champion", "Finalist", "Bracket King", "Cup Holder"], 43),
      teams: leaderboard(["Club Captain", "Squad Lead", "Team Ace", "Crew MVP"], 64)
    }
  };
}

function tournament(input: {
  id: string;
  kind: TournamentKind;
  status: TournamentStatus;
  name: string;
  entryStatus: string;
  startOffsetMinutes: number;
  players: number;
  maxPlayers: number;
  reward: string;
  mode: string;
  description: string;
  now: Date;
}): TournamentItem {
  const start = new Date(input.now.getTime() + input.startOffsetMinutes * 60_000);
  const profile = tournamentProfile(input.kind);
  const isLive = input.status === "live";
  const isCompleted = input.status === "completed";
  return {
    ...input,
    playMode: "online",
    startTime: start.toISOString(),
    ...profile,
    currentStage: isCompleted ? "Completed" : isLive ? "Group Stage" : "Registration",
    entryRequirements: [
      "Guest profile or signed-in player name",
      input.kind === "private" ? "Private invite code" : "One open tournament ticket",
      "Stable connection for live rounds"
    ],
    rules: [
      "Server validates all card moves",
      "Ace of Spades opens the hand",
      "Timeouts count as Dhulla in live rounds",
      "Top finishers advance to the next stage"
    ],
    rewardDetails: [
      input.reward,
      "Season points are added to the weekly event board",
      "Champion badges appear on leaderboard rows"
    ],
    playerList: names.slice(0, Math.min(10, input.players)).map(([name, avatar], index) => ({
      id: `${input.id}-player-${index + 1}`,
      name,
      avatar,
      seed: index + 1,
      status: index < 3 ? "qualified" : input.status === "live" && index < 6 ? "playing" : "ready"
    })),
    schedule: [
      {
        id: `${input.id}-group`,
        title: "Group Stage",
        time: timeLabel(start),
        table: "Tables 1-8",
        status: isCompleted ? "completed" : isLive ? "live" : "scheduled",
        participants: ["Hamza", "Mara Bot", "Ayaan", "Sana"],
        result: isCompleted ? "Hamza and Ayaan qualified" : undefined
      },
      {
        id: `${input.id}-quarter`,
        title: "Quarter Finals",
        time: timeLabel(addMinutes(start, 45)),
        table: "Tables 1-4",
        status: isCompleted ? "completed" : "scheduled",
        participants: isCompleted ? ["Hamza", "Ayaan", "Noor", "Zain"] : ["Qualifier 1", "Qualifier 2", "Qualifier 3", "Qualifier 4"],
        result: isCompleted ? "Hamza and Noor advanced" : undefined
      },
      {
        id: `${input.id}-semi`,
        title: "Semi Finals",
        time: timeLabel(addMinutes(start, 80)),
        table: "Tables 1-2",
        status: isCompleted ? "completed" : "scheduled",
        participants: isCompleted ? ["Hamza", "Noor"] : ["Quarter-final winners"],
        result: isCompleted ? "Hamza won the semi-final" : undefined
      },
      {
        id: `${input.id}-final`,
        title: "Grand Final",
        time: timeLabel(addMinutes(start, 110)),
        table: "Main Table",
        status: isCompleted ? "completed" : "scheduled",
        participants: isCompleted ? ["Hamza", "Mara Bot"] : ["Semi-final winners"],
        result: isCompleted ? "Hamza - Champion" : undefined
      }
    ],
    bracket: tournamentBracket(input.status)
  };
}

function tournamentProfile(kind: TournamentKind): Pick<TournamentItem, "tier" | "format" | "duration" | "checkIn"> {
  if (kind === "daily") {
    return { tier: "Open Division", format: "Groups to knockout", duration: "About 2 hours", checkIn: "15 min before start" };
  }
  if (kind === "weekly") {
    return { tier: "Premier Division", format: "Seeded groups and finals", duration: "About 3 hours", checkIn: "30 min before start" };
  }
  if (kind === "weekend") {
    return { tier: "Elite Knockout", format: "Turbo elimination", duration: "About 90 minutes", checkIn: "10 min before start" };
  }
  if (kind === "offline") {
    return { tier: "Solo Division", format: "Four-stage AI circuit", duration: "About 35 minutes", checkIn: "Play instantly" };
  }
  return { tier: "Private League", format: "Host-managed bracket", duration: "Host selected", checkIn: "Invite holders only" };
}

function offlineTournament(input: {
  id: string;
  name: string;
  difficulty: BotDifficulty;
  turnSeconds: number;
  reward: string;
  tier: string;
  description: string;
  now: Date;
}): TournamentItem {
  const base = tournament({
    id: input.id,
    kind: "offline",
    status: "open",
    name: input.name,
    entryStatus: "Ready now",
    startOffsetMinutes: 0,
    players: 1,
    maxPlayers: 4,
    reward: input.reward,
    mode: `${difficultyLabel(input.difficulty)} AI`,
    description: input.description,
    now: input.now
  });

  return {
    ...base,
    playMode: "offline",
    difficulty: input.difficulty,
    turnSeconds: input.turnSeconds,
    tier: input.tier,
    format: "Group, Quarter, Semi, Final",
    duration: input.difficulty === "easy" ? "25-35 minutes" : input.difficulty === "normal" ? "30-40 minutes" : "35-45 minutes",
    checkIn: "No matchmaking required",
    currentStage: "Stage 1 of 4",
    entryRequirements: ["Any guest profile", "No tournament ticket", "Solo play against three AI opponents"],
    rules: ["Standard Bhabhi Thulla rules", "Ace of Spades opens the first hand", "Server validates every legal move", "Win each table to unlock the next stage"],
    rewardDetails: [input.reward, "Reward unlocks only after winning the Final", "Best stage and championships are saved on this device"],
    playerList: [
      { id: `${input.id}-you`, name: "You", avatar: "YOU", seed: 1, status: "ready" },
      { id: `${input.id}-bot-1`, name: "Mara Bot", avatar: "MB", seed: 2, status: "ready" },
      { id: `${input.id}-bot-2`, name: "Knox Bot", avatar: "KB", seed: 3, status: "ready" },
      { id: `${input.id}-bot-3`, name: "Vega Bot", avatar: "VB", seed: 4, status: "ready" }
    ],
    schedule: ["Group Stage", "Quarter Finals", "Semi Finals", "Grand Final"].map((title, index) => ({
      id: `${input.id}-solo-${index + 1}`,
      title,
      time: index === 0 ? "Ready now" : `Unlock after stage ${index}`,
      table: `Solo Table ${index + 1}`,
      status: "scheduled",
      participants: index === 0 ? ["You", "Mara Bot", "Knox Bot", "Vega Bot"] : ["You", "Three new AI challengers"]
    })),
    bracket: [
      bracketRound("Group Stage", ["You", "Mara Bot", "Knox Bot", "Vega Bot"]),
      bracketRound("Quarter Finals", ["TBD", "TBD", "TBD", "TBD"], true),
      bracketRound("Semi Finals", ["TBD", "TBD", "TBD", "TBD"], true),
      bracketRound("Grand Final", ["Champion Slot", "TBD", "TBD", "TBD"], true)
    ]
  };
}

function difficultyLabel(difficulty: BotDifficulty): string {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "hard") return "Expert";
  return "Smart";
}

function tournamentBracket(status: TournamentStatus): TournamentRound[] {
  if (status === "completed") {
    return [
      bracketRound("Group Stage", ["Hamza", "Mara Bot", "Ayaan", "Sana"], false, "advanced"),
      bracketRound("Quarter Finals", ["Hamza", "Ayaan", "Noor", "Zain"], false, "advanced"),
      bracketRound("Semi Finals", ["Hamza", "Noor"], false, "advanced"),
      bracketRound("Grand Final", ["Hamza"], false, "advanced")
    ];
  }

  if (status === "live") {
    return [
      bracketRound("Group Stage", ["Hamza", "Mara Bot", "Ayaan", "Sana"], false, "waiting"),
      bracketRound("Quarter Finals", ["TBD", "TBD", "TBD", "TBD"], true),
      bracketRound("Semi Finals", ["TBD", "TBD"], true),
      bracketRound("Grand Final", ["Champion Slot"], true)
    ];
  }

  return [
    bracketRound("Group Stage", ["Hamza", "Mara Bot", "Ayaan", "Sana"]),
    bracketRound("Quarter Finals", ["TBD", "TBD", "TBD", "TBD"], true),
    bracketRound("Semi Finals", ["TBD", "TBD"], true),
    bracketRound("Grand Final", ["Champion Slot"], true)
  ];
}

function bracketRound(
  name: string,
  players: string[],
  locked = false,
  populatedStatus: TournamentRound["slots"][number]["status"] = "waiting"
): TournamentRound {
  return {
    name,
    slots: players.map((player, index) => ({
      id: `${name}-${index}`,
      player: locked || player === "TBD" ? undefined : player,
      status: locked || player === "TBD" ? "empty" : populatedStatus
    }))
  };
}

function leaderboard(badges: string[], basePoints: number): LeaderboardEntry[] {
  return names.slice(0, 10).map(([playerName, avatar], index) => ({
    rank: index + 1,
    playerName,
    avatar,
    wins: Math.max(1, 16 - index + (index % 3)),
    points: Math.max(120, (10 - index) * basePoints + 420),
    badge: badges[index % badges.length] ?? "Contender"
  }));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function nextHour(now: Date, hour: number): string {
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

function startOfNextWeek(now: Date): Date {
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(0, 0, 0, 0);
  return next;
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

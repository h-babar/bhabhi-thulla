import {
  NATION_OPTIONS,
  type BotDifficulty,
  type Card,
  type FunMode,
  type RoomVisibility,
  type TournamentNation
} from "@getaway-cards/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  CalendarDays,
  ChevronRight,
  Clipboard,
  Crown,
  Gamepad2,
  GraduationCap,
  Gift,
  Globe2,
  LockKeyhole,
  LogIn,
  Medal,
  Plus,
  Search,
  Share2,
  Spade,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
  Wifi,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getEngagementMockData } from "../data/engagementMock.js";
import { useGameStore } from "../store/gameStore.js";
import { CardView } from "./CardView.js";
import { CountdownTimer } from "./engagement/CountdownTimer.js";
import { RulesModal } from "./RulesModal.js";
import { SettingsModal } from "./SettingsModal.js";
import { ProfileMenu } from "./auth/ProfileMenu.js";
import { PlayerAvatar } from "./auth/PlayerAvatar.js";
import { useAuthStore } from "../store/authStore.js";
import { profileAvatarSource } from "../lib/profileAvatar.js";
import { FriendsButton } from "./friends/FriendsButton.js";
import { FriendsOnlineWidget } from "./friends/FriendsOnlineWidget.js";
import { DailyRewardPanel } from "./rewards/DailyRewardPanel.js";

interface HomeScreenProps {
  initialRoomCode?: string;
}

const heroCards: Card[] = [
  { id: "hero-spades-A", rank: "A", suit: "spades" },
  { id: "hero-spades-K", rank: "K", suit: "spades" },
  { id: "hero-hearts-3", rank: "3", suit: "hearts" },
  { id: "hero-clubs-9", rank: "9", suit: "clubs" }
];

const tournamentStages = ["Group Stage", "Quarter Final", "Semi Final", "Final"];

export function HomeScreen({ initialRoomCode }: HomeScreenProps) {
  const username = useGameStore((store) => store.username);
  const avatar = useGameStore((store) => store.avatar);
  const rooms = useGameStore((store) => store.rooms);
  const socketStatus = useGameStore((store) => store.socketStatus);
  const activeGame = useGameStore((store) => store.activeGame);
  const lastMatchResult = useGameStore((store) => store.lastMatchResult);
  const openMatchResult = useGameStore((store) => store.openMatchResult);
  const rejoinActiveGame = useGameStore((store) => store.rejoinActiveGame);
  const createRoom = useGameStore((store) => store.createRoom);
  const joinRoom = useGameStore((store) => store.joinRoom);
  const quickPlay = useGameStore((store) => store.quickPlay);
  const playWithBots = useGameStore((store) => store.playWithBots);
  const startTournament = useGameStore((store) => store.startTournament);
  const openTournaments = useGameStore((store) => store.openTournaments);
  const refreshRooms = useGameStore((store) => store.refreshRooms);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [joinCode, setJoinCode] = useState(initialRoomCode ?? "");
  const [asSpectator, setAsSpectator] = useState(false);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [tournamentDifficulty, setTournamentDifficulty] = useState<BotDifficulty>("normal");
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [nationCode, setNationCode] = useState("PAK");
  const [botCount, setBotCount] = useState(3);
  const [targetScore, setTargetScore] = useState(1);
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [funMode, setFunMode] = useState<FunMode>("classic");
  const [roomVisibility, setRoomVisibility] = useState<RoomVisibility>("private");
  const authGuest = useAuthStore((store) => store.guest);
  const authProfile = useAuthStore((store) => store.profile);
  const openProfile = useAuthStore((store) => store.openProfile);
  const account = authProfile ?? authGuest;

  useEffect(() => {
    setJoinCode((current) => current || initialRoomCode || "");
  }, [initialRoomCode]);

  useEffect(() => {
    refreshRooms();
  }, [refreshRooms]);

  const roomCountLabel = useMemo(() => {
    if (rooms.length === 0) return "No live rooms yet";
    return `${rooms.length} live room${rooms.length === 1 ? "" : "s"}`;
  }, [rooms.length]);
  const engagementData = useMemo(() => getEngagementMockData(), []);
  const todayChallenge = engagementData.dailyChallenges[0]!;
  const nextTournament =
    engagementData.tournaments.find((tournament) => tournament.status === "open") ?? engagementData.tournaments[0]!;
  const currentRank = engagementData.leaderboards.weeklyPoints.find((entry) => entry.playerName === username)?.rank ?? 7;
  const selectedNation = useMemo(
    () => NATION_OPTIONS.find((nation) => nation.code === nationCode) ?? NATION_OPTIONS[0]!,
    [nationCode]
  );
  const filteredNations = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) {
      return NATION_OPTIONS;
    }

    return NATION_OPTIONS.filter((nation) =>
      nation.name.toLowerCase().includes(query) || nation.code.toLowerCase().includes(query)
    );
  }, [countryQuery]);

  return (
    <main className="home-page-shell home-game-lobby min-h-screen w-full px-3 py-3 sm:px-5 sm:py-4 lg:px-7">
      <div className="home-lobby-frame mx-auto w-full max-w-[94rem]">
        <header className="home-topbar home-game-header mb-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="home-logo-mark home-game-crest grid h-12 w-12 shrink-0 place-items-center text-lg font-black">
              <Crown size={22} />
            </div>
            <div className="min-w-0">
              <p className="home-brand-kicker"><span>Online Card</span>{" "}<span>Arena</span></p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <div className={`home-server-pill ${socketStatus === "online" ? "is-online" : ""}`}>
              <Wifi size={15} />
              <span>{socketStatus === "online" ? "Live" : "Connecting"}</span>
            </div>
            <button className="home-nav-button" onClick={() => setRulesOpen(true)}>
              <Clipboard size={17} />
              <span className="hidden sm:inline">Rules</span>
            </button>
            <FriendsButton className="home-friends-button" />
            <button className="home-nav-button is-icon" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
              <Settings size={18} />
            </button>
            <ProfileMenu compact onSettings={() => setSettingsOpen(true)} />
          </div>
        </header>

        <AnimatePresence>
          {activeGame ? (
            <motion.section
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/30 bg-[linear-gradient(110deg,rgba(15,118,110,0.3),rgba(245,158,11,0.14))] px-4 py-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-amber-200/35 bg-amber-200/15 text-amber-200">
                  <Bot size={21} />
                </span>
                <span>
                  <small className="block text-[0.64rem] font-black uppercase tracking-[0.2em] text-amber-200">Active game found</small>
                  <strong className="block text-base">Room {activeGame.roomCode}</strong>
                  <em className="block text-xs not-italic text-white/65">
                    {activeGame.playerCount}/{activeGame.maxPlayers} players • Your seat is reserved
                  </em>
                </span>
              </div>
              <button className="primary-button px-5 py-2.5" onClick={rejoinActiveGame}>
                <LogIn size={17} /> Rejoin Game
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {lastMatchResult ? (
            <motion.section
              className="home-last-result-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <span className="home-last-result-icon"><Trophy size={20} /></span>
              <span className="home-last-result-copy">
                <small>Latest match</small>
                <strong>
                  {lastMatchResult.players.find((player) => player.becameBhabhi)?.displayName ?? "Last player"} became Bhabhi
                </strong>
                <em>Result #{lastMatchResult.publicMatchId} is ready to share</em>
              </span>
              <button type="button" onClick={openMatchResult}>
                <Share2 size={17} />
                View Share Card
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <section className="home-launch-grid">
          <motion.section
            className="home-arena-stage"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="home-arena-copy">
              <div className="home-live-kicker">
                <span /> Live tables open
              </div>
              <p className="home-season-label">Season circuit 01</p>
              <h2>
                Bhabhi
                <span>Thulla</span>
              </h2>
              <p className="home-arena-subtitle">
                Outsmart the table. Escape first. Leave one player holding the cards.
              </p>

              <div className="home-mode-launcher">
                <button
                  className="home-mode-card is-primary"
                  onClick={() => quickPlay("normal", { targetScore: 1, turnSeconds, funMode })}
                >
                  <span className="home-mode-icon"><Spade size={23} fill="currentColor" /></span>
                  <span>
                    <small>Quick match</small>
                    <strong>Play Online</strong>
                  </span>
                  <ChevronRight size={20} />
                </button>
                <button className="home-mode-card is-tournament" onClick={openTournaments}>
                  <span className="home-mode-icon"><Trophy size={21} /></span>
                  <span>
                    <small>Ranked circuit</small>
                    <strong>Tournament</strong>
                  </span>
                  <ChevronRight size={20} />
                </button>
                <button className="home-mode-card is-compact is-practice" onClick={() => setPracticeOpen(true)}>
                  <span className="home-mode-icon"><GraduationCap size={20} /></span>
                  <span>
                    <small>Learn the table</small>
                    <strong>Practice</strong>
                  </span>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="home-arena-meta">
                <span><Shield size={15} /> Server-validated play</span>
                <span><Users size={15} /> {roomCountLabel}</span>
              </div>

            </div>

            <div className="home-arena-flow" aria-label="How a Bhabhi Thulla hand flows">
              <div className="home-arena-flow-heading">
                <span><Swords size={15} /> Table flow</span>
                <em><i /> Ready for a hand</em>
              </div>
              <div className="home-arena-flow-steps">
                <span>
                  <i><Spade size={15} fill="currentColor" /></i>
                  <small>Opening</small>
                  <strong>A♠ starts</strong>
                </span>
                <b><ChevronRight size={14} /></b>
                <span>
                  <i><Shield size={15} /></i>
                  <small>Play clean</small>
                  <strong>Follow suit</strong>
                </span>
                <b><ChevronRight size={14} /></b>
                <span>
                  <i><Trophy size={15} /></i>
                  <small>Goal</small>
                  <strong>Escape first</strong>
                </span>
              </div>
            </div>

            <div className="home-arena-visual" aria-hidden="true">
              <div className="home-hero-table">
                <span className="home-table-emblem">BT</span>
              </div>
              <div className="home-card-showcase pointer-events-none absolute inset-0">
                {heroCards.map((card, index) => (
                  <motion.div
                    key={card.id}
                    className={`home-floating-card home-floating-card-${index + 1}`}
                    animate={{
                      y: [0, -8 - index * 1.5, 0],
                      rotate: [-17 + index * 10, -13 + index * 10, -17 + index * 10]
                    }}
                    transition={{ duration: 3.4 + index * 0.3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <CardView card={card} compact={index > 1} />
                  </motion.div>
                ))}
              </div>
              <div className="home-visual-badge">
                <Swords size={16} /> Classic table ready
              </div>
            </div>
          </motion.section>

          <aside className="home-command-deck">
            <button className="home-profile-row" onClick={openProfile}>
              <PlayerAvatar name={account?.displayName ?? username} {...profileAvatarSource(authProfile, account?.avatarId ?? avatar)} frame={authProfile?.profileFrameId} size="md" onlineState="online" level={authProfile?.level} rank={authProfile?.rank} showLevel={Boolean(authProfile)} isGuest={!authProfile} />
              <span className="min-w-0 flex-1 text-left">
                <p>{authProfile ? `${authProfile.rank} - Level ${authProfile.level}` : "Guest player"}</p>
                <strong>{account?.displayName ?? username}</strong>
                <small>{authProfile ? `@${authProfile.username}` : "Progress saved on this device"}</small>
              </span>
              <ChevronRight size={18} />
            </button>

            <DailyRewardPanel />

            <div className="home-command-heading">
              <div>
                <p>{roomVisibility === "private" ? "Private table" : "Public table"}</p>
                <h3>Join your friends</h3>
              </div>
              <LogIn size={21} />
            </div>
            <div className="home-room-entry">
              <input
                className="field uppercase"
                placeholder="6-digit code"
                value={joinCode}
                maxLength={6}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                aria-label="Room code"
              />
              <button onClick={() => joinRoom(joinCode, asSpectator)} aria-label="Join room">
                Join <ChevronRight size={17} />
              </button>
            </div>
            <div className="home-private-actions">
              <button
                onClick={() => createRoom(
                  { targetScore, turnSeconds, funMode, maxPlayers: 6 },
                  roomVisibility
                )}
              >
                <Plus size={17} /> Create room
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={asSpectator}
                  onChange={(event) => setAsSpectator(event.target.checked)}
                />
                Spectator
              </label>
            </div>
            <div className="home-room-privacy" role="group" aria-label="Room visibility">
              <button
                className={roomVisibility === "private" ? "is-active" : undefined}
                onClick={() => setRoomVisibility("private")}
                type="button"
              >
                <LockKeyhole size={16} />
                <span><strong>Private</strong><small>Code only</small></span>
              </button>
              <button
                className={roomVisibility === "public" ? "is-active" : undefined}
                onClick={() => setRoomVisibility("public")}
                type="button"
              >
                <Globe2 size={16} />
                <span><strong>Public</strong><small>Listed live</small></span>
              </button>
            </div>

            <div className="home-command-divider"><span>or challenge AI</span></div>

            <div className="home-bot-launcher">
              <div className="home-bot-title">
                <span><Bot size={20} /></span>
                <div><small>Solo table</small><strong>Play with Bots</strong></div>
              </div>
              <div className="home-bot-controls">
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
                  aria-label="Bot difficulty"
                >
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
                <select value={botCount} onChange={(event) => setBotCount(Number(event.target.value))} aria-label="Bot count">
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>{count} bot{count === 1 ? "" : "s"}</option>
                  ))}
                </select>
                <button onClick={() => playWithBots(difficulty, botCount, { targetScore, turnSeconds, funMode })}>
                  Start
                </button>
              </div>
            </div>

            <button className="home-featured-cup" onClick={openTournaments}>
              <span className="home-featured-cup-icon"><Trophy size={21} /></span>
              <span className="min-w-0 flex-1">
                <small>Featured tournament</small>
                <strong>{nextTournament.name}</strong>
                <em>{nextTournament.players}/{nextTournament.maxPlayers} players - {nextTournament.reward}</em>
              </span>
              <ChevronRight size={19} />
            </button>
          </aside>
        </section>

        <FriendsOnlineWidget />

        <div className="home-section-heading">
          <div>
            <p>Competitive circuit</p>
            <h2>Play. Progress. Return stronger.</h2>
          </div>
          <button onClick={openTournaments}>View all events <ChevronRight size={17} /></button>
        </div>
        <section className="home-event-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HomeEngagementCard
          icon={<Gift size={20} />}
          eyebrow="Today's Challenge"
          title={todayChallenge.title}
          body={todayChallenge.reward}
          action="Daily mission"
          cta="View Challenge"
          tone="challenge"
          progress={todayChallenge.progress}
          goal={todayChallenge.goal}
          progressLabel={`${todayChallenge.progress} / ${todayChallenge.goal}`}
          onClick={openTournaments}
        />
        <HomeEngagementCard
          icon={<Trophy size={20} />}
          eyebrow="Next Tournament"
          title={nextTournament.name}
          body={`${nextTournament.players}/${nextTournament.maxPlayers} players - ${nextTournament.reward}`}
          action="Open entry"
          cta="View Details"
          tone="tournament"
          progress={nextTournament.players}
          goal={nextTournament.maxPlayers}
          progressLabel={`${nextTournament.players} / ${nextTournament.maxPlayers} players`}
          onClick={openTournaments}
          footer={<CountdownTimer targetTime={nextTournament.startTime} label="Starts" compact />}
        />
        <HomeEngagementCard
          icon={<CalendarDays size={20} />}
          eyebrow="Weekly Event"
          title={engagementData.weeklyEvent.title}
          body={`${engagementData.weeklyEvent.seasonPoints.toLocaleString()} season points earned`}
          action="Season live"
          cta="See Missions"
          tone="weekly"
          progress={engagementData.weeklyEvent.seasonPoints}
          goal={engagementData.weeklyEvent.rewardChest.goal}
          progressLabel={`${engagementData.weeklyEvent.seasonPoints.toLocaleString()} / ${engagementData.weeklyEvent.rewardChest.goal.toLocaleString()} SP`}
          onClick={openTournaments}
        />
        <HomeEngagementCard
          icon={<Medal size={20} />}
          eyebrow="Current Rank"
          title={`#${currentRank} Weekly`}
          body="Climb with wins, missions, and tournament entries."
          action="Leaderboard"
          cta="View Leaderboard"
          tone="rank"
          rankLabel={`#${currentRank}`}
          onClick={openTournaments}
        />
      </section>

        <section className="home-lower-grid">
          <div className="home-lower-panel">
            <div className="home-lower-heading">
              <span><Users size={18} /></span>
              <div><p>Table browser</p><h3>{roomCountLabel}</h3></div>
            </div>
            <div className="home-room-list">
              {rooms.slice(0, 4).map((room) => (
                <button key={room.roomCode} onClick={() => joinRoom(room.roomCode, room.status === "playing")}>
                  <span className="home-room-code">{room.roomCode}</span>
                  <span>{room.playerCount}/{room.maxPlayers}</span>
                  <span className={`home-room-status is-${room.status}`}>{room.status.replace("_", " ")}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {rooms.length === 0 ? (
                <div className="home-empty-room">
                  <span><Plus size={18} /></span>
                  <div><strong>No public rooms yet</strong><small>Create a room and invite your table.</small></div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="home-lower-panel">
            <div className="home-lower-heading">
              <span><Gamepad2 size={18} /></span>
              <div><p>Match preferences</p><h3>Table setup</h3></div>
            </div>
            <div className="home-setup-grid">
              <label>
                <span>Target escapes</span>
                <input type="number" min={1} max={20} value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} />
              </label>
              <label>
                <span>Turn timer</span>
                <input type="number" min={10} max={90} value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))} />
              </label>
              <label>
                <span>Game mode</span>
                <select value={funMode} onChange={(event) => setFunMode(event.target.value as FunMode)}>
                  <option value="classic">Classic</option>
                  <option value="turbo">Turbo - 10 second turns</option>
                  <option value="marathon">Marathon - longer match</option>
                  <option value="reverse">Reverse Rules - reverse order</option>
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>

      <TournamentSetupModal
        open={tournamentOpen}
        onClose={() => setTournamentOpen(false)}
        nations={filteredNations}
        selectedNation={selectedNation}
        nationCode={nationCode}
        setNationCode={setNationCode}
        countryQuery={countryQuery}
        setCountryQuery={setCountryQuery}
        difficulty={tournamentDifficulty}
        setDifficulty={setTournamentDifficulty}
        onStart={() => startTournament(nationCode, tournamentDifficulty)}
      />
      <PracticeModeModal
        open={practiceOpen}
        onClose={() => setPracticeOpen(false)}
        onStart={() => {
          setPracticeOpen(false);
          playWithBots("easy", 3);
        }}
      />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

function HomeEngagementCard({
  icon,
  eyebrow,
  title,
  body,
  action,
  cta,
  footer,
  tone = "challenge",
  progress,
  goal,
  progressLabel,
  rankLabel,
  onClick
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  cta: string;
  footer?: ReactNode;
  tone?: "challenge" | "tournament" | "weekly" | "rank";
  progress?: number;
  goal?: number;
  progressLabel?: string;
  rankLabel?: string;
  onClick: () => void;
}) {
  const progressPercent = progress !== undefined && goal
    ? Math.min(100, Math.max(0, (progress / goal) * 100))
    : undefined;

  return (
    <motion.button
      type="button"
      className={`home-event-card home-event-card-${tone} group overflow-hidden rounded-[1.5rem] border border-white/40 bg-slate-950/85 p-4 text-left text-white shadow-card backdrop-blur transition`}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      onClick={onClick}
    >
      <div className="home-event-top relative z-10 flex items-start justify-between gap-3">
        <div className="home-event-icon grid h-11 w-11 place-items-center rounded-2xl bg-amber-200 text-slate-950 shadow-[0_0_26px_rgba(250,204,21,0.24)]">
          {icon}
        </div>
        <span className="home-event-badge rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-teal-100">
          {action}
        </span>
      </div>
      <p className="home-event-eyebrow relative z-10 mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-100">{eyebrow}</p>
      <h3 className="home-event-title relative z-10 mt-1 text-xl font-black">{title}</h3>
      <p className="home-event-body relative z-10 mt-2 text-sm font-semibold leading-6 text-white/62">{body}</p>
      {progressPercent !== undefined ? (
        <div className="home-event-progress relative z-10">
          <span><em>{progressLabel}</em><strong>{Math.round(progressPercent)}%</strong></span>
          <div><i style={{ width: `${progressPercent}%` }} /></div>
        </div>
      ) : null}
      {rankLabel ? <span className="home-event-rank-medal relative z-10">{rankLabel}</span> : null}
      {footer ? <div className="home-event-footer relative z-10 mt-3">{footer}</div> : null}
      <span className="home-event-cta relative z-10">
        {cta}<ChevronRight size={15} />
      </span>
    </motion.button>
  );
}

interface TournamentSetupModalProps {
  open: boolean;
  onClose: () => void;
  nations: TournamentNation[];
  selectedNation: TournamentNation;
  nationCode: string;
  setNationCode: (code: string) => void;
  countryQuery: string;
  setCountryQuery: (query: string) => void;
  difficulty: BotDifficulty;
  setDifficulty: (difficulty: BotDifficulty) => void;
  onStart: () => void;
}

function TournamentSetupModal({
  open,
  onClose,
  nations,
  selectedNation,
  nationCode,
  setNationCode,
  countryQuery,
  setCountryQuery,
  difficulty,
  setDifficulty,
  onStart
}: TournamentSetupModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Choose tournament nation"
            className="tournament-modal max-h-[92dvh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950 text-white shadow-card"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <div className="grid max-h-[92dvh] overflow-y-auto lg:grid-cols-[21rem_minmax(0,1fr)]">
              <aside className="relative overflow-hidden border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-300/20 blur-2xl" />
                <div className="relative z-10">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">
                        Tournament Entry
                      </p>
                      <h2 className="mt-1 text-3xl font-black">Choose your nation</h2>
                    </div>
                    <button className="icon-button border-white/10 bg-white/10 text-white" onClick={onClose} aria-label="Close tournament setup">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-4">
                    <div className="text-5xl">{selectedNation.flag}</div>
                    <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-teal-100">
                      Selected
                    </p>
                    <h3 className="text-2xl font-black">{selectedNation.name}</h3>
                    <p className="text-sm font-bold text-white/60">{selectedNation.code}</p>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {tournamentStages.map((stage, index) => (
                      <div key={stage} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-200 text-xs font-black text-slate-950">
                          {index + 1}
                        </span>
                        <span className="font-black">{stage}</span>
                      </div>
                    ))}
                  </div>

                  <label className="mt-4 grid gap-1 text-sm font-bold text-slate-200">
                    Difficulty
                    <select
                      className="field"
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
                    >
                      <option value="easy">Easy Tournament</option>
                      <option value="normal">Normal Tournament</option>
                      <option value="hard">Hard Tournament</option>
                    </select>
                  </label>

                  <button className="primary-button mt-4 w-full" onClick={onStart}>
                    <Trophy size={18} />
                    Start Tournament
                  </button>
                </div>
              </aside>

              <div className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-100">
                      Country Selection
                    </p>
                    <h3 className="text-xl font-black">Flags and nations</h3>
                  </div>
                  <div className="flex min-w-[15rem] items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
                    <Search size={17} className="text-white/55" />
                    <input
                      className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/40"
                      placeholder="Search country"
                      value={countryQuery}
                      onChange={(event) => setCountryQuery(event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid max-h-[30rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                  {nations.map((nation) => (
                    <button
                      key={nation.code}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        nationCode === nation.code
                          ? "border-amber-300 bg-amber-200 text-slate-950 shadow-glow"
                          : "border-white/10 bg-white/10 text-white hover:border-teal-200/60 hover:bg-white/15"
                      }`}
                      onClick={() => setNationCode(nation.code)}
                    >
                      <span className="text-3xl">{nation.flag}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{nation.name}</span>
                        <span className="block text-xs font-black uppercase tracking-[0.16em] opacity-65">
                          {nation.code}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {nations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm font-bold text-white/60">
                    No countries match that search.
                  </div>
                ) : null}
              </div>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const practiceSteps = [
  {
    title: "Goal of the hand",
    body: "Try to empty your hand before everyone else. The last player holding cards becomes Bhabhi."
  },
  {
    title: "Follow the suit",
    body: "If a suit is led and you have that suit, you must play it. The game will highlight legal cards for you."
  },
  {
    title: "Understand Dhulla",
    body: "If you cannot follow suit, you may throw another suit. That is Dhulla, and it can force the highest led-suit card to pick up the table."
  },
  {
    title: "Escape smart",
    body: "Low cards help you avoid winning bad tricks. High off-suit cards are useful when you are void and want to get rid of danger."
  },
  {
    title: "Use the timer",
    body: "You have limited time. If the timer gets low, the coach will warn you and the server can auto-play a legal card."
  }
];

function PracticeModeModal({
  open,
  onClose,
  onStart
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = practiceSteps[stepIndex] ?? practiceSteps[0]!;

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Practice mode tutorial"
            className="tournament-modal w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950 p-5 text-white shadow-card"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-100">
                  AI Coach
                </p>
                <h2 className="mt-1 text-3xl font-black">Practice Mode</h2>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/65">
                  Learn the table flow, then start an easy bot hand where the coach phrases keep guiding you.
                </p>
              </div>
              <button className="icon-button border-white/10 bg-white/10 text-white" onClick={onClose} aria-label="Close practice mode">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div className="grid gap-2">
                {practiceSteps.map((item, index) => (
                  <button
                    key={item.title}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm font-black transition ${
                      index === stepIndex
                        ? "border-teal-200 bg-teal-200 text-slate-950"
                        : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                    }`}
                    onClick={() => setStepIndex(index)}
                  >
                    {index + 1}. {item.title}
                  </button>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-200 text-slate-950">
                  <GraduationCap size={26} />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">
                  Step {stepIndex + 1} of {practiceSteps.length}
                </p>
                <h3 className="mt-2 text-2xl font-black">{step.title}</h3>
                <p className="mt-3 text-base font-semibold leading-7 text-white/75">{step.body}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    className="secondary-button border-white/10 bg-white/10 text-white"
                    disabled={stepIndex === 0}
                    onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                  >
                    Back
                  </button>
                  <button
                    className="secondary-button border-white/10 bg-white/10 text-white"
                    disabled={stepIndex === practiceSteps.length - 1}
                    onClick={() => setStepIndex((current) => Math.min(practiceSteps.length - 1, current + 1))}
                  >
                    Next Tip
                  </button>
                  <button className="primary-button ml-auto" onClick={onStart}>
                    Start Practice Table
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

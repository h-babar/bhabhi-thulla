import clsx from "clsx";
import { NATION_OPTIONS, type BotDifficulty } from "@getaway-cards/shared";
import { ArrowLeft, Bot, CalendarDays, ChevronRight, Crown, Flame, Medal, Radio, Shield, Sparkles, Swords, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getEngagementMockData, type LeaderboardKind, type TournamentItem } from "../../data/engagementMock.js";
import { DAILY_THULLA_CUP_ID, useEngagementStore } from "../../store/engagementStore.js";
import { useGameStore } from "../../store/gameStore.js";
import { DailyChallengeCard } from "./DailyChallengeCard.js";
import { LeaderboardTable } from "./LeaderboardTable.js";
import { OfflineCupCard } from "./OfflineCupCard.js";
import { TournamentCard } from "./TournamentCard.js";
import { TournamentDetails } from "./TournamentDetails.js";
import { WeeklyEventCard } from "./WeeklyEventCard.js";
import { CountdownTimer } from "./CountdownTimer.js";

const leaderboardLabels: Record<LeaderboardKind, string> = {
  dailyWins: "Daily Wins",
  weeklyPoints: "Weekly Points",
  champions: "Tournament Champions",
  teams: "Team Rankings"
};

type HubView = "tournaments" | "solo" | "challenges" | "leaderboards";
type TournamentFilter = "all" | "open" | "live" | "upcoming" | "private" | "completed";

const tournamentFilters: Array<{ id: TournamentFilter; label: string }> = [
  { id: "all", label: "All Events" },
  { id: "open", label: "Open" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "private", label: "Private" },
  { id: "completed", label: "Results" }
];

export function TournamentsPage() {
  const goHome = useGameStore((store) => store.goHome);
  const username = useGameStore((store) => store.username);
  const avatar = useGameStore((store) => store.avatar);
  const startTournament = useGameStore((store) => store.startTournament);
  const resumeGame = useGameStore((store) => store.resumeGame);
  const gameState = useGameStore((store) => store.state);
  const roomCode = useGameStore((store) => store.roomCode);
  const joinedTournamentIds = useEngagementStore((store) => store.joinedTournamentIds);
  const dailyCupEntry = useEngagementStore((store) => store.dailyCupEntry);
  const joinTournament = useEngagementStore((store) => store.joinTournament);
  const leaveTournament = useEngagementStore((store) => store.leaveTournament);
  const joinDailyCup = useEngagementStore((store) => store.joinDailyCup);
  const checkInDailyCup = useEngagementStore((store) => store.checkInDailyCup);
  const markDailyCupStarted = useEngagementStore((store) => store.markDailyCupStarted);
  const claimDailyCupReward = useEngagementStore((store) => store.claimDailyCupReward);
  const resetExpiredDailyCup = useEngagementStore((store) => store.resetExpiredDailyCup);
  const offlineCupProgress = useEngagementStore((store) => store.offlineCupProgress);
  const beginOfflineCup = useEngagementStore((store) => store.beginOfflineCup);
  const claimOfflineCupReward = useEngagementStore((store) => store.claimOfflineCupReward);
  const data = useMemo(() => getEngagementMockData(), []);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>();
  const [claimedChallengeIds, setClaimedChallengeIds] = useState<Set<string>>(() => new Set());
  const [dailyCupNationCode, setDailyCupNationCode] = useState(dailyCupEntry?.nationCode ?? "PAK");
  const [dailyCupDifficulty, setDailyCupDifficulty] = useState<BotDifficulty>(dailyCupEntry?.difficulty ?? "normal");
  const [hubView, setHubView] = useState<HubView>("tournaments");
  const [tournamentFilter, setTournamentFilter] = useState<TournamentFilter>("all");

  useEffect(() => {
    resetExpiredDailyCup();
  }, [resetExpiredDailyCup]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedTournamentId]);
  useEffect(() => {
    if (!dailyCupEntry) return;
    setDailyCupNationCode(dailyCupEntry.nationCode);
    setDailyCupDifficulty(dailyCupEntry.difficulty);
  }, [dailyCupEntry]);

  const joinedIds = useMemo(() => new Set(joinedTournamentIds), [joinedTournamentIds]);
  const selectedDailyCupNation = useMemo(
    () => NATION_OPTIONS.find((nation) => nation.code === dailyCupNationCode) ?? NATION_OPTIONS[0]!,
    [dailyCupNationCode]
  );

  const tournaments = useMemo(
    () => [...data.tournaments, ...data.offlineTournaments].map((tournament) => {
      if (!joinedIds.has(tournament.id)) return tournament;
      const isDailyCup = tournament.id === DAILY_THULLA_CUP_ID;
      const isOfflineCup = tournament.playMode === "offline";
      const userStatus = isDailyCup && dailyCupEntry?.status === "playing" ? "playing" : "ready";
      const playerList = [
        { id: `${tournament.id}-you`, name: username, avatar, seed: 1, status: userStatus },
        ...tournament.playerList
          .filter((player) => player.name.toLowerCase() !== username.toLowerCase() && (!isOfflineCup || player.name !== "You"))
          .slice(0, 9)
          .map((player, index) => ({ ...player, seed: index + 2 }))
      ] satisfies TournamentItem["playerList"];
      return {
        ...tournament,
        entryStatus: isDailyCup && dailyCupEntry ? dailyCupStatusLabel(dailyCupEntry.status) : "Entered",
        players: isOfflineCup ? tournament.maxPlayers : Math.min(tournament.maxPlayers, tournament.players + 1),
        playerList
      };
    }),
    [avatar, dailyCupEntry, data.offlineTournaments, data.tournaments, joinedIds, username]
  );

  const selectedTournament = tournaments.find((item) => item.id === selectedTournamentId);

  const toggleJoin = (id: string): void => {
    if (id === DAILY_THULLA_CUP_ID) {
      if (joinedIds.has(id)) leaveTournament(id);
      else joinDailyCup(id, selectedDailyCupNation, dailyCupDifficulty);
      return;
    }
    if (joinedIds.has(id)) leaveTournament(id);
    else joinTournament(id);
  };

  const handleCardJoin = (id: string): void => {
    if (id === DAILY_THULLA_CUP_ID || tournaments.find((item) => item.id === id)?.kind === "private") {
      setSelectedTournamentId(id);
      return;
    }
    toggleJoin(id);
  };

  const enterDailyCup = (): void => joinDailyCup(DAILY_THULLA_CUP_ID, selectedDailyCupNation, dailyCupDifficulty);
  const playDailyCup = (): void => {
    joinDailyCup(DAILY_THULLA_CUP_ID, selectedDailyCupNation, dailyCupDifficulty);
    checkInDailyCup();
    markDailyCupStarted();
    startTournament(selectedDailyCupNation.code, dailyCupDifficulty);
  };

  const playTournamentMatch = (tournament: TournamentItem): void => {
    if (tournament.id === DAILY_THULLA_CUP_ID) {
      playDailyCup();
      return;
    }
    const activeOfflineRun = tournament.playMode === "offline" && gameState?.tournament?.eventId === tournament.id && gameState.tournament.status === "active" && Boolean(roomCode);
    if (activeOfflineRun) {
      resumeGame();
      return;
    }
    if (!joinedIds.has(tournament.id)) joinTournament(tournament.id);
    const difficulty: BotDifficulty = tournament.difficulty ?? (tournament.kind === "weekly" || tournament.kind === "weekend" ? "hard" : "normal");
    if (tournament.playMode === "offline") beginOfflineCup(tournament.id);
    startTournament(dailyCupNationCode, difficulty, tournament.playMode === "offline" ? {
      eventId: tournament.id,
      eventName: tournament.name,
      reward: tournament.reward,
      offline: true,
      turnSeconds: tournament.turnSeconds
    } : {
      eventId: tournament.id,
      eventName: tournament.name,
      reward: tournament.reward
    });
  };

  if (selectedTournament) {
    return (
      <TournamentDetails
        tournament={selectedTournament}
        joined={joinedIds.has(selectedTournament.id)}
        onBack={() => setSelectedTournamentId(undefined)}
        onToggleJoin={() => toggleJoin(selectedTournament.id)}
        onPlay={() => playTournamentMatch(selectedTournament)}
        dailyCup={selectedTournament.id === DAILY_THULLA_CUP_ID ? {
          entry: dailyCupEntry,
          nations: NATION_OPTIONS,
          selectedNationCode: dailyCupNationCode,
          onNationChange: setDailyCupNationCode,
          difficulty: dailyCupDifficulty,
          onDifficultyChange: setDailyCupDifficulty,
          onEnter: enterDailyCup,
          onCheckIn: checkInDailyCup,
          onPlay: playDailyCup,
          onClaimReward: claimDailyCupReward
        } : undefined}
        offlineCup={selectedTournament.playMode === "offline" ? {
          progress: offlineCupProgress[selectedTournament.id],
          activeRun: Boolean(roomCode && gameState?.tournament?.eventId === selectedTournament.id && gameState.tournament.status === "active"),
          onClaim: () => claimOfflineCupReward(selectedTournament.id)
        } : undefined}
      />
    );
  }

  const dailyTournament = tournaments.find((item) => item.id === DAILY_THULLA_CUP_ID) ?? tournaments[0]!;
  const onlineTournaments = tournaments.filter((item) => item.playMode === "online");
  const soloTournaments = tournaments.filter((item) => item.playMode === "offline");
  const liveCount = onlineTournaments.filter((item) => item.status === "live").length;
  const enteredCount = tournaments.filter((item) => joinedIds.has(item.id)).length;
  const soloTitles = Object.values(offlineCupProgress).reduce((total, progress) => total + progress.championships, 0);
  const filteredTournaments = onlineTournaments.filter((item) => tournamentFilter === "all" || item.status === tournamentFilter);

  return (
    <main className="engagement-shell tournament-hub-pro min-h-screen px-3 py-3 text-white sm:px-5 lg:px-7">
      <div className="mx-auto grid w-full max-w-[94rem] gap-4">
        <header className="tournament-hub-header">
          <button className="tournament-home-button" onClick={goHome}><ArrowLeft size={18} /><span>Home</span></button>
          <div className="tournament-hub-brand"><span><Crown size={21} /></span><div><small>Competitive play</small><h1>Tournament Arena</h1></div></div>
          <div className="tournament-header-stats"><span><Radio size={14} /> {liveCount} live</span><span><Trophy size={14} /> {enteredCount} entered</span><strong>{soloTitles > 0 ? `${soloTitles} solo title${soloTitles === 1 ? "" : "s"}` : "Rank #7"}</strong></div>
        </header>

        <section className="tournament-feature-hero">
          <div className="tournament-feature-copy">
            <p><Flame size={15} /> Today&apos;s headline event</p>
            <span className="tournament-feature-tier">{dailyTournament.tier}</span>
            <h2>{dailyTournament.name}</h2>
            <p className="tournament-feature-description">{dailyTournament.description}</p>
            <div className="tournament-feature-meta"><span><Swords size={15} /> {dailyTournament.format}</span><span><Shield size={15} /> {dailyTournament.mode}</span><span><Trophy size={15} /> {dailyTournament.reward}</span></div>
            <div className="tournament-feature-actions">
              <button onClick={() => setSelectedTournamentId(dailyTournament.id)}>{joinedIds.has(dailyTournament.id) ? "Manage Entry" : "Enter Daily Cup"}<ChevronRight size={18} /></button>
              <button onClick={() => setSelectedTournamentId(dailyTournament.id)}>View Format</button>
            </div>
          </div>
          <div className="tournament-feature-status">
            <div className="tournament-feature-trophy"><Trophy size={39} /></div>
            <p>Registration closes in</p>
            <CountdownTimer targetTime={dailyTournament.startTime} label="Cup begins" />
            <div className="tournament-feature-field"><span><strong>{dailyTournament.players}</strong> entered</span><span><strong>{dailyTournament.maxPlayers - dailyTournament.players}</strong> places left</span></div>
            <div className="tournament-feature-meter"><span style={{ width: `${Math.round((dailyTournament.players / dailyTournament.maxPlayers) * 100)}%` }} /></div>
          </div>
        </section>

        <nav className="tournament-hub-tabs" aria-label="Competition hub">
          <button className={clsx(hubView === "tournaments" && "is-active")} onClick={() => setHubView("tournaments")}><Trophy size={17} /> Tournaments</button>
          <button className={clsx(hubView === "solo" && "is-active")} onClick={() => setHubView("solo")}><Bot size={17} /> Solo Cups <span>{soloTournaments.length}</span></button>
          <button className={clsx(hubView === "challenges" && "is-active")} onClick={() => setHubView("challenges")}><Sparkles size={17} /> Challenges <span>{data.dailyChallenges.filter((challenge) => challenge.completed).length}</span></button>
          <button className={clsx(hubView === "leaderboards" && "is-active")} onClick={() => setHubView("leaderboards")}><Medal size={17} /> Leaderboards</button>
        </nav>

        <AnimatePresence mode="wait">
          {hubView === "tournaments" ? (
            <motion.section key="tournaments" className="tournament-hub-section" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="tournament-section-heading">
                <div><p>Official event calendar</p><h2>Choose your competition</h2></div>
                <div className="tournament-filter-bar">{tournamentFilters.map((filter) => <button key={filter.id} className={clsx(tournamentFilter === filter.id && "is-active")} onClick={() => setTournamentFilter(filter.id)}>{filter.label}</button>)}</div>
              </div>
              <div className="tournament-card-grid">
                {filteredTournaments.map((tournament) => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    joined={joinedIds.has(tournament.id)}
                    joinLabel={tournament.id === DAILY_THULLA_CUP_ID ? "Enter Cup" : undefined}
                    joinedLabel={tournament.id === DAILY_THULLA_CUP_ID ? "Manage" : undefined}
                    onJoin={() => handleCardJoin(tournament.id)}
                    onOpen={() => setSelectedTournamentId(tournament.id)}
                    onRules={() => setSelectedTournamentId(tournament.id)}
                  />
                ))}
              </div>
              {filteredTournaments.length === 0 ? <div className="tournament-empty-state"><CalendarDays size={25} /><strong>No events in this category</strong><span>Change the filter to see the full tournament calendar.</span></div> : null}
            </motion.section>
          ) : null}

          {hubView === "solo" ? (
            <motion.section key="solo" className="offline-cups-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="offline-cups-banner">
                <div className="offline-cups-banner-icon"><Bot size={28} /></div>
                <div><p>Play anytime, no matchmaking</p><h2>Offline Solo Cups</h2><span>Four-stage tournaments against adaptive bots. Your best runs and championship rewards stay saved on this device.</span></div>
                <div className="offline-cups-banner-stats"><span><strong>{soloTournaments.length}</strong> cups</span><span><strong>{soloTitles}</strong> titles</span><span><strong>{Math.max(0, ...Object.values(offlineCupProgress).map((item) => item.bestStage))}/4</strong> best route</span></div>
              </div>
              <div className="offline-cups-heading"><div><p>Choose your circuit</p><h2>From first table to final crown</h2></div><span><Shield size={15} /> Standard rules, server-checked moves</span></div>
              <div className="offline-cup-grid">
                {soloTournaments.map((tournament) => {
                  const progress = offlineCupProgress[tournament.id];
                  const activeRun = Boolean(roomCode && gameState?.tournament?.offline && gameState.tournament.eventId === tournament.id && gameState.tournament.status === "active");
                  return (
                    <OfflineCupCard
                      key={tournament.id}
                      tournament={tournament}
                      progress={progress}
                      activeRun={activeRun}
                      onPlay={() => playTournamentMatch(tournament)}
                      onResume={resumeGame}
                      onDetails={() => setSelectedTournamentId(tournament.id)}
                      onClaim={() => claimOfflineCupReward(tournament.id)}
                    />
                  );
                })}
              </div>
              <div className="offline-cups-footnote"><Crown size={18} /><div><strong>Win the table, unlock the next stage.</strong><span>A loss ends the run. Start again whenever you are ready; every cup keeps its own record.</span></div></div>
            </motion.section>
          ) : null}

          {hubView === "challenges" ? (
            <motion.section key="challenges" className="tournament-challenge-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="tournament-section-heading"><div><p>Daily objectives</p><h2>Earn rewards every day</h2></div></div>
              <div className="tournament-challenge-grid">
                {data.dailyChallenges.map((challenge, index) => (
                  <DailyChallengeCard key={challenge.id} challenge={challenge} featured={index === 0} claimed={claimedChallengeIds.has(challenge.id)} onClaim={() => setClaimedChallengeIds((current) => new Set(current).add(challenge.id))} />
                ))}
              </div>
              <WeeklyEventCard event={data.weeklyEvent} />
            </motion.section>
          ) : null}

          {hubView === "leaderboards" ? (
            <motion.section key="leaderboards" className="tournament-leaderboard-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="tournament-section-heading"><div><p>Global standings</p><h2>Season rankings</h2></div><span className="tournament-season-points">{data.weeklyEvent.seasonPoints.toLocaleString()} SP</span></div>
              <div className="tournament-leaderboard-grid">{(Object.keys(data.leaderboards) as LeaderboardKind[]).map((kind) => <LeaderboardTable key={kind} title={leaderboardLabels[kind]} entries={data.leaderboards[kind]} />)}</div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
}

function dailyCupStatusLabel(status: string): string {
  if (status === "checked_in") return "Checked in";
  if (status === "playing") return "In progress";
  if (status === "completed") return "Completed";
  return "Entered";
}

import clsx from "clsx";
import type { BotDifficulty, TournamentNation } from "@getaway-cards/shared";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  Flag,
  Gift,
  LayoutGrid,
  ListTree,
  LockKeyhole,
  LogOut,
  Play,
  Radio,
  Shield,
  Swords,
  Ticket,
  Trophy,
  UserRound,
  Users
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import type { TournamentItem } from "../../data/engagementMock.js";
import type { DailyCupEntry, OfflineCupProgress } from "../../store/engagementStore.js";
import { CountdownTimer } from "./CountdownTimer.js";
import { TournamentBracketPlaceholder } from "./TournamentBracketPlaceholder.js";
import { PlayerAvatar } from "../auth/PlayerAvatar.js";

type DetailTab = "overview" | "bracket" | "matches" | "players" | "rules";

const detailTabs: Array<{ id: DetailTab; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Overview", icon: <LayoutGrid size={16} /> },
  { id: "bracket", label: "Bracket", icon: <ListTree size={16} /> },
  { id: "matches", label: "Matches", icon: <Swords size={16} /> },
  { id: "players", label: "Players", icon: <UserRound size={16} /> },
  { id: "rules", label: "Rules", icon: <BookOpen size={16} /> }
];

export function TournamentDetails({
  tournament,
  joined,
  onBack,
  onToggleJoin,
  onPlay,
  dailyCup,
  offlineCup
}: {
  tournament: TournamentItem;
  joined: boolean;
  onBack: () => void;
  onToggleJoin: () => void;
  onPlay?: () => void;
  dailyCup?: DailyCupControls;
  offlineCup?: OfflineCupControls;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [privateCode, setPrivateCode] = useState("");
  const completed = tournament.status === "completed";
  const live = tournament.status === "live";
  const privateCodeRequired = tournament.kind === "private" && !joined;
  const entryUnlocked = !privateCodeRequired || privateCode.trim().length === 6;
  const offline = tournament.playMode === "offline";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tournament.id]);

  return (
    <motion.main
      className="engagement-shell tournament-detail-page min-h-screen px-3 py-3 text-white sm:px-5 lg:px-7"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto grid w-full max-w-[94rem] gap-4">
        <header className="tournament-detail-nav">
          <button className="tournament-back-button" onClick={onBack}><ArrowLeft size={18} /> Events</button>
          <div className="tournament-detail-nav-title">
            <span>{tournament.tier}</span>
            <strong>{tournament.name}</strong>
          </div>
          <div className="tournament-nav-countdown">
            {offline ? <span className="tournament-ready-anytime"><Bot size={14} /> Ready anytime</span> : <CountdownTimer targetTime={tournament.startTime} label={live ? "Live now" : completed ? "Finished" : "Starts in"} compact />}
          </div>
        </header>

        <section className={clsx("tournament-detail-hero", `tournament-kind-${tournament.kind}`)}>
          <div className="tournament-detail-copy">
            <div className="tournament-detail-status-row">
              <span className={clsx("tournament-status-badge", live && "is-live", completed && "is-completed")}>
                {live ? <Radio size={13} /> : <Crown size={13} />}
                {tournament.entryStatus}
              </span>
              <span>{tournament.currentStage}</span>
            </div>
            <p className="tournament-detail-series">{offline ? "Bhabhi Thulla Solo Circuit" : "Bhabhi Thulla Championship Series"}</p>
            <h1>{tournament.name}</h1>
            <p className="tournament-detail-description">{tournament.description}</p>
            <div className="tournament-detail-chips">
              <span>{offline ? <Bot size={16} /> : <Users size={16} />} {offline ? "You vs 3 AI" : `${tournament.players}/${tournament.maxPlayers} players`}</span>
              <span><Shield size={16} /> {tournament.mode}</span>
              <span><Clock3 size={16} /> {tournament.duration}</span>
              <span><Gift size={16} /> {tournament.reward}</span>
            </div>

            <div className="tournament-stage-track">
              {tournament.bracket.map((round, index) => {
                const hasPlayers = round.slots.some((slot) => Boolean(slot.player));
                const complete = round.slots.some((slot) => slot.status === "advanced");
                return (
                  <div key={round.name} className={clsx(hasPlayers && "is-active", complete && "is-complete")}>
                    <span>{complete ? <Check size={14} /> : index + 1}</span>
                    <small>{round.name}</small>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="tournament-entry-card">
            <div className="tournament-prize-mark"><Trophy size={27} /></div>
            <p>Champion reward</p>
            <h2>{tournament.reward}</h2>
            <div className="tournament-entry-meta">
              <span><Ticket size={15} /> {tournament.entryRequirements[1]}</span>
              <span><Clock3 size={15} /> {tournament.checkIn}</span>
            </div>

            {privateCodeRequired ? (
              <label className="tournament-private-code">
                <span>Private invite code</span>
                <div><LockKeyhole size={16} /><input value={privateCode} maxLength={6} placeholder="6-digit code" onChange={(event) => setPrivateCode(event.target.value.toUpperCase())} /></div>
              </label>
            ) : null}

            {offline ? null : !completed ? (
              <button
                className={clsx("tournament-entry-button", joined && "is-joined")}
                disabled={!entryUnlocked}
                onClick={onToggleJoin}
              >
                {joined ? <LogOut size={17} /> : privateCodeRequired ? <LockKeyhole size={17} /> : <Crown size={17} />}
                {joined ? "Leave Tournament" : privateCodeRequired ? "Unlock and Enter" : "Enter Tournament"}
              </button>
            ) : (
              <button className="tournament-entry-button is-results" onClick={() => setActiveTab("bracket")}>
                <Trophy size={17} /> View Final Results
              </button>
            )}

            {!dailyCup && !offline && joined && onPlay && (live || tournament.kind === "private") ? (
              <button className="tournament-play-match-button" onClick={onPlay}><Play size={17} /> Play Current Match</button>
            ) : null}

            {dailyCup ? <DailyCupControlPanel controls={dailyCup} joined={joined} /> : null}
            {offlineCup && onPlay ? <OfflineCupControlPanel tournament={tournament} controls={offlineCup} onPlay={onPlay} /> : null}
          </aside>
        </section>

        <nav className="tournament-detail-tabs" aria-label="Tournament details">
          {detailTabs.map((tab) => (
            <button key={tab.id} className={clsx(activeTab === tab.id && "is-active")} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}<span>{tab.label}</span>
              {tab.id === "matches" ? <em>{tournament.schedule.length}</em> : null}
            </button>
          ))}
        </nav>

        <motion.div key={activeTab} className="tournament-detail-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {activeTab === "overview" ? <TournamentOverview tournament={tournament} /> : null}
          {activeTab === "bracket" ? (
            <DetailPanel eyebrow="Tournament path" title="Official bracket">
              <p className="tournament-panel-intro">Future places stay locked until their qualifying match is complete.</p>
              <TournamentBracketPlaceholder rounds={tournament.bracket} />
            </DetailPanel>
          ) : null}
          {activeTab === "matches" ? <TournamentMatches tournament={tournament} onPlay={onPlay} /> : null}
          {activeTab === "players" ? <TournamentPlayers tournament={tournament} /> : null}
          {activeTab === "rules" ? <TournamentRules tournament={tournament} /> : null}
        </motion.div>
      </div>
    </motion.main>
  );
}

function TournamentOverview({ tournament }: { tournament: TournamentItem }) {
  return (
    <div className="tournament-overview-grid">
      <DetailPanel eyebrow="Competition format" title="How this event runs">
        <div className="tournament-format-grid">
          <OverviewStat icon={<ListTree size={18} />} label="Format" value={tournament.format} />
          <OverviewStat icon={<Shield size={18} />} label="Division" value={tournament.tier} />
          <OverviewStat icon={<Clock3 size={18} />} label="Duration" value={tournament.duration} />
          <OverviewStat icon={<Flag size={18} />} label="Check-in" value={tournament.checkIn} />
          <OverviewStat icon={<Swords size={18} />} label="Current stage" value={tournament.currentStage} />
          <OverviewStat icon={<Users size={18} />} label="Field" value={`${tournament.players}/${tournament.maxPlayers} players`} />
        </div>
      </DetailPanel>
      <DetailPanel eyebrow="Prize allocation" title="Rewards">
        <InfoList items={tournament.rewardDetails} tone="gold" />
      </DetailPanel>
      <DetailPanel eyebrow="Entry check" title="Requirements">
        <InfoList items={tournament.entryRequirements} />
      </DetailPanel>
    </div>
  );
}

function TournamentMatches({ tournament, onPlay }: { tournament: TournamentItem; onPlay?: () => void }) {
  return (
    <DetailPanel eyebrow="Official schedule" title="Matches and results">
      <div className="tournament-match-list">
        {tournament.schedule.map((match, index) => (
          <article key={match.id} className={clsx("tournament-match-row", `is-${match.status}`)}>
            <div className="tournament-match-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="tournament-match-main">
              <div><span>{match.status}</span><strong>{match.title}</strong></div>
              <p>{match.participants.join(" vs ")}</p>
              {match.result ? <em>{match.result}</em> : null}
            </div>
            <div className="tournament-match-time"><CalendarClock size={15} /><span>{match.time}</span><small>{match.table}</small></div>
            {match.status === "live" && onPlay ? <button onClick={onPlay}><Play size={15} /> Play</button> : null}
          </article>
        ))}
      </div>
    </DetailPanel>
  );
}

function TournamentPlayers({ tournament }: { tournament: TournamentItem }) {
  return (
    <DetailPanel eyebrow="Registered field" title={`${tournament.players} competitors`}>
      <div className="tournament-player-grid">
        {tournament.playerList.map((player) => (
          <article key={player.id} className={clsx("tournament-player-card", `is-${player.status}`)}>
            <span className="tournament-player-seed">#{player.seed}</span>
            <PlayerAvatar name={player.name} avatarId={player.avatar} size="sm" />
            <div><strong>{player.name}</strong><small>{player.status}</small></div>
            {player.status === "qualified" ? <CheckCircle2 size={17} /> : player.status === "playing" ? <Radio size={16} /> : null}
          </article>
        ))}
      </div>
    </DetailPanel>
  );
}

function TournamentRules({ tournament }: { tournament: TournamentItem }) {
  return (
    <div className="tournament-rules-grid">
      <DetailPanel eyebrow="Event rules" title="Tournament regulations"><InfoList items={tournament.rules} /></DetailPanel>
      <DetailPanel eyebrow="Fair play" title="Server protection">
        <InfoList items={["Hands are private to each player", "The server validates turn order and legal suits", "Disconnect recovery keeps the same seat", "Tournament results are recorded after the match ends"]} tone="gold" />
      </DetailPanel>
    </div>
  );
}

interface DailyCupControls {
  entry?: DailyCupEntry;
  nations: TournamentNation[];
  selectedNationCode: string;
  onNationChange: (code: string) => void;
  difficulty: BotDifficulty;
  onDifficultyChange: (difficulty: BotDifficulty) => void;
  onEnter: () => void;
  onCheckIn: () => void;
  onPlay: () => void;
  onClaimReward: () => void;
}

interface OfflineCupControls {
  progress?: OfflineCupProgress;
  activeRun: boolean;
  onClaim: () => void;
}

function OfflineCupControlPanel({ tournament, controls, onPlay }: { tournament: TournamentItem; controls: OfflineCupControls; onPlay: () => void }) {
  const progress = controls.progress;
  const won = progress?.status === "won";
  return (
    <div className="offline-cup-detail-control">
      <div className="offline-detail-status">
        <span><Bot size={18} /></span>
        <div><small>{controls.activeRun ? "Current run" : won ? "Cup completed" : "Instant solo tournament"}</small><strong>{controls.activeRun ? `Stage ${progress?.currentStage ?? 1} of 4` : `${tournament.difficulty ?? "normal"} AI / ${tournament.turnSeconds ?? 20}s turns`}</strong></div>
      </div>
      <div className="offline-detail-record">
        <span><small>Best stage</small><strong>{progress?.bestStage ?? 0}/4</strong></span>
        <span><small>Attempts</small><strong>{progress?.attempts ?? 0}</strong></span>
        <span><small>Titles</small><strong>{progress?.championships ?? 0}</strong></span>
      </div>
      <button className="tournament-play-match-button" onClick={onPlay}><Play size={17} /> {controls.activeRun ? "Resume Current Match" : progress ? "Start New Run" : "Start Solo Cup"}</button>
      <button className="offline-detail-claim" disabled={!won || progress?.rewardClaimed} onClick={controls.onClaim}><Gift size={16} /> {progress?.rewardClaimed ? "Reward Claimed" : won ? "Claim Champion Reward" : "Win Final to Unlock"}</button>
    </div>
  );
}

function DailyCupControlPanel({ controls, joined }: { controls: DailyCupControls; joined: boolean }) {
  const selectedNation = controls.nations.find((nation) => nation.code === controls.selectedNationCode) ?? controls.nations[0]!;
  const entry = controls.entry;
  const progress = (entry ? 25 : 0) + (entry?.checkedInAt ? 25 : 0) + Math.min(35, (entry?.matchesPlayed ?? 0) * 35) + (entry?.rewardClaimed ? 15 : 0);
  const canClaim = Boolean(entry && entry.matchesPlayed > 0 && !entry.rewardClaimed);

  return (
    <div className="daily-cup-control-panel">
      <div className="daily-cup-selection">
        <span>{selectedNation.flag}</span>
        <div><small>Representing</small><strong>{entry?.nationName ?? selectedNation.name}</strong></div>
        <em>{entry?.cupPoints ?? 0} pts</em>
      </div>
      <div className="daily-cup-selects">
        <label><span>Nation</span><select value={controls.selectedNationCode} onChange={(event) => controls.onNationChange(event.target.value)}>{controls.nations.map((nation) => <option key={nation.code} value={nation.code}>{nation.flag} {nation.name}</option>)}</select></label>
        <label><span>Difficulty</span><select value={controls.difficulty} onChange={(event) => controls.onDifficultyChange(event.target.value as BotDifficulty)}><option value="easy">Easy qualifier</option><option value="normal">Normal cup</option><option value="hard">Expert contender</option></select></label>
      </div>
      <div className="daily-cup-progress">
        <div><span>Entry progress</span><strong>{Math.min(100, progress)}%</strong></div>
        <div className="daily-cup-progress-track"><motion.span initial={false} animate={{ width: `${Math.min(100, progress)}%` }} /></div>
      </div>
      <div className="daily-cup-actions">
        <button onClick={entry ? controls.onCheckIn : controls.onEnter} disabled={Boolean(entry?.checkedInAt)}><Flag size={15} />{entry?.checkedInAt ? "Checked In" : entry ? "Check In" : "Enter Cup"}</button>
        <button className="is-play" onClick={controls.onPlay}><Play size={15} />{joined ? "Play Cup Match" : "Enter and Play"}</button>
        <button onClick={controls.onClaimReward} disabled={!canClaim}><Gift size={15} />{entry?.rewardClaimed ? "Reward Claimed" : "Claim Reward"}</button>
      </div>
    </div>
  );
}

function DetailPanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <section className="tournament-detail-panel"><p>{eyebrow}</p><h2>{title}</h2>{children}</section>;
}

function OverviewStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="tournament-overview-stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function InfoList({ items, tone = "green" }: { items: string[]; tone?: "green" | "gold" }) {
  return <div className="tournament-info-list">{items.map((item) => <div key={item} className={tone === "gold" ? "is-gold" : undefined}><CheckCircle2 size={16} /><span>{item}</span></div>)}</div>;
}

import { Coins, Edit3, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { Modal } from "../Modal.js";
import { AchievementGrid } from "./AchievementGrid.js";
import { EditProfileModal } from "./EditProfileModal.js";
import { MatchHistoryList } from "./MatchHistoryList.js";
import { PlayerAvatar } from "./PlayerAvatar.js";
import { PlayerStatsPanel } from "./PlayerStatsPanel.js";

type ProfileTab = "overview" | "achievements" | "matches" | "customise";

const PROFILE_TABLES = [
  { label: "Casino Green", theme: "casino" },
  { label: "Midnight Club", theme: "midnight" },
  { label: "Royal Room", theme: "royal" },
  { label: "Black Gold", theme: "blackGold" }
] as const;

const PROFILE_CARDS = [
  { label: "Classic", style: "classic" },
  { label: "Royal", style: "royal" },
  { label: "Midnight", style: "midnight" },
  { label: "Neon", style: "neon" },
  { label: "Heritage", style: "heritage" },
  { label: "Carbon", style: "carbon" }
] as const;

export function ProfilePage() {
  const open = useAuthStore((state) => state.profileOpen);
  const close = useAuthStore((state) => state.closeProfile);
  const openUpgrade = useAuthStore((state) => state.openUpgrade);
  const guest = useAuthStore((state) => state.guest);
  const profile = useAuthStore((state) => state.profile);
  const updateRegistered = useAuthStore((state) => state.updateRegistered);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const current = profile ?? guest;
  if (!current) return null;

  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const xpFloor = Math.pow(level - 1, 2) * 140;
  const xpCeiling = Math.pow(level, 2) * 140;
  const xpProgress = Math.max(0, Math.min(100, ((xp - xpFloor) / Math.max(1, xpCeiling - xpFloor)) * 100));

  return (
    <>
      <Modal open={open} onClose={close} title="Player profile" wide>
        <div className="profile-page">
          <header className="profile-hero">
            <PlayerAvatar
              name={current.displayName}
              avatarId={current.avatarId}
              photoUrl={profile?.photoUrl}
              frame={profile?.profileFrameId}
              size="lg"
            />
            <div className="profile-hero-copy">
              <span className="profile-online"><i /> Online</span>
              <h2>{current.displayName}</h2>
              <p>{profile ? `@${profile.username}` : "Guest player"}</p>
              <div className="profile-level-line">
                <span>Level {level}</span>
                <div><i style={{ width: `${profile ? xpProgress : 0}%` }} /></div>
                <small>{profile ? `${xp} XP` : "Sign in to earn permanent XP"}</small>
              </div>
            </div>
            <div className="profile-rank-block">
              <Trophy size={21} />
              <span>{profile?.rank ?? "Unranked"}</span>
              <small>{profile ? "Competitive rank" : "Guest account"}</small>
            </div>
            <button className="secondary-button" onClick={() => setEditOpen(true)}><Edit3 size={16} /> Edit profile</button>
          </header>

          {!profile ? (
            <button className="profile-save-banner" onClick={openUpgrade}>
              <ShieldCheck size={22} />
              <span><strong>Protect this player</strong><small>Save progress and unlock cross-device rankings with Google.</small></span>
              Save progress
            </button>
          ) : null}

          <nav className="profile-tabs" aria-label="Profile sections">
            {(["overview", "achievements", "matches", "customise"] as ProfileTab[]).map((item) => (
              <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>
            ))}
          </nav>

          {tab === "overview" ? (
            <section className="profile-section">
              <div className="profile-section-heading"><div><span>Career</span><h3>Table statistics</h3></div><Coins size={20} /><strong>{profile?.coins ?? guest?.coins ?? 0}</strong></div>
              <PlayerStatsPanel stats={current.stats} />
              {profile?.bio ? <blockquote>{profile.bio}</blockquote> : null}
            </section>
          ) : null}

          {tab === "achievements" ? (
            <section className="profile-section">
              <div className="profile-section-heading"><div><span>Collection</span><h3>Achievements and badges</h3></div><Sparkles size={20} /></div>
              <AchievementGrid achievements={current.achievements} />
            </section>
          ) : null}

          {tab === "matches" ? (
            <section className="profile-section">
              <div className="profile-section-heading"><div><span>Recent form</span><h3>Match history</h3></div><UserRound size={20} /></div>
              <MatchHistoryList matches={profile?.recentMatches ?? []} />
            </section>
          ) : null}

          {tab === "customise" ? (
            <section className="profile-section">
              <div className="profile-section-heading"><div><span>Locker</span><h3>Preferred table setup</h3></div><Sparkles size={20} /></div>
              <div className="profile-customisation-block">
                <h4>Table theme</h4>
                <div className="profile-customisation-grid">
                  {PROFILE_TABLES.map((option) => (
                    <button
                      key={option.theme}
                      className={profile?.preferences.tableTheme === option.theme ? "is-selected" : ""}
                      disabled={!profile}
                      onClick={() => updateRegistered({ preferences: { tableTheme: option.theme } })}
                    >
                      <span className={`profile-table-swatch is-${option.theme}`} />
                      <strong>{option.label}</strong>
                      <small>{profile ? "Set preferred table" : "Available after sign-in"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-customisation-block">
                <h4>Card design</h4>
                <div className="profile-customisation-grid">
                  {PROFILE_CARDS.map((option) => (
                    <button
                      key={option.style}
                      className={profile?.preferences.cardBack === option.style ? "is-selected" : ""}
                      disabled={!profile}
                      onClick={() => updateRegistered({ preferences: { cardBack: option.style } })}
                    >
                      <span className={`profile-card-swatch is-${option.style}`} />
                      <strong>{option.label}</strong>
                      <small>{profile ? "Set preferred cards" : "Available after sign-in"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-customisation-block">
                <h4>Displayed badge</h4>
                <div className="profile-badge-picker">
                  {profile?.achievements.filter((achievement) => achievement.unlockedAt).length ? profile.achievements
                    .filter((achievement) => achievement.unlockedAt)
                    .map((achievement) => (
                  <button
                    key={achievement.id}
                    className={profile.selectedBadgeId === achievement.id ? "is-selected" : ""}
                    onClick={() => updateRegistered({ selectedBadgeId: achievement.id })}
                  >
                    <Sparkles size={16} />
                    <span><strong>{achievement.name}</strong><small>Unlocked badge</small></span>
                  </button>
                    )) : <p>Unlock an achievement to choose a profile badge.</p>}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </Modal>
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  );
}

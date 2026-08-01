import { Cloud, CloudRain, Flame, Moon, Music, Snowflake, Sparkles, Sun, Volume2, VolumeX } from "lucide-react";
import {
  useGameStore,
  type CardStyle,
  type TableLayout,
  type TableTheme,
  type WeatherTheme
} from "../store/gameStore.js";
import { Modal } from "./Modal.js";
import { useAuthStore } from "../store/authStore.js";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const CARD_STYLE_OPTIONS: Array<{ id: CardStyle; label: string; accent: string }> = [
  { id: "classic", label: "Classic", accent: "bg-white" },
  { id: "royal", label: "Royal", accent: "bg-indigo-500" },
  { id: "midnight", label: "Midnight", accent: "bg-slate-950" },
  { id: "neon", label: "Neon", accent: "bg-cyan-400" },
  { id: "minimal", label: "Minimal", accent: "bg-stone-100" },
  { id: "heritage", label: "Heritage", accent: "bg-amber-100" },
  { id: "carbon", label: "Carbon", accent: "bg-zinc-800" },
  { id: "championship", label: "Championship", accent: "bg-emerald-950" }
];

const TABLE_THEME_OPTIONS: Array<{ id: TableTheme; label: string; accent: string }> = [
  { id: "casino", label: "Casino", accent: "bg-emerald-700" },
  { id: "emerald", label: "Emerald", accent: "bg-teal-500" },
  { id: "midnight", label: "Midnight", accent: "bg-slate-950" },
  { id: "royal", label: "Royal", accent: "bg-indigo-700" },
  { id: "neon", label: "Neon", accent: "bg-cyan-400" },
  { id: "mahogany", label: "Mahogany", accent: "bg-amber-900" },
  { id: "velvet", label: "Velvet", accent: "bg-rose-800" },
  { id: "ice", label: "Ice", accent: "bg-sky-200" },
  { id: "obsidian", label: "Obsidian", accent: "bg-zinc-950" },
  { id: "sapphire", label: "Sapphire", accent: "bg-blue-700" },
  { id: "crimson", label: "Crimson", accent: "bg-red-700" },
  { id: "platinum", label: "Platinum", accent: "bg-slate-200" },
  { id: "jungle", label: "Jungle", accent: "bg-lime-800" },
  { id: "aurora", label: "Aurora", accent: "bg-fuchsia-500" },
  { id: "monaco", label: "Monaco", accent: "bg-emerald-950" },
  { id: "blackGold", label: "Black Gold", accent: "bg-neutral-950" },
  { id: "oxford", label: "Oxford", accent: "bg-blue-950" },
  { id: "amethyst", label: "Amethyst", accent: "bg-purple-900" },
  { id: "championship", label: "Championship", accent: "bg-green-950" },
  { id: "bordeaux", label: "Bordeaux", accent: "bg-red-950" },
  { id: "carbon", label: "Carbon Club", accent: "bg-zinc-800" },
  { id: "pearl", label: "Pearl Room", accent: "bg-slate-300" }
];

const TABLE_LAYOUT_OPTIONS: Array<{ id: TableLayout; label: string; description: string }> = [
  { id: "grand", label: "Grand Oval", description: "Wide premium table" },
  { id: "stadium", label: "Stadium", description: "Long clear lanes" },
  { id: "classic", label: "Classic Club", description: "Traditional oval" },
  { id: "compact", label: "Compact", description: "Closer social play" },
  { id: "lounge", label: "Lounge", description: "Intimate round table" },
  { id: "arena", label: "Pro Arena", description: "Card-first competition" }
];

const WEATHER_OPTIONS: Array<{ id: WeatherTheme; label: string; icon: typeof Sun }> = [
  { id: "sunny", label: "Sunny", icon: Sun },
  { id: "night", label: "Night", icon: Moon },
  { id: "rain", label: "Rain", icon: CloudRain },
  { id: "winter", label: "Winter", icon: Snowflake },
  { id: "festival", label: "Festival", icon: Sparkles },
  { id: "mist", label: "Mist", icon: Cloud },
  { id: "embers", label: "Embers", icon: Flame }
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const theme = useGameStore((store) => store.theme);
  const muted = useGameStore((store) => store.muted);
  const musicEnabled = useGameStore((store) => store.musicEnabled);
  const musicVolume = useGameStore((store) => store.musicVolume);
  const cardStyle = useGameStore((store) => store.cardStyle);
  const tableTheme = useGameStore((store) => store.tableTheme);
  const tableLayout = useGameStore((store) => store.tableLayout);
  const weatherTheme = useGameStore((store) => store.weatherTheme);
  const openProfile = useAuthStore((store) => store.openProfile);
  const guestProfile = useAuthStore((store) => store.guest);
  const registeredProfile = useAuthStore((store) => store.profile);
  const updateGuest = useAuthStore((store) => store.updateGuest);
  const updateRegistered = useAuthStore((store) => store.updateRegistered);
  const setTheme = useGameStore((store) => store.setTheme);
  const setMuted = useGameStore((store) => store.setMuted);
  const setMusicEnabled = useGameStore((store) => store.setMusicEnabled);
  const setMusicVolume = useGameStore((store) => store.setMusicVolume);
  const setCardStyle = useGameStore((store) => store.setCardStyle);
  const setTableTheme = useGameStore((store) => store.setTableTheme);
  const setTableLayout = useGameStore((store) => store.setTableLayout);
  const setWeatherTheme = useGameStore((store) => store.setWeatherTheme);
  const savePreference = (preferences: Parameters<typeof updateGuest>[0]["preferences"]) => {
    if (!preferences) return;
    if (registeredProfile) {
      void updateRegistered({ preferences });
    } else if (guestProfile) {
      updateGuest({ preferences });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="grid gap-5">
        <button className="secondary-button justify-center" onClick={openProfile}>
          Manage player profile
        </button>

        <div>
          <p className="mb-2 text-sm font-black text-slate-900 dark:text-white">Card Style</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CARD_STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`grid justify-items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition ${
                  cardStyle === option.id
                    ? "border-teal-400 bg-teal-300/25 text-teal-950 shadow-glow dark:text-teal-100"
                    : "border-slate-300 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                }`}
                onClick={() => {
                  setCardStyle(option.id);
                  savePreference({ cardBack: option.id });
                }}
              >
                <span className={`h-10 w-7 rounded-md border border-white/60 shadow-sm ${option.accent}`} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-black text-slate-900 dark:text-white">Table Layout</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TABLE_LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`table-layout-option ${
                  tableLayout === option.id ? "table-layout-option-active" : ""
                }`}
                onClick={() => setTableLayout(option.id)}
              >
                <span className={`table-layout-preview table-layout-preview-${option.id}`} />
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-black text-slate-900 dark:text-white">Table Theme</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {TABLE_THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`grid justify-items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition ${
                  tableTheme === option.id
                    ? "border-amber-300 bg-amber-200/25 text-amber-950 shadow-glow dark:text-amber-100"
                    : "border-slate-300 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                }`}
                onClick={() => {
                  setTableTheme(option.id);
                  savePreference({ tableTheme: option.id });
                }}
              >
                <span className={`h-8 w-14 rounded-full border border-white/60 shadow-sm ${option.accent}`} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-black text-slate-900 dark:text-white">Weather Theme</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {WEATHER_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  className={`grid justify-items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition ${
                    weatherTheme === option.id
                      ? "border-teal-400 bg-teal-300/25 text-teal-950 shadow-glow dark:text-teal-100"
                      : "border-slate-300 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                  }`}
                  onClick={() => setWeatherTheme(option.id)}
                >
                  <Icon size={18} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="appearance-toggle" role="group" aria-label="Page appearance">
            <button
              type="button"
              className={theme === "light" ? "is-active" : ""}
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              <Sun size={17} />
              Light
            </button>
            <button
              type="button"
              className={theme === "dark" ? "is-active" : ""}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              <Moon size={17} />
              Dark
            </button>
          </div>
          <button
            className="secondary-button justify-between rounded-2xl"
            onClick={() => {
              setMuted(!muted);
              savePreference({ soundEnabled: muted });
            }}
          >
            <span>{muted ? "Sound muted" : "Sound on"}</span>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-300/70 bg-white/60 p-3 dark:border-white/10 dark:bg-white/10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <Music size={18} />
              Match music
            </div>
            <button className="secondary-button px-3 py-2" onClick={() => {
              setMusicEnabled(!musicEnabled);
              savePreference({ musicEnabled: !musicEnabled });
            }}>
              {musicEnabled ? "On" : "Off"}
            </button>
          </div>
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Music volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVolume}
              disabled={!musicEnabled}
              onChange={(event) => setMusicVolume(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}

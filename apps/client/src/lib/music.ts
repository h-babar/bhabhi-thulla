export type MusicPhase = "early" | "mid" | "end" | "victory" | "defeat" | "idle";

interface MusicOptions {
  enabled: boolean;
  volume: number;
  phase: MusicPhase;
}

declare global {
  interface Window {
    __bhabhiMusicElement?: HTMLAudioElement;
  }
}

const MUSIC_SRC = "/audio/bhabhi-lounge-loop.wav";
const PHASE_SETTINGS: Record<MusicPhase, { rate: number; gain: number }> = {
  idle: { rate: 0.96, gain: 0.18 },
  early: { rate: 0.98, gain: 0.24 },
  mid: { rate: 1.02, gain: 0.29 },
  end: { rate: 1.06, gain: 0.34 },
  victory: { rate: 1.08, gain: 0.38 },
  defeat: { rate: 0.92, gain: 0.2 }
};

let currentOptions: MusicOptions | undefined;
let unlockArmed = false;

export function primeBackgroundMusic(): void {
  if (currentOptions?.enabled) {
    updateBackgroundMusic(currentOptions);
  }
}

export function installMusicUnlock(): void {
  if (unlockArmed || typeof window === "undefined") {
    return;
  }

  unlockArmed = true;
  const unlock = (): void => {
    primeBackgroundMusic();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    unlockArmed = false;
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function updateBackgroundMusic(options: MusicOptions): void {
  currentOptions = options;

  if (!options.enabled || options.volume <= 0) {
    stopBackgroundMusic();
    return;
  }

  const audio = ensureMusicElement();
  if (!audio) {
    return;
  }

  const phase = PHASE_SETTINGS[options.phase];
  audio.loop = true;
  audio.playbackRate = phase.rate;
  audio.volume = clamp(options.volume) * phase.gain;

  const play = audio.play();
  if (play) {
    play.catch(() => installMusicUnlock());
  }
}

export function stopBackgroundMusic(): void {
  const audio = getMusicElement();
  if (!audio) {
    return;
  }

  audio.pause();
  audio.volume = 0;
}

function ensureMusicElement(): HTMLAudioElement | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const existing = getMusicElement();
  if (existing) {
    return existing;
  }

  const audio = new Audio(MUSIC_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  window.__bhabhiMusicElement = audio;
  return audio;
}

function getMusicElement(): HTMLAudioElement | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const audio = window.__bhabhiMusicElement;
  if (!audio) {
    return undefined;
  }

  if (!audio.src.endsWith(MUSIC_SRC)) {
    audio.pause();
    window.__bhabhiMusicElement = undefined;
    return undefined;
  }

  return audio;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

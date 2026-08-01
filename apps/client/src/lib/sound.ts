type SoundKind = "deal" | "play" | "draw" | "win" | "click" | "clear" | "thulla" | "turn";

let audioContext: AudioContext | undefined;

export function playSound(kind: SoundKind, muted: boolean): void {
  if (muted || typeof window === "undefined") {
    return;
  }

  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const fire = () => renderSound(context, kind);
  if (context.state === "suspended") {
    void context.resume().then(fire).catch(() => undefined);
    return;
  }

  fire();
}

function ensureAudioContext(): AudioContext | undefined {
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtor) {
    return undefined;
  }

  audioContext ??= new AudioCtor();
  return audioContext;
}

function renderSound(context: AudioContext, kind: SoundKind): void {
  const output = context.createGain();
  const outputLevel = kind === "play" ? 0.38 : kind === "thulla" ? 0.34 : kind === "deal" ? 0.28 : 0.24;
  output.gain.value = outputLevel;
  output.connect(context.destination);

  const now = context.currentTime;

  switch (kind) {
    case "deal":
      cardFlick(context, output, now, 0.72);
      cardFlick(context, output, now + 0.07, 0.55);
      cardFlick(context, output, now + 0.14, 0.42);
      break;
    case "play":
      paperSlide(context, output, now, 0.085, 0.88);
      feltTap(context, output, now + 0.052, 0.18);
      softThud(context, output, now + 0.058, 118, 0.11);
      break;
    case "draw":
      paperSlide(context, output, now, 0.18, 0.48);
      softThud(context, output, now + 0.12, 92, 0.08);
      break;
    case "clear":
      paperSlide(context, output, now, 0.34, 0.55);
      softThud(context, output, now + 0.28, 80, 0.11);
      break;
    case "thulla":
      cardFlick(context, output, now, 0.76);
      softThud(context, output, now + 0.03, 68, 0.18);
      break;
    case "turn":
      softThud(context, output, now, 124, 0.055);
      paperSlide(context, output, now + 0.035, 0.045, 0.22);
      break;
    case "win":
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        bell(context, output, now + index * 0.075, frequency, 0.32, 0.018);
      });
      softThud(context, output, now + 0.04, 96, 0.1);
      break;
    case "click":
    default:
      cardFlick(context, output, now, 0.34);
      break;
  }

  output.gain.setValueAtTime(outputLevel, now);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  window.setTimeout(() => output.disconnect(), 1300);
}

function cardFlick(context: AudioContext, output: AudioNode, start: number, intensity: number): void {
  paperSlide(context, output, start, 0.055, intensity);
  softThud(context, output, start + 0.018, 180, 0.018 * intensity);
}

function feltTap(context: AudioContext, output: AudioNode, start: number, intensity: number): void {
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 0.035)), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const progress = index / data.length;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-progress * 9);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(920, start);
  filter.frequency.exponentialRampToValueAtTime(260, start + 0.035);
  filter.Q.value = 0.95;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(intensity, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
  source.stop(start + 0.06);
}

function paperSlide(
  context: AudioContext,
  output: AudioNode,
  start: number,
  duration: number,
  intensity: number
): void {
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const envelope = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1250, start);
  filter.frequency.exponentialRampToValueAtTime(520, start + duration);
  filter.Q.value = 0.8;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.075 * intensity, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
  source.stop(start + duration + 0.01);
}

function softThud(
  context: AudioContext,
  output: AudioNode,
  start: number,
  frequency: number,
  gainValue: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(36, frequency * 0.55), start + 0.16);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + 0.23);
}

function bell(
  context: AudioContext,
  output: AudioNode,
  start: number,
  frequency: number,
  duration: number,
  gainValue: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

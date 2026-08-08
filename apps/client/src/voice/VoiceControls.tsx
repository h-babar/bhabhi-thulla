import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Headphones,
  Mic,
  MicOff,
  Radio,
  Settings2,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff
} from "lucide-react";
import { useState } from "react";
import { Modal } from "../components/Modal.js";
import { useVoiceChat } from "./VoiceChatProvider.js";

export function VoiceControls() {
  const voice = useVoiceChat();
  const [consentOpen, setConsentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!voice.available) return null;

  const busy = voice.status === "permission" || voice.status === "connecting" || voice.status === "reconnecting";
  const statusLabel = voiceStatusLabel(voice.status);

  const enableVoice = async () => {
    setConsentOpen(false);
    await voice.joinVoice();
  };

  return (
    <>
      <div className={clsx("voice-control-cluster", voice.enabled && "voice-control-cluster-live")} role="group" aria-label="Voice chat controls">
        {!voice.enabled ? (
          <button
            type="button"
            className="voice-main-button"
            onClick={() => setConsentOpen(true)}
            disabled={busy}
            aria-label={`${statusLabel}. Enable voice chat`}
            title={`${statusLabel}. Enable voice chat`}
          >
            {voice.status === "permission-blocked" || voice.status === "no-device" || voice.status === "failed"
              ? <WifiOff size={17} />
              : busy ? <Radio className="voice-connecting-icon" size={17} /> : <Mic size={17} />}
            <span>{busy ? statusLabel : "Join Voice"}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className={clsx("voice-icon-button", voice.selfMuted && "is-muted")}
              onClick={voice.toggleSelfMute}
              aria-label={voice.selfMuted ? "Turn microphone on" : "Mute microphone"}
              title={voice.selfMuted ? "Microphone off. Turn it on" : "Microphone on. Mute it"}
            >
              {voice.selfMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              className={clsx("voice-icon-button", voice.deafened && "is-muted")}
              onClick={voice.toggleDeafen}
              aria-label={voice.deafened ? "Unmute all players" : "Mute all players"}
              title={voice.deafened ? "All players muted locally. Unmute all" : "Mute all players locally"}
            >
              {voice.deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
            </button>
            <div className="voice-connection-label" title={statusLabel}>
              <Wifi size={15} />
              <span>{voice.participants.length} live</span>
            </div>
          </>
        )}
        <button
          type="button"
          className="voice-icon-button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open voice settings"
          title="Voice settings"
        >
          <Settings2 size={18} />
        </button>
      </div>

      <Modal
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        title="Join live voice"
        eyebrow="Human players only"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <button className="secondary-button" type="button" onClick={() => setConsentOpen(false)}>Not now</button>
            <button className="primary-button" type="button" onClick={() => void enableVoice()}>
              <Mic size={17} />
              Allow microphone
            </button>
          </div>
        }
      >
        <div className="voice-consent-copy">
          <div className="voice-consent-icon"><ShieldCheck size={28} /></div>
          <h3>Talk live with people at this table</h3>
          <p>Your browser will ask for microphone permission. Voice is transmitted directly between human players using WebRTC and is not recorded by the game.</p>
          <p>You can join without voice, mute yourself, mute anyone locally, or leave voice at any time. Bots and spectators never join.</p>
        </div>
      </Modal>

      <VoiceSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

function VoiceSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const voice = useVoiceChat();
  const preferences = voice.preferences;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Voice settings"
      eyebrow="Private table audio"
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="voice-privacy-note"><ShieldCheck size={15} /> Live peer-to-peer voice. Never recorded.</p>
          <div className="flex gap-2">
            {voice.enabled ? (
              <button className="secondary-button voice-leave-button" type="button" onClick={() => void voice.leaveVoice()}>
                <WifiOff size={17} /> Leave Voice
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={onClose}>Done</button>
          </div>
        </div>
      }
    >
      <div className="voice-settings-grid">
        <section className="voice-settings-card">
          <div className="voice-settings-heading">
            <Mic size={19} />
            <div><strong>Microphone</strong><small>{voiceStatusLabel(voice.status)}</small></div>
          </div>
          <label>
            Input device
            <select
              className="field"
              value={preferences.inputDeviceId ?? ""}
              disabled={!voice.enabled || voice.inputDevices.length === 0}
              onChange={(event) => void voice.updatePreferences({ inputDeviceId: event.target.value || undefined })}
            >
              <option value="">System default</option>
              {voice.inputDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
          <div className="voice-level-row">
            <span>Input level</span>
            <div className="voice-level-meter" aria-label={`Microphone input level ${Math.round(Math.min(1, voice.inputLevel * 5) * 100)} percent`}>
              <motion.i animate={{ width: `${Math.min(100, voice.inputLevel * 500)}%` }} />
            </div>
          </div>
          <p className="voice-test-note"><AudioLines size={15} /> Speak normally to test your microphone.</p>
        </section>

        <section className="voice-settings-card">
          <div className="voice-settings-heading">
            <Volume2 size={19} />
            <div><strong>Playback</strong><small>Local controls only</small></div>
          </div>
          <label>
            Output device
            <select
              className="field"
              value={preferences.outputDeviceId ?? ""}
              disabled={voice.outputDevices.length === 0}
              onChange={(event) => void voice.updatePreferences({ outputDeviceId: event.target.value || undefined })}
            >
              <option value="">System default</option>
              {voice.outputDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
          <RangeSetting
            label="Master voice volume"
            value={preferences.masterVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={(masterVolume) => void voice.updatePreferences({ masterVolume })}
          />
          <RangeSetting
            label="Voice activation sensitivity"
            value={preferences.sensitivity}
            min={0.04}
            max={0.5}
            step={0.01}
            onChange={(sensitivity) => void voice.updatePreferences({ sensitivity })}
          />
        </section>

        <section className="voice-settings-card voice-settings-card-wide">
          <div className="voice-settings-heading">
            <Settings2 size={19} />
            <div><strong>Voice processing</strong><small>Applied by your browser</small></div>
          </div>
          <div className="voice-toggle-grid">
            <ToggleSetting label="Noise suppression" checked={preferences.noiseSuppression} onChange={(noiseSuppression) => void voice.updatePreferences({ noiseSuppression })} />
            <ToggleSetting label="Echo cancellation" checked={preferences.echoCancellation} onChange={(echoCancellation) => void voice.updatePreferences({ echoCancellation })} />
            <ToggleSetting label="Automatic gain" checked={preferences.autoGainControl} onChange={(autoGainControl) => void voice.updatePreferences({ autoGainControl })} />
            <ToggleSetting label="Push to talk" checked={preferences.pushToTalk} onChange={(pushToTalk) => void voice.updatePreferences({ pushToTalk })} />
          </div>
          {preferences.pushToTalk ? (
            <label className="voice-key-setting">
              Push-to-talk key
              <select className="field" value={preferences.pushToTalkKey} onChange={(event) => void voice.updatePreferences({ pushToTalkKey: event.target.value })}>
                <option value="Space">Space</option>
                <option value="KeyV">V</option>
                <option value="KeyT">T</option>
                <option value="CapsLock">Caps Lock</option>
              </select>
            </label>
          ) : null}
        </section>

        <AnimatePresence>
          {voice.error || voice.notice ? (
            <motion.div className={clsx("voice-settings-message", voice.error && "is-error")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {voice.error ?? voice.notice}
              {voice.notice ? <button type="button" onClick={voice.clearNotice}>Dismiss</button> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="voice-toggle-setting">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function RangeSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="voice-range-setting">
      <span>{label}<b>{Math.round(value * 100)}%</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function voiceStatusLabel(status: ReturnType<typeof useVoiceChat>["status"]): string {
  const labels = {
    available: "Voice available",
    permission: "Waiting for permission",
    connecting: "Connecting voice",
    connected: "Voice connected",
    reconnecting: "Reconnecting voice",
    muted: "Microphone muted",
    "permission-blocked": "Permission blocked",
    "no-device": "No microphone found",
    unavailable: "Voice unavailable",
    failed: "Voice connection failed"
  } as const;
  return labels[status];
}

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Cloud, LoaderCircle, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore.js";

export function LoginPanel() {
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const continueAsGuest = useAuthStore((state) => state.continueAsGuest);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const [displayName, setDisplayName] = useState("");
  const [policy, setPolicy] = useState<"privacy" | "terms" | undefined>();
  const loading = status === "initializing" || status === "authenticating";

  return (
    <main className="auth-page-shell">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <motion.section className="auth-brand-stage" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="auth-brand-mark">BT</div>
        <p className="auth-kicker">Bhabhi Thulla Player Network</p>
        <h1>Your table.<br /><span>Your identity.</span></h1>
        <p className="auth-lead">Play immediately as a guest, or build a permanent competitive profile that follows you to every table.</p>
        <div className="auth-benefit-grid">
          <article><ShieldCheck size={20} /><span><strong>Server verified</strong><small>Protected multiplayer identity</small></span></article>
          <article><Cloud size={20} /><span><strong>Cross-device</strong><small>Progress restored anywhere</small></span></article>
          <article><Sparkles size={20} /><span><strong>Career profile</strong><small>Ranks, rewards, and badges</small></span></article>
        </div>
        <div className="auth-card-fan" aria-hidden="true"><i /><i /><i /><i /></div>
      </motion.section>

      <motion.section className="auth-entry-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="auth-panel-heading">
          <span><UserRound size={20} /></span>
          <div><p>Choose your seat</p><h2>Enter the arena</h2></div>
        </div>

        {status === "initializing" ? (
          <div className="auth-loading-state"><LoaderCircle className="animate-spin" size={30} /><strong>Restoring your player...</strong></div>
        ) : (
          <>
            <label className="auth-name-field">
              <span>Guest display name</span>
              <input value={displayName} maxLength={24} placeholder="Enter your table name" onChange={(event) => setDisplayName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") continueAsGuest(displayName); }} />
            </label>
            <button className="guest-auth-button" disabled={loading} onClick={() => continueAsGuest(displayName)}>
              <UserRound size={19} />
              <span><strong>Play as Guest</strong><small>Start now on this device</small></span>
            </button>
            <div className="auth-divider"><span>or save your career</span></div>
            <button className="google-auth-button" disabled={loading} onClick={() => signInWithGoogle(false)}>
              {status === "authenticating" ? <LoaderCircle className="animate-spin" size={20} /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" />}
              Continue with Google
            </button>
            <div className="auth-account-notes">
              <p><CheckCircle2 size={15} /><span><strong>Guest:</strong> progress stays only in this browser and cannot be recovered after its data is cleared.</span></p>
              <p><CheckCircle2 size={15} /><span><strong>Google:</strong> rankings, statistics, rewards, and preferences are saved across devices.</span></p>
            </div>
          </>
        )}

        <AnimatePresence>
          {error ? (
            <motion.div className="auth-error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span>{error}</span><button onClick={clearError}><X size={15} /></button>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <footer>By continuing, you agree to our <button onClick={() => setPolicy("terms")}>Terms</button> and <button onClick={() => setPolicy("privacy")}>Privacy Policy</button>.</footer>
      </motion.section>

      <PolicyDialog kind={policy} onClose={() => setPolicy(undefined)} />
    </main>
  );
}

function PolicyDialog({ kind, onClose }: { kind?: "privacy" | "terms"; onClose: () => void }) {
  return (
    <AnimatePresence>
      {kind ? (
        <motion.div className="auth-policy-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.article initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }}>
            <button className="auth-policy-close" onClick={onClose}><X size={18} /></button>
            <p className="auth-kicker">Bhabhi Thulla</p>
            <h2>{kind === "privacy" ? "Privacy Policy" : "Player Terms"}</h2>
            {kind === "privacy" ? (
              <>
                <p>Guest identity and preferences are stored on your current device. Registered profiles store game statistics, customisation, achievements, and match history on the game server.</p>
                <p>Google supplies your account identifier, display name, email, and profile image for sign-in. Your email, authentication token, and OAuth details are never shown to other players.</p>
                <p>We use identity data only to operate account recovery, multiplayer identity, ranking, and progress features.</p>
              </>
            ) : (
              <>
                <p>Use a respectful player name and play fairly. Automated abuse, cheating, impersonation, and offensive profile content may be restricted.</p>
                <p>Guest progress is not recoverable after local browser data is removed. Permanent progression requires a connected Google account.</p>
                <p>Competitive results are determined by the server rules engine and may be corrected when technical abuse is detected.</p>
              </>
            )}
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

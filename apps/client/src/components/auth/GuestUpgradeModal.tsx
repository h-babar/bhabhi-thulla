import { Check, Cloud, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore.js";
import { Modal } from "../Modal.js";

export function GuestUpgradeModal() {
  const open = useAuthStore((state) => state.upgradeOpen);
  const close = useAuthStore((state) => state.closeUpgrade);
  const saveGuestProgress = useAuthStore((state) => state.saveGuestProgress);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal open={open} onClose={close} title="Save your progress">
      <div className="guest-upgrade-panel">
        <div className="upgrade-cloud"><Cloud size={30} /></div>
        <h3>Take this player to every device</h3>
        <p>Connect Google to safely merge your guest statistics, coins, achievements, and preferences into a permanent profile.</p>
        <ul>
          <li><Check size={16} /> Existing account rewards are never duplicated.</li>
          <li><Check size={16} /> Better progress values are preserved.</li>
          <li><ShieldCheck size={16} /> Your Google password is never shared with the game.</li>
        </ul>
        <label className="upgrade-confirm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          Merge this device's guest progress into my Google account.
        </label>
        <button className="google-auth-button" disabled={!confirmed} onClick={saveGuestProgress}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" />
          Save progress with Google
        </button>
      </div>
    </Modal>
  );
}

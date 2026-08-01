import { Modal } from "./Modal.js";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How To Play Bhabhi Thulla">
      <div className="space-y-5 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <section>
          <h3 className="mb-2 text-base font-black text-slate-950 dark:text-white">Goal</h3>
          <p>
            Empty your hand before the others. Players who empty their hand are safe. The last player still holding cards
            is Bhabhi for that hand.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-black text-slate-950 dark:text-white">Deal And Start</h3>
          <p>
            The server shuffles a standard 52-card deck and deals every card. The player holding the Ace of Spades starts
            and must open the hand with A♠.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {[
            ["Lead", "After the A♠ opening, if the trick is empty, play any card from your hand."],
            ["Follow suit", "If a suit has been led and you have that suit, you must play it."],
            ["Dhulla", "If you cannot follow suit, you may throw any card. The trick ends immediately as Dhulla."],
            ["Clear or pick up", "No Dhulla means everyone still holding cards plays once, then the highest led-suit card clears the trick. Any Dhulla means the highest led-suit card already on the table picks up the trick."]
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-slate-950/5 p-3 dark:bg-white/10">
              <p className="font-black text-slate-950 dark:text-white">{title}</p>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <section>
          <h3 className="mb-2 text-base font-black text-slate-950 dark:text-white">Take The Next Hand</h3>
          <p>
            Before leading a fresh trick, you may take every card from the next active player in the play direction.
            That player escapes safely, the cards join your hand, and you keep the lead. You may do this only once
            before playing your lead card.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-black text-slate-950 dark:text-white">Scoring</h3>
          <p>
            Each player who escapes earns 1 point. The match ends when someone reaches the target escape score. The
            backend validates every move, controls the deck, and enforces follow-suit rules.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-black text-slate-950 dark:text-white">Timer</h3>
          <p>
            If the timer expires, the next player gives one card as Timeout Dhulla. Missing two turns in a row declares
            that seat Bhabhi and replaces a disconnected human with a bot so the game can continue.
          </p>
        </section>
      </div>
    </Modal>
  );
}

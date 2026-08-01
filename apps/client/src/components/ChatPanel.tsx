import { Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { useGameStore } from "../store/gameStore.js";

const reactionOptions = [
  "\u{1F44D}",
  "\u{1F525}",
  "\u{1F62E}",
  "\u{1F602}",
  "\u{1F3AF}",
  "\u{1F389}",
  "\u{1F4AA}"
];

export function ChatPanel({ live = false }: { live?: boolean }) {
  const state = useGameStore((store) => store.state);
  const socketStatus = useGameStore((store) => store.socketStatus);
  const sendChat = useGameStore((store) => store.sendChat);
  const sendReaction = useGameStore((store) => store.sendReaction);
  const [body, setBody] = useState("");
  const isOnline = socketStatus === "online";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = body.trim();
    if (!message || !isOnline) return;
    sendChat(message);
    setBody("");
  };

  return (
    <aside
      className={`table-chat-panel glass-panel flex min-h-[22rem] flex-col rounded-3xl p-4${live ? " table-chat-panel-live" : ""}`}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
            {live ? "Live Table Chat" : "Table Chat"}
          </p>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">
            {isOnline ? "Friends" : "Reconnecting..."}
          </h3>
        </div>
        <div className="table-chat-reactions flex gap-1">
          {reactionOptions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-base shadow-sm transition hover:-translate-y-0.5 dark:bg-white/10"
              onClick={() => sendReaction(emoji)}
              disabled={!isOnline}
              aria-label={`Send ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="table-chat-messages mb-3 flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {state?.chatMessages.length ? (
          state.chatMessages.map((message) => (
            <div key={message.id} className="rounded-2xl bg-white/70 p-3 text-sm shadow-sm dark:bg-white/10">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-black text-slate-900 dark:text-white">{message.username}</span>
                <span className="text-[0.65rem] font-semibold text-slate-500 dark:text-slate-400">
                  {new Date(message.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </div>
              <p className="break-words text-slate-700 dark:text-slate-200">{message.body}</p>
            </div>
          ))
        ) : (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-300/80 p-5 text-center text-sm font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
            Chat appears here once someone says hello.
          </div>
        )}
      </div>

      <form className="table-chat-form flex gap-2" onSubmit={submit}>
        <input
          className="field min-w-0 flex-1 py-2.5"
          placeholder={isOnline ? "Message the table" : "Reconnecting to chat..."}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={!isOnline}
          autoComplete="off"
          autoFocus={live}
          maxLength={240}
          aria-label="Chat message"
        />
        <button
          className="icon-button"
          type="submit"
          disabled={!isOnline || !body.trim()}
          aria-label="Send chat message"
        >
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}

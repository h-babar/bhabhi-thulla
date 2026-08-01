import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, children, onClose }: ModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <motion.section
            aria-modal="true"
            role="dialog"
            aria-label={title}
            className="glass-panel max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] p-5 sm:p-7"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
              <button className="icon-button" onClick={onClose} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

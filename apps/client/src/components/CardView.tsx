import { SUIT_GLYPHS, type Card } from "@getaway-cards/shared";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useGameStore, type CardStyle } from "../store/gameStore.js";

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  compact?: boolean;
  tableCard?: boolean;
  fanIndex?: number;
  fanTotal?: number;
  mobileFan?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDragPlay?: () => void;
}

const CARD_STYLE_CLASSES: Record<CardStyle, string> = {
  classic: "card-style-classic",
  royal: "card-style-royal",
  midnight: "card-style-midnight",
  neon: "card-style-neon",
  minimal: "card-style-minimal",
  heritage: "card-style-heritage",
  carbon: "card-style-carbon",
  championship: "card-style-championship"
};

export function CardView({
  card,
  faceDown = false,
  selected = false,
  playable = false,
  disabled = false,
  compact = false,
  tableCard = false,
  fanIndex,
  fanTotal,
  mobileFan = false,
  onClick,
  onDoubleClick,
  onDragPlay
}: CardViewProps) {
  const cardStyle = useGameStore((store) => store.cardStyle);
  const styleClass = CARD_STYLE_CLASSES[cardStyle];
  const tilt = card ? deterministicTilt(card.id) : -2;
  const hasFan = fanIndex !== undefined && fanTotal !== undefined && fanTotal > 1;
  const fanMid = hasFan ? (fanTotal - 1) / 2 : 0;
  const fanOffset = hasFan ? fanIndex - fanMid : 0;
  const fanSpread = hasFan
    ? mobileFan
      ? Math.min(1.25, 14 / Math.max(1, fanTotal))
      : Math.min(5.2, 44 / Math.max(1, fanTotal))
    : 0;
  const fanRotate = Math.max(-14, Math.min(14, fanOffset * fanSpread));
  const fanDrop = hasFan
    ? mobileFan
      ? Math.min(9, Math.abs(fanOffset) * 0.62)
      : Math.min(18, Math.abs(fanOffset) * 1.18)
    : 0;
  const fanScale = hasFan && fanTotal > 12 ? Math.max(0.92, 1 - (fanTotal - 12) * 0.012) : 1;
  const baseRotate = mobileFan ? tilt * 0.25 + fanRotate : tilt + fanRotate;

  if (faceDown || !card) {
    return (
      <motion.div
        className={clsx(
          "card-face card-back grid place-items-center border-teal-200/50 text-white",
          styleClass,
          compact && "w-14 rounded-lg p-1 sm:w-16"
        )}
        initial={{ rotateY: -70, rotate: -6, y: 20, opacity: 0, scale: 0.96 }}
        animate={{ rotateY: 0, rotate: -1, y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 24 }}
      >
        <span className="rounded-full border border-white/40 px-2 py-1 text-[0.6rem] font-black uppercase tracking-[0.2em]">
          BT
        </span>
      </motion.div>
    );
  }

  const red = card.suit === "hearts" || card.suit === "diamonds";
  const interactive = Boolean(onClick || onDoubleClick || onDragPlay);
  const glyph = SUIT_GLYPHS[card.suit];
  const cardClassName = clsx(
    "card-face shrink-0 text-left",
    styleClass,
    red ? "card-red" : "card-black",
    red ? "border-rose-200 text-rose-600" : "border-slate-200 text-slate-950",
    selected && "-translate-y-3 ring-4 ring-amber-300",
    playable && !disabled && "ring-2 ring-teal-300",
    disabled && "cursor-not-allowed opacity-60",
    !interactive && "cursor-default",
    compact && "w-14 rounded-lg p-1 sm:w-16"
  );
  const content = (
    <>
      <span className={clsx("card-corner card-corner-top text-lg font-black leading-none sm:text-xl", compact && "text-sm sm:text-base")}>
        <span>{card.rank}</span>
        <span>{glyph}</span>
      </span>
      <span className={clsx("card-pip-center grid flex-1 place-items-center text-4xl leading-none sm:text-5xl", compact && "text-3xl sm:text-4xl")}>
        {glyph}
      </span>
      <span className={clsx("card-corner card-corner-bottom self-end text-lg font-black leading-none sm:text-xl", compact && "text-sm sm:text-base")}>
        <span>{card.rank}</span>
        <span>{glyph}</span>
      </span>
    </>
  );

  if (!interactive) {
    const tableCardMotion = tableCard
      ? {
          initial: { y: 0, rotate: 0, rotateY: 0, opacity: 1, scale: 1 },
          animate: { y: 0, rotate: 0, rotateY: 0, opacity: 1, scale: 1 }
        }
      : {
          initial: { y: fanDrop + 30, rotate: baseRotate - 5, rotateY: -62, opacity: 0, scale: fanScale * 0.94 },
          animate: {
            y: selected ? fanDrop - 16 : fanDrop,
            rotate: selected ? baseRotate + 1 : baseRotate,
            rotateY: 0,
            opacity: 1,
            scale: selected ? fanScale * 1.02 : fanScale
          }
        };

    return (
      <motion.div
        className={cardClassName}
        aria-label={`${card.rank} of ${card.suit}`}
        initial={tableCardMotion.initial}
        animate={tableCardMotion.animate}
        transition={{ type: "spring", stiffness: 420, damping: 25 }}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      aria-label={`${card.rank}${glyph}`}
      className={cardClassName}
      disabled={disabled}
      onClick={onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick?.();
      }}
      drag={onDragPlay && !disabled ? "y" : false}
      dragConstraints={{ top: -120, bottom: 12 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => {
        if (info.offset.y < -70) {
          onDragPlay?.();
        }
      }}
      initial={{ y: fanDrop + 30, rotate: baseRotate - 5, rotateY: -62, opacity: 0, scale: fanScale * 0.94 }}
      animate={{
        y: selected ? fanDrop - 16 : fanDrop,
        rotate: selected ? baseRotate + 1 : baseRotate,
        rotateY: 0,
        opacity: 1,
        scale: selected ? fanScale * 1.02 : fanScale
      }}
      transition={{ type: "spring", stiffness: 420, damping: 25 }}
      whileHover={!disabled ? { y: selected ? fanDrop - 21 : fanDrop - 9, rotate: baseRotate * 1.08, scale: fanScale * 1.035 } : undefined}
      whileTap={!disabled ? { scale: fanScale * 0.965, rotate: baseRotate * 0.82 } : undefined}
    >
      {content}
    </motion.button>
  );
}

function deterministicTilt(id: string): number {
  const total = Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return (total % 7) - 3;
}

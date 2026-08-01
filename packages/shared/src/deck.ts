import { CARD_RANKS, CARD_SUITS, RANK_POINTS, SUIT_GLYPHS } from "./constants.js";
import type { Card, Rank } from "./types.js";

export type RandomSource = () => number;

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank
      });
    }
  }

  return deck;
}

export function shuffleCards(cards: Card[], rng: RandomSource = Math.random): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function getCardPoints(card: Card): number {
  return RANK_POINTS[card.rank];
}

export function scoreCards(cards: Card[]): number {
  return cards.reduce((total, card) => total + getCardPoints(card), 0);
}

export function rankSortValue(rank: Rank): number {
  return CARD_RANKS.indexOf(rank) + 1;
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_GLYPHS[card.suit]}`;
}

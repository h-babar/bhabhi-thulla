import { getPlayableCards } from "./rules.js";
import type { BotDifficulty, Card, GameState, MoveAction, Rank, Suit } from "./types.js";

export function chooseBotMove(
  state: GameState,
  botId: string,
  difficulty: BotDifficulty = "normal"
): MoveAction {
  const bot = state.players.find((player) => player.id === botId);
  if (!bot) {
    return { type: "draw" };
  }

  const playableCards = getPlayableCards(state, botId);
  if (playableCards.length === 0) {
    return { type: "draw" };
  }

  const card =
    difficulty === "easy"
      ? randomItem(playableCards)
      : difficulty === "normal"
        ? chooseNormalCard(state, bot.hand, playableCards)
        : chooseHardCard(state, bot.id, playableCards);

  return {
    type: "play",
    cardIds: [card.id]
  };
}

function chooseNormalCard(state: GameState, hand: Card[], playableCards: Card[]): Card {
  if (!state.leadSuit) {
    return lowestFromShortestSuit(preferFreshCards(state, state.activePlayerId, playableCards));
  }

  const followsSuit = preferFreshCards(
    state,
    state.activePlayerId,
    playableCards.filter((card) => card.suit === state.leadSuit)
  );
  if (followsSuit.length > 0) {
    const currentHigh = currentHighLedSuitCard(state);
    const cardsThatDoNotTake = currentHigh
      ? followsSuit.filter((card) => rankValue(card.rank) < rankValue(currentHigh.rank))
      : [];

    if (cardsThatDoNotTake.length > 0) {
      return highestCard(cardsThatDoNotTake);
    }

    return lowestCard(followsSuit);
  }

  return highestFromShortestSuit(preferFreshCards(state, state.activePlayerId, playableCards));
}

function chooseHardCard(state: GameState, botId: string, playableCards: Card[]): Card {
  if (!state.leadSuit) {
    return chooseHardLead(state, botId, playableCards);
  }

  const followsSuit = preferFreshCards(
    state,
    botId,
    playableCards.filter((card) => card.suit === state.leadSuit)
  );
  if (followsSuit.length === 0) {
    return highestFromShortestSuit(preferFreshCards(state, botId, playableCards));
  }

  const currentHigh = currentHighLedSuitCard(state);
  if (!currentHigh) {
    return lowestCard(followsSuit);
  }

  const cardsThatDoNotTake = currentHigh
    ? followsSuit.filter((card) => rankValue(card.rank) < rankValue(currentHigh.rank))
    : followsSuit;
  const isLastToPlay = pendingPlayersAfter(state, botId) === 0;

  if (isLastToPlay) {
    return highestCard(followsSuit);
  }

  if (cardsThatDoNotTake.length > 0) {
    return highestCard(cardsThatDoNotTake);
  }

  return lowestCard(followsSuit);
}

function chooseHardLead(state: GameState, botId: string, playableCards: Card[]): Card {
  const cards = preferFreshCards(state, botId, playableCards);

  if (cards.length <= 3) {
    return highestCard(cards);
  }

  const singletons = cards.filter((card) => cards.filter((candidate) => candidate.suit === card.suit).length === 1);
  if (singletons.length > 0) {
    return highestCard(singletons);
  }

  const suitGroups = suitGroupsByLength(cards);
  const bestSuit = suitGroups.find((group) => group.cards.length <= 2) ?? suitGroups[0];
  return lowestCard(bestSuit?.cards ?? cards);
}

function preferFreshCards(state: GameState, playerId: string | undefined, cards: Card[]): Card[] {
  return avoidRecentlyPlayedKeys(state, playerId, avoidRecentPickup(state, playerId, cards));
}

function lowestFromShortestSuit(hand: Card[]): Card {
  const cards = cardsFromShortestSuit(hand);
  return lowestCard(cards);
}

function highestFromShortestSuit(hand: Card[]): Card {
  const cards = cardsFromShortestSuit(hand);
  return highestCard(cards);
}

function cardsFromShortestSuit(hand: Card[]): Card[] {
  return suitGroupsByLength(hand)[0]?.cards ?? hand;
}

function suitGroupsByLength(hand: Card[]): Array<{ suit: Suit; cards: Card[] }> {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  return suits
    .map((suit) => ({
      suit,
      cards: hand.filter((card) => card.suit === suit)
    }))
    .filter((entry) => entry.cards.length > 0)
    .sort((left, right) => left.cards.length - right.cards.length);
}

function currentHighLedSuitCard(state: GameState): Card | undefined {
  if (!state.leadSuit) {
    return undefined;
  }

  return state.trick
    .filter((play) => play.card.suit === state.leadSuit)
    .map((play) => play.card)
    .sort((left, right) => rankValue(right.rank) - rankValue(left.rank))[0];
}

function pendingPlayersAfter(state: GameState, playerId: string): number {
  const playedIds = new Set(state.trick.map((play) => play.playerId));
  const startIndex = state.players.findIndex((player) => player.id === playerId);
  if (startIndex < 0) {
    return 0;
  }

  let count = 0;
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidate = state.players[(startIndex + step) % state.players.length];
    if (candidate?.id === playerId) {
      break;
    }

    if (candidate && candidate.hand.length > 0 && !playedIds.has(candidate.id)) {
      count += 1;
    }
  }

  return count;
}

function avoidRecentPickup(state: GameState, playerId: string | undefined, cards: Card[]): Card[] {
  if (!playerId || state.recentPickup?.playerId !== playerId || cards.length <= 1) {
    return cards;
  }

  const avoidedIds = new Set(state.recentPickup.cardIds);
  const alternatives = cards.filter((card) => !avoidedIds.has(card.id));
  return alternatives.length > 0 ? alternatives : cards;
}

function avoidRecentlyPlayedKeys(state: GameState, playerId: string | undefined, cards: Card[]): Card[] {
  if (!playerId || cards.length <= 1) {
    return cards;
  }

  const recentKeys = new Set(state.recentPlayedCardKeys?.[playerId] ?? []);
  if (recentKeys.size === 0) {
    return cards;
  }

  const alternatives = cards.filter((card) => !recentKeys.has(cardMemoryKey(card)));
  return alternatives.length > 0 ? alternatives : cards;
}

function cardMemoryKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function lowestCard(cards: Card[]): Card {
  return cards.slice().sort((left, right) => rankValue(left.rank) - rankValue(right.rank))[0] ?? cards[0]!;
}

function highestCard(cards: Card[]): Card {
  return cards.slice().sort((left, right) => rankValue(right.rank) - rankValue(left.rank))[0] ?? cards[0]!;
}

function rankValue(rank: Rank): number {
  const values: Record<Rank, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  };
  return values[rank];
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]!;
}

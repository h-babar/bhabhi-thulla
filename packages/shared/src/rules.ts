import { DEAL_ANIMATION_MS, DEFAULT_SETTINGS, TRICK_REVEAL_MS } from "./constants.js";
import { cardLabel, createDeck, shuffleCards, type RandomSource } from "./deck.js";
import type {
  Card,
  GameEvent,
  GameSettings,
  GameState,
  MoveAction,
  MoveValidation,
  NewPlayerInput,
  PlayerState,
  Rank,
  RoundSummary,
  Suit,
  TrickPlay
} from "./types.js";

const WIN_CELEBRATION_MS = 2000;

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeSettings(settings?: Partial<GameSettings>): GameSettings {
  const funMode = isFunMode(settings?.funMode) ? settings.funMode : DEFAULT_SETTINGS.funMode;
  let turnSeconds = clampInteger(settings?.turnSeconds, 10, 90, DEFAULT_SETTINGS.turnSeconds);
  let targetScore = clampInteger(settings?.targetScore, 1, 20, DEFAULT_SETTINGS.targetScore);

  if (funMode === "turbo") {
    turnSeconds = 10;
  }

  if (funMode === "marathon") {
    targetScore = Math.max(targetScore, 10);
    turnSeconds = Math.max(turnSeconds, 25);
  }

  return {
    maxPlayers: clampInteger(settings?.maxPlayers, 2, 6, DEFAULT_SETTINGS.maxPlayers),
    handSize: 0,
    targetScore,
    turnSeconds,
    allowSpectators: settings?.allowSpectators ?? DEFAULT_SETTINGS.allowSpectators,
    funMode
  };
}

export function createPlayer(input: NewPlayerInput, now = Date.now()): PlayerState {
  return {
    id: input.id,
    sessionId: input.sessionId,
    username: sanitizeName(input.username),
    avatar: sanitizeAvatar(input.avatar),
    hand: [],
    score: 0,
    roundWins: 0,
    connected: true,
    ready: input.isBot ?? false,
    isBot: input.isBot ?? false,
    botDifficulty: input.botDifficulty,
    missedTurnStreak: 0,
    joinedAt: now,
    lastSeenAt: now
  };
}

export function createGameState(
  roomCode: string,
  host: PlayerState,
  settings?: Partial<GameSettings>,
  now = Date.now()
): GameState {
  const game: GameState = {
    roomCode,
    roomMode: "private",
    hostId: host.id,
    status: "lobby",
    settings: normalizeSettings(settings),
    players: [host],
    spectators: [],
    deck: [],
    discardPile: [],
    trick: [],
    timedOutPlayerIds: [],
    lastTrick: undefined,
    winCelebration: undefined,
    recentPickup: undefined,
    cardTakeUsedById: undefined,
    recentPlayedCardKeys: {},
    openingLeadRequired: false,
    escapeOrder: [],
    direction: 1,
    dealerIndex: -1,
    pendingDraw: 0,
    round: 0,
    roundSummaries: [],
    history: [],
    chatMessages: [],
    reactions: [],
    updatedAt: now
  };

  appendHistory(game, {
    type: "room",
    message: `Room ${roomCode} is ready for Bhabhi Thulla.`
  }, now);

  return game;
}

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function canStartGame(state: GameState): MoveValidation {
  if (state.players.length < 2) {
    return { valid: false, reason: "At least two players or bots are needed." };
  }

  if (state.status === "playing") {
    return { valid: false, reason: "This hand is already in progress." };
  }

  return { valid: true };
}

export function startRound(
  state: GameState,
  now = Date.now(),
  rng: RandomSource = Math.random
): GameState {
  const startCheck = canStartGame(state);
  if (!startCheck.valid) {
    throw new Error(startCheck.reason);
  }

  const next = cloneGameState(state);
  const deck = shuffleCards(createDeck(), rng);

  next.players = next.players.map((player) => ({
    ...player,
    hand: [],
    ready: player.isBot,
    connected: player.isBot ? true : player.connected,
    missedTurnStreak: 0
  }));

  let dealIndex = 0;
  while (deck.length > 0) {
    const player = next.players[dealIndex % next.players.length];
    const card = deck.pop();
    if (player && card) {
      player.hand.push(card);
    }
    dealIndex += 1;
  }

  next.players = next.players.map((player) => ({
    ...player,
    hand: sortHand(player.hand)
  }));

  const aceHolder = next.players.find((player) =>
    player.hand.some((card) => card.rank === "A" && card.suit === "spades")
  );

  next.status = "playing";
  next.deck = [];
  next.discardPile = [];
  next.trick = [];
  next.timedOutPlayerIds = [];
  next.lastTrick = undefined;
  next.winCelebration = undefined;
  next.recentPickup = undefined;
  next.cardTakeUsedById = undefined;
  next.recentPlayedCardKeys = {};
  next.leadSuit = undefined;
  next.trickLeaderId = undefined;
  next.openingLeadRequired = true;
  next.escapeOrder = [];
  next.activePlayerId = aceHolder?.id ?? next.players[0]?.id;
  next.declaredSuit = undefined;
  next.dealEndsAt = now + DEAL_ANIMATION_MS;
  next.pendingDraw = 0;
  next.direction = next.settings.funMode === "reverse" ? -1 : 1;
  next.winnerId = undefined;
  next.bhabhiId = undefined;
  next.championId = undefined;
  next.round += 1;
  next.dealerIndex = modulo(next.dealerIndex + 1, next.players.length);
  setTurnClock(next, now);
  appendHistory(next, {
    type: "start",
    playerId: next.activePlayerId,
    message: `Hand ${next.round} started. ${aceHolder?.username ?? "The first player"} must open with the Ace of Spades.`
  }, now);
  next.updatedAt = now;

  return next;
}

export function getTopDiscard(state: Pick<GameState, "discardPile">): Card | undefined {
  return state.discardPile.at(-1);
}

export function getEffectiveSuit(state: Pick<GameState, "leadSuit" | "discardPile" | "declaredSuit">): Suit | undefined {
  return state.leadSuit ?? state.declaredSuit ?? getTopDiscard(state)?.suit;
}

export function getActivePlayer(state: GameState): PlayerState | undefined {
  return state.players.find((player) => player.id === state.activePlayerId);
}

export function getPlayableCards(state: GameState, playerId: string): Card[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || state.status !== "playing" || state.activePlayerId !== playerId) {
    return [];
  }

  return player.hand.filter((card) => isCardPlayableForState(state, player.hand, card));
}

export function isCardPlayable(
  state: Pick<GameState, "leadSuit">,
  card: Card
): boolean {
  return !state.leadSuit || card.suit === state.leadSuit;
}

export function isCardPlayableForHand(
  state: Pick<GameState, "leadSuit">,
  hand: Card[],
  card: Card
): boolean {
  if (!state.leadSuit) {
    return true;
  }

  if (card.suit === state.leadSuit) {
    return true;
  }

  return !hand.some((candidate) => candidate.suit === state.leadSuit);
}

export function isCardPlayableForState(
  state: Pick<GameState, "leadSuit" | "openingLeadRequired">,
  hand: Card[],
  card: Card
): boolean {
  if (state.openingLeadRequired) {
    return isAceOfSpades(card);
  }

  return isCardPlayableForHand(state, hand, card);
}

export function validateMove(state: GameState, playerId: string, move: MoveAction, now = Date.now()): MoveValidation {
  if (state.status !== "playing") {
    return { valid: false, reason: "The hand is not currently active." };
  }

  if (state.dealEndsAt && now < state.dealEndsAt) {
    return { valid: false, reason: "Cards are still being distributed." };
  }

  if (state.lastTrick && now - state.lastTrick.resolvedAt < TRICK_REVEAL_MS) {
    return { valid: false, reason: "The table is being cleared." };
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return { valid: false, reason: "Player is not seated in this room." };
  }

  if (state.activePlayerId !== playerId) {
    return { valid: false, reason: "It is not your turn yet." };
  }

  if (move.type === "draw") {
    return { valid: false, reason: "Bhabhi Thulla has no draw action. Play a card." };
  }

  if (move.cardIds.length !== 1) {
    return { valid: false, reason: "Play exactly one card." };
  }

  const card = player.hand.find((candidate) => candidate.id === move.cardIds[0]);
  if (!card) {
    return { valid: false, reason: "That card is not in your hand." };
  }

  if (!isCardPlayableForState(state, player.hand, card)) {
    if (state.openingLeadRequired) {
      return { valid: false, reason: "The first play of the hand must be the Ace of Spades." };
    }

    return { valid: false, reason: `You must follow ${state.leadSuit} if you can.` };
  }

  return { valid: true };
}

export function getNextPlayerForCardTake(state: GameState, playerId: string): PlayerState | undefined {
  return nextPlayerMatching(
    state,
    playerId,
    (player) => player.id !== playerId && player.hand.length > 0
  );
}

export function canTakeNextPlayerCards(
  state: GameState,
  playerId: string,
  now = Date.now()
): MoveValidation {
  if (state.status !== "playing") {
    return { valid: false, reason: "The hand is not currently active." };
  }

  if (state.dealEndsAt && now < state.dealEndsAt) {
    return { valid: false, reason: "Cards are still being distributed." };
  }

  if (state.lastTrick && now - state.lastTrick.resolvedAt < TRICK_REVEAL_MS) {
    return { valid: false, reason: "The table is being cleared." };
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.hand.length === 0) {
    return { valid: false, reason: "Player is not active in this hand." };
  }

  if (state.activePlayerId !== playerId) {
    return { valid: false, reason: "Only the player leading the trick can take the next hand." };
  }

  if (state.trick.length > 0 || state.leadSuit) {
    return { valid: false, reason: "You can only take the next player's cards before leading a fresh trick." };
  }

  if (state.cardTakeUsedById === playerId) {
    return { valid: false, reason: "You already took a hand before this lead." };
  }

  if (!getNextPlayerForCardTake(state, playerId)) {
    return { valid: false, reason: "There is no next player with cards to take." };
  }

  return { valid: true };
}

export function applyTakeNextPlayerCards(
  state: GameState,
  playerId: string,
  now = Date.now()
): GameState {
  const validation = canTakeNextPlayerCards(state, playerId, now);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const next = cloneGameState(state);
  const player = next.players.find((candidate) => candidate.id === playerId);
  const releasedPlayer = getNextPlayerForCardTake(next, playerId);
  if (!player || !releasedPlayer) {
    throw new Error("The next player's hand is no longer available.");
  }

  const transferredCards = releasedPlayer.hand.map((card) => ({ ...card }));
  releasedPlayer.hand = [];
  player.hand = sortHand([...player.hand, ...transferredCards]);
  player.missedTurnStreak = 0;
  next.lastTrick = undefined;
  next.cardTakeUsedById = player.id;
  next.recentPickup = {
    playerId: player.id,
    cardIds: transferredCards.map((card) => card.id),
    at: now
  };

  updateEscapeOrder(next, now);
  appendHistory(next, {
    type: "game",
    playerId: player.id,
    message: player.username + " took " + transferredCards.length + " card" +
      (transferredCards.length === 1 ? "" : "s") + " from " + releasedPlayer.username +
      ". " + releasedPlayer.username + " is safe."
  }, now);

  const stillHolding = next.players.filter((candidate) => candidate.hand.length > 0);
  if (stillHolding.length <= 1) {
    finishRound(next, stillHolding[0], now);
  } else {
    next.activePlayerId = player.id;
    setTurnClock(next, now);
  }

  next.updatedAt = now;
  return next;
}

export function applyMove(
  state: GameState,
  playerId: string,
  move: MoveAction,
  now = Date.now(),
  _rng: RandomSource = Math.random
): GameState {
  const validation = validateMove(state, playerId, move, now);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const next = cloneGameState(state);
  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player || move.type !== "play") {
    throw new Error("Player is not seated in this room.");
  }

  const card = player.hand.find((candidate) => candidate.id === move.cardIds[0]);
  if (!card) {
    throw new Error("That card is not in your hand.");
  }

  player.hand = sortHand(player.hand.filter((candidate) => candidate.id !== card.id));
  player.missedTurnStreak = 0;
  next.cardTakeUsedById = undefined;
  pruneRecentPickup(next, playerId);

  if (next.trick.length === 0) {
    next.lastTrick = undefined;
    next.leadSuit = card.suit;
    next.trickLeaderId = player.id;
    next.openingLeadRequired = false;
  }

  const protectedOpeningMiss = Boolean(
    next.leadSuit &&
    card.suit !== next.leadSuit &&
    isOpeningAceOfSpadesTrick(next)
  );
  const offSuit = Boolean(next.leadSuit && card.suit !== next.leadSuit && !protectedOpeningMiss);
  const play: TrickPlay = {
    playerId,
    username: player.username,
    card,
    offSuit
  };

  next.trick.push(play);
  rememberPlayedCard(next, playerId, card);
  appendHistory(next, {
    type: offSuit ? "penalty" : "play",
    playerId,
    message: offSuit
      ? `${player.username} threw ${cardLabel(card)} as Dhulla.`
      : `${player.username} played ${cardLabel(card)}.`
  }, now);

  if (offSuit) {
    resolveTrick(next, now);
    next.updatedAt = now;
    return next;
  }

  const nextPlayer = nextPendingPlayer(next, playerId);
  if (nextPlayer) {
    next.activePlayerId = nextPlayer.id;
    setTurnClock(next, now);
    next.updatedAt = now;
    return next;
  }

  resolveTrick(next, now);
  next.updatedAt = now;
  return next;
}

export function applyPenalty(
  state: GameState,
  playerId: string,
  reason: string,
  now = Date.now(),
  rng: RandomSource = Math.random
): GameState {
  const next = cloneGameState(state);
  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player || next.status !== "playing" || next.activePlayerId !== playerId) {
    return next;
  }

  if (next.dealEndsAt && now < next.dealEndsAt) {
    return next;
  }

  if (next.lastTrick && now - next.lastTrick.resolvedAt < TRICK_REVEAL_MS) {
    return next;
  }

  player.missedTurnStreak = (player.missedTurnStreak ?? 0) + 1;

  if (player.missedTurnStreak >= 2) {
    declareTimeoutBhabhi(next, player, reason, now);
    setTurnClock(next, now);
    next.updatedAt = now;
    void rng;
    return next;
  }

  const giver = nextPlayerMatching(next, playerId, (candidate) =>
    candidate.id !== playerId && candidate.hand.length > 0
  );
  const giftCard = giver ? chooseTimeoutCard(giver.hand) : undefined;
  if (giver && giftCard) {
    giver.hand = sortHand(giver.hand.filter((candidate) => candidate.id !== giftCard.id));
    player.hand = sortHand([...player.hand, giftCard]);
    next.recentPickup = {
      playerId: player.id,
      cardIds: [giftCard.id],
      at: now
    };
  }

  appendHistory(next, {
    type: "penalty",
    playerId,
    message: giftCard && giver
      ? `Timeout Dhulla! ${giver.username} gave ${cardLabel(giftCard)} to ${player.username} for missing the timer.`
      : `Timeout Dhulla! ${player.username} missed the timer.`
  }, now);

  if (next.openingLeadRequired) {
    next.activePlayerId = player.id;
    setTurnClock(next, now);
    next.updatedAt = now;
    void rng;
    return next;
  }

  next.timedOutPlayerIds = uniqueIds([...(next.timedOutPlayerIds ?? []), playerId]);
  const nextPlayer = nextPendingPlayer(next, playerId);
  if (nextPlayer) {
    next.activePlayerId = nextPlayer.id;
    setTurnClock(next, now);
    next.updatedAt = now;
    void rng;
    return next;
  }

  if (next.trick.length > 0) {
    resolveTrick(next, now);
  } else {
    const fallback = nextActivePlayerAfter(next, playerId) ?? nextActivePlayer(next);
    if (fallback) {
      next.activePlayerId = fallback.id;
      setTurnClock(next, now);
    } else {
      finishRound(next, player, now);
    }
  }

  next.updatedAt = now;
  void rng;
  return next;
}

export function scoreHand(cards: Card[]): number {
  return cards.length;
}

export function cardRankName(rank: Rank): string {
  if (rank === "A") return "Ace";
  if (rank === "J") return "Jack";
  if (rank === "Q") return "Queen";
  if (rank === "K") return "King";
  return rank;
}

function resolveTrick(state: GameState, now: number, forcedPickupPlayerId?: string): void {
  const leadSuit = state.leadSuit;
  if (!leadSuit || state.trick.length === 0) {
    state.trick = [];
    state.timedOutPlayerIds = [];
    state.activePlayerId = nextActivePlayer(state)?.id;
    setTurnClock(state, now);
    return;
  }

  const ledSuitPlays = state.trick.filter((play) => play.card.suit === leadSuit);
  const highPlay = ledSuitPlays.reduce((best, play) =>
    rankValue(play.card.rank) > rankValue(best.card.rank) ? play : best
  , ledSuitPlays[0]!);
  const hasThulla = state.trick.some((play) => play.offSuit) || Boolean(forcedPickupPlayerId);
  const trickCards = state.trick.map((play) => play.card);
  const pickupPlayer =
    (forcedPickupPlayerId ? state.players.find((player) => player.id === forcedPickupPlayerId) : undefined) ??
    state.players.find((player) => player.id === highPlay.playerId);
  let leaderId = pickupPlayer?.id ?? highPlay.playerId;

  state.lastTrick = {
    id: createId("trick"),
    plays: state.trick.map((play) => ({ ...play, card: { ...play.card } })),
    leadSuit,
    winnerId: highPlay.playerId,
    winnerName: highPlay.username,
    hasThulla,
    cleared: !hasThulla,
    pickedUpById: hasThulla ? pickupPlayer?.id : undefined,
    pickedUpByName: hasThulla ? pickupPlayer?.username : undefined,
    cardCount: trickCards.length,
    resolvedAt: now
  };

  if (hasThulla) {
    const punished = pickupPlayer;
    if (punished) {
      punished.hand = sortHand([...punished.hand, ...trickCards]);
      state.recentPickup = {
        playerId: punished.id,
        cardIds: trickCards.map((card) => card.id),
        at: now
      };
      appendHistory(state, {
        type: "penalty",
        playerId: punished.id,
        message: forcedPickupPlayerId
          ? `Timeout Dhulla! ${punished.username} picked up ${trickCards.length} card${trickCards.length === 1 ? "" : "s"}.`
          : `Dhulla! ${punished.username} picked up ${trickCards.length} card${trickCards.length === 1 ? "" : "s"}.`
      }, now);
    }
  } else {
    state.discardPile.push(...trickCards);
    pruneRecentPickup(state);
    appendHistory(state, {
      type: "play",
      playerId: highPlay.playerId,
      message: `${highPlay.username} cleared the trick with ${cardLabel(highPlay.card)}.`
    }, now);
  }

  state.trick = [];
  state.timedOutPlayerIds = [];
  state.leadSuit = undefined;
  state.trickLeaderId = undefined;
  updateEscapeOrder(state, now);

  const stillHolding = state.players.filter((player) => player.hand.length > 0);
  if (stillHolding.length <= 1) {
    finishRound(state, stillHolding[0], now);
    return;
  }

  const leader = state.players.find((player) => player.id === leaderId && player.hand.length > 0);
  if (!leader) {
    leaderId = nextActivePlayerAfter(state, highPlay.playerId)?.id ?? stillHolding[0]!.id;
  }

  state.activePlayerId = leaderId;
  setTurnClock(state, now);
}

function pruneRecentPickup(state: GameState, playerId?: string): void {
  if (!state.recentPickup) {
    return;
  }

  if (playerId && state.recentPickup.playerId !== playerId) {
    return;
  }

  const punished = state.players.find((player) => player.id === state.recentPickup?.playerId);
  if (!punished) {
    state.recentPickup = undefined;
    return;
  }

  const handIds = new Set(punished.hand.map((card) => card.id));
  const remainingPickupIds = state.recentPickup.cardIds.filter((cardId) => handIds.has(cardId));
  state.recentPickup = remainingPickupIds.length > 0
    ? { ...state.recentPickup, cardIds: remainingPickupIds }
    : undefined;
}

function rememberPlayedCard(state: GameState, playerId: string, card: Card): void {
  const previous = state.recentPlayedCardKeys?.[playerId] ?? [];
  const key = cardMemoryKey(card);
  state.recentPlayedCardKeys = {
    ...(state.recentPlayedCardKeys ?? {}),
    [playerId]: [key, ...previous.filter((item) => item !== key)].slice(0, 6)
  };
}

function finishRound(state: GameState, loser: PlayerState | undefined, now: number): void {
  const bhabhi = loser ?? state.players.find((player) => player.hand.length > 0) ?? state.players[0]!;
  updateEscapeOrder(state, now);

  const escapedIds = new Set(state.escapeOrder);
  for (const player of state.players) {
    player.ready = player.isBot;
    if (player.id !== bhabhi.id) {
      player.score += 1;
      player.roundWins += 1;
    }
  }

  state.bhabhiId = bhabhi.id;
  state.winnerId = state.escapeOrder[0] ?? state.players.find((player) => player.id !== bhabhi.id)?.id ?? bhabhi.id;
  state.activePlayerId = undefined;
  state.turnStartedAt = undefined;
  state.turnEndsAt = undefined;
  state.dealEndsAt = undefined;
  state.pendingDraw = 0;
  state.cardTakeUsedById = undefined;
  state.declaredSuit = undefined;
  state.leadSuit = undefined;
  state.trickLeaderId = undefined;

  const scoreLines = state.players.map((player) => ({
    playerId: player.id,
    username: player.username,
    cardsLeft: player.hand.length,
    pointsLeft: player.hand.length,
    escaped: escapedIds.has(player.id) || player.id !== bhabhi.id,
    isBhabhi: player.id === bhabhi.id
  }));

  const summary: RoundSummary = {
    id: createId("round"),
    round: state.round,
    at: now,
    winnerId: state.winnerId,
    winnerName: state.players.find((player) => player.id === state.winnerId)?.username ?? "Escaped players",
    pointsAwarded: 1,
    scoreLines
  };

  state.roundSummaries = [summary, ...state.roundSummaries].slice(0, 20);

  const escapeRanks = new Map(state.escapeOrder.map((playerId, index) => [playerId, index]));
  const champion = state.players
    .slice()
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftEscapeRank = escapeRanks.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightEscapeRank = escapeRanks.get(right.id) ?? Number.POSITIVE_INFINITY;
      return leftEscapeRank - rightEscapeRank;
    })[0];

  if (champion && champion.score >= state.settings.targetScore) {
    state.status = "game_over";
    state.championId = champion.id;
    appendHistory(state, {
      type: "game",
      playerId: champion.id,
      message: `${champion.username} won the match. ${bhabhi.username} is Bhabhi for this hand.`
    }, now);
  } else {
    state.status = "round_over";
    appendHistory(state, {
      type: "round",
      playerId: bhabhi.id,
      message: `${bhabhi.username} is Bhabhi with ${bhabhi.hand.length} card${bhabhi.hand.length === 1 ? "" : "s"} left.`
    }, now);
  }
}

function nextPendingPlayer(state: GameState, fromPlayerId: string): PlayerState | undefined {
  const playedIds = new Set(state.trick.map((play) => play.playerId));
  const skippedIds = new Set(state.timedOutPlayerIds ?? []);
  return nextPlayerMatching(state, fromPlayerId, (player) =>
    player.hand.length > 0 && !playedIds.has(player.id) && !skippedIds.has(player.id)
  );
}

function nextActivePlayer(state: GameState): PlayerState | undefined {
  return state.players.find((player) => player.hand.length > 0);
}

function nextActivePlayerAfter(state: GameState, fromPlayerId: string): PlayerState | undefined {
  return nextPlayerMatching(state, fromPlayerId, (player) => player.hand.length > 0);
}

function nextPlayerMatching(
  state: GameState,
  fromPlayerId: string,
  predicate: (player: PlayerState) => boolean
): PlayerState | undefined {
  const startIndex = state.players.findIndex((player) => player.id === fromPlayerId);
  if (startIndex < 0) {
    return state.players.find(predicate);
  }

  for (let step = 1; step <= state.players.length; step += 1) {
    const candidate = state.players[modulo(startIndex + step * state.direction, state.players.length)];
    if (candidate && predicate(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function updateEscapeOrder(state: GameState, now: number): void {
  const escaped = new Set(state.escapeOrder);
  for (const player of state.players) {
    if (player.hand.length === 0 && !escaped.has(player.id)) {
      state.escapeOrder.push(player.id);
      escaped.add(player.id);
      if (!state.winCelebration || state.winCelebration.endsAt <= now) {
        state.winCelebration = {
          id: createId("win"),
          playerId: player.id,
          username: player.username,
          rank: state.escapeOrder.length,
          startedAt: now,
          endsAt: now + WIN_CELEBRATION_MS
        };
      }
      appendHistory(state, {
        type: "round",
        playerId: player.id,
        message: `${player.username} escaped the hand.`
      }, now);
    }
  }
}

function chooseTimeoutCard(cards: Card[]): Card | undefined {
  return cards
    .slice()
    .sort((left, right) => rankValue(left.rank) - rankValue(right.rank))[0];
}

function declareTimeoutBhabhi(state: GameState, player: PlayerState, reason: string, now: number): void {
  const originalName = player.username.replace(/\s+Bot$/i, "");
  player.sessionId = undefined;
  player.username = `${originalName} Bot`;
  player.connected = true;
  player.ready = true;
  player.isBot = true;
  player.botDifficulty = player.botDifficulty ?? "normal";
  player.missedTurnStreak = 0;
  player.lastSeenAt = now;
  state.timedOutPlayerIds = (state.timedOutPlayerIds ?? []).filter((id) => id !== player.id);
  state.activePlayerId = player.id;

  appendHistory(state, {
    type: "bot",
    playerId: player.id,
    message: `Bhabhi timeout! ${originalName} missed two turns in a row, so a bot takes over the seat.`
  }, now);
  appendHistory(state, {
    type: "penalty",
    playerId: player.id,
    message: `${originalName} lost the timer penalty after ${reason}.`
  }, now);
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function sortHand(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    spades: 0,
    hearts: 1,
    diamonds: 2,
    clubs: 3
  };

  return cards.slice().sort((left, right) => {
    const suitDiff = suitOrder[left.suit] - suitOrder[right.suit];
    return suitDiff === 0 ? rankValue(left.rank) - rankValue(right.rank) : suitDiff;
  });
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

function cardMemoryKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function isAceOfSpades(card: Card): boolean {
  return card.rank === "A" && card.suit === "spades";
}

function isOpeningAceOfSpadesTrick(state: Pick<GameState, "discardPile" | "lastTrick" | "trick">): boolean {
  return (
    state.discardPile.length === 0 &&
    !state.lastTrick &&
    state.trick.length > 0 &&
    isAceOfSpades(state.trick[0]!.card)
  );
}

function setTurnClock(state: GameState, now: number): void {
  const startAt = Math.max(
    now,
    state.winCelebration?.endsAt ?? 0,
    state.dealEndsAt ?? 0,
    state.lastTrick ? state.lastTrick.resolvedAt + TRICK_REVEAL_MS : 0
  );
  state.turnStartedAt = startAt;
  state.turnEndsAt = startAt + state.settings.turnSeconds * 1000;
}

function appendHistory(
  state: GameState,
  event: Omit<GameEvent, "id" | "at">,
  now = Date.now()
): void {
  state.history = [
    {
      id: createId("event"),
      at: now,
      ...event
    },
    ...state.history
  ].slice(0, 100);
}

function sanitizeName(username: string): string {
  const trimmed = username.trim().slice(0, 18);
  return trimmed.length > 0 ? trimmed : "Guest";
}

function sanitizeAvatar(avatar: string): string {
  const trimmed = avatar.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Aero";
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value ?? fallback)));
}

function isFunMode(value: unknown): value is GameSettings["funMode"] {
  return value === "classic" || value === "turbo" || value === "marathon" || value === "reverse";
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

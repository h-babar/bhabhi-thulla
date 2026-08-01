import type { GameState, PublicGameState, PublicPlayerState, PublicSpectatorState } from "./types.js";

export function toPublicGameState(state: GameState, viewerId?: string): PublicGameState {
  const { deck, players, spectators, ...rest } = state;

  const publicPlayers: PublicPlayerState[] = players.map((player) => {
    const { hand, sessionId: _sessionId, ...safePlayer } = player;
    const isYou = player.id === viewerId;
    return {
      ...safePlayer,
      handCount: hand.length,
      hand: isYou ? hand : undefined,
      isYou
    };
  });

  const publicSpectators: PublicSpectatorState[] = spectators.map((spectator) => {
    const { sessionId: _sessionId, ...safeSpectator } = spectator;
    return {
      ...safeSpectator,
      isYou: spectator.id === viewerId
    };
  });

  return {
    ...rest,
    players: publicPlayers,
    spectators: publicSpectators,
    deckCount: deck.length
  };
}

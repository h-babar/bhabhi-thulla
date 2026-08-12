import type { GameState, PublicGameState, PublicPlayerState, PublicSpectatorState } from "./types.js";

export function toPublicGameState(
  state: GameState,
  viewerId?: string,
  areFriends: (ownerProfileId: string, viewerProfileId: string) => boolean = () => false
): PublicGameState {
  const { deck, players, spectators, ...rest } = state;
  const viewerProfileId =
    players.find((player) => player.id === viewerId)?.profileId ??
    spectators.find((spectator) => spectator.id === viewerId)?.profileId;

  const publicPlayers: PublicPlayerState[] = players.map((player) => {
    const {
      hand,
      sessionId: _sessionId,
      profileId: _profileId,
      reliability: _reliability,
      ...safePlayer
    } = player;
    const isYou = player.id === viewerId;
    const canSeeImage = isYou || player.profileImageVisibility === "everyone" || (
      player.profileImageVisibility === "friends" &&
      Boolean(player.profileId && viewerProfileId && areFriends(player.profileId, viewerProfileId))
    );
    return {
      ...safePlayer,
      avatar: canSeeImage ? safePlayer.avatar : "initials",
      avatarUrl: canSeeImage ? safePlayer.avatarUrl : undefined,
      handCount: hand.length,
      hand: isYou ? hand : undefined,
      isYou
    };
  });

  const publicSpectators: PublicSpectatorState[] = spectators.map((spectator) => {
    const { sessionId: _sessionId, profileId: _profileId, ...safeSpectator } = spectator;
    const isYou = spectator.id === viewerId;
    const canSeeImage = isYou || spectator.profileImageVisibility === "everyone" || (
      spectator.profileImageVisibility === "friends" &&
      Boolean(spectator.profileId && viewerProfileId && areFriends(spectator.profileId, viewerProfileId))
    );
    return {
      ...safeSpectator,
      avatar: canSeeImage ? safeSpectator.avatar : "initials",
      avatarUrl: canSeeImage ? safeSpectator.avatarUrl : undefined,
      isYou
    };
  });

  return {
    ...rest,
    players: publicPlayers,
    spectators: publicSpectators,
    deckCount: deck.length
  };
}

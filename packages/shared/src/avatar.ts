export type AvatarCategory = "Classic" | "Players" | "Cards" | "Royal" | "Fun";

export interface BuiltInAvatarDefinition {
  id: string;
  name: string;
  category: AvatarCategory;
  spriteIndex: number;
}

export const BUILT_IN_AVATARS: readonly BuiltInAvatarDefinition[] = Object.freeze([
  { id: "avatar_01", name: "Cardsharp", category: "Players", spriteIndex: 0 },
  { id: "avatar_02", name: "Scarlet Ace", category: "Players", spriteIndex: 1 },
  { id: "avatar_03", name: "Emerald King", category: "Royal", spriteIndex: 2 },
  { id: "avatar_04", name: "Golden Queen", category: "Royal", spriteIndex: 3 },
  { id: "avatar_05", name: "Night Dealer", category: "Classic", spriteIndex: 4 },
  { id: "avatar_06", name: "Violet Masque", category: "Classic", spriteIndex: 5 },
  { id: "avatar_07", name: "Wild Card", category: "Fun", spriteIndex: 6 },
  { id: "avatar_08", name: "Ivory Masque", category: "Classic", spriteIndex: 7 },
  { id: "avatar_09", name: "Emerald Spade", category: "Cards", spriteIndex: 8 },
  { id: "avatar_10", name: "Ruby Heart", category: "Cards", spriteIndex: 9 },
  { id: "avatar_11", name: "Sapphire Diamond", category: "Cards", spriteIndex: 10 },
  { id: "avatar_12", name: "Amethyst Club", category: "Cards", spriteIndex: 11 },
  { id: "avatar_13", name: "Midnight Highroller", category: "Players", spriteIndex: 12 },
  { id: "avatar_14", name: "Silver Society", category: "Players", spriteIndex: 13 },
  { id: "avatar_15", name: "Eastern Champion", category: "Players", spriteIndex: 14 },
  { id: "avatar_16", name: "Emerald Empress", category: "Royal", spriteIndex: 15 }
]);

export const BUILT_IN_AVATAR_IDS = new Set(BUILT_IN_AVATARS.map((avatar) => avatar.id));

const LEGACY_AVATAR_IDS: Readonly<Record<string, string>> = Object.freeze({
  Aero: "avatar_01",
  Bolt: "avatar_02",
  Crown: "avatar_03",
  Drift: "avatar_04",
  Flux: "avatar_05",
  Glint: "avatar_06",
  Halo: "avatar_07",
  Ivy: "avatar_08"
});

export function isBuiltInAvatarId(value: string | undefined): value is string {
  return Boolean(value && BUILT_IN_AVATAR_IDS.has(value));
}

export function avatarSpritePosition(avatarId: string | undefined): { x: number; y: number } | undefined {
  const resolvedId = avatarId ? LEGACY_AVATAR_IDS[avatarId] ?? avatarId : undefined;
  const avatar = BUILT_IN_AVATARS.find((candidate) => candidate.id === resolvedId);
  if (!avatar) return undefined;
  return {
    x: (avatar.spriteIndex % 4) * (100 / 3),
    y: Math.floor(avatar.spriteIndex / 4) * (100 / 3)
  };
}

import type {
  AuthProfileResponse,
  GuestProgressTransfer,
  PlayerPreferences,
  UpdatePlayerProfileInput,
  UsernameAvailabilityResponse
} from "@getaway-cards/shared";
import { BUILT_IN_AVATAR_IDS } from "@getaway-cards/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { isGoogleAuthEnabled, profileForDecodedUser, requireAuth, type AuthenticatedRequest } from "./auth.js";
import type { GameDatabase } from "./db.js";
import { ProfileImageStorage, validateAndNormalizeProfileImage } from "./profileImageStorage.js";

const blockedNameFragments = ["admin", "moderator", "support", "fuck", "shit", "nazi"];
const tableThemes = new Set(["casino", "emerald", "midnight", "royal", "neon", "mahogany", "velvet", "ice", "obsidian", "sapphire", "crimson", "platinum", "jungle", "aurora", "monaco", "blackGold", "oxford", "amethyst", "championship", "bordeaux", "carbon", "pearl"]);
const cardStyles = new Set(["classic", "royal", "midnight", "neon", "minimal", "heritage", "carbon", "championship"]);
const profileFrames = new Set(["default", "bronze", "silver", "gold", "platinum", "diamond", "master", "tournament_champion"]);
const imageTypes = new Set(["custom", "avatar", "google", "initials"]);
const imageVisibilities = new Set(["everyone", "friends", "nobody"]);
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 2 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  }
});

export function createProfileRouter(db: GameDatabase, imageStorage = new ProfileImageStorage()): Router {
  const router = Router();
  const usernameLimit = createRateLimiter(20, 60_000);
  const updateLimit = createRateLimiter(12, 60_000);
  const uploadLimit = createRateLimiter(6, 10 * 60_000);

  router.get("/auth/status", (_request, response) => {
    response.json({ googleEnabled: isGoogleAuthEnabled() });
  });

  router.post("/auth/google", requireAuth(), (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
    const profile = profileForDecodedUser(db, request.authUser!);
    response.json({ ok: true, profile });
  });

  router.get("/profile/me", requireAuth(), (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
    const profile = db.findProfileByProviderUserId(request.authUser!.uid) ?? profileForDecodedUser(db, request.authUser!);
    response.json({ ok: true, profile });
  });

  router.get(
    "/profile/username/:username",
    requireAuth(),
    usernameLimit,
    (request: AuthenticatedRequest, response: Response<UsernameAvailabilityResponse>) => {
      const rawUsername = request.params.username;
      const normalized = normalizeUsername(Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "");
      const validation = validateUsername(normalized);
      if (validation) {
        response.json({ available: false, normalized, reason: validation });
        return;
      }
      const current = db.findProfileByProviderUserId(request.authUser!.uid);
      response.json({
        available: db.isUsernameAvailable(normalized, current?.id),
        normalized,
        reason: db.isUsernameAvailable(normalized, current?.id) ? undefined : "That username is already taken."
      });
    }
  );

  router.patch(
    "/profile/me",
    requireAuth(),
    updateLimit,
    (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
      const current = db.findProfileByProviderUserId(request.authUser!.uid) ?? profileForDecodedUser(db, request.authUser!);
      const parsed = parseProfileUpdate(request.body as UpdatePlayerProfileInput);
      if (parsed.error) {
        response.status(400).json({ ok: false, error: parsed.error });
        return;
      }
      if (parsed.value.username && !db.isUsernameAvailable(parsed.value.username, current.id)) {
        response.status(409).json({ ok: false, error: "That username is already taken." });
        return;
      }
      if (parsed.value.profileFrameId && !isFrameUnlocked(parsed.value.profileFrameId, current.level, current.stats.tournamentWins)) {
        response.status(403).json({ ok: false, error: "That profile frame has not been unlocked yet." });
        return;
      }
      response.json({ ok: true, profile: db.updatePlayerProfile(current.id, parsed.value) });
    }
  );

  router.post(
    "/profile/image",
    requireAuth(),
    uploadLimit,
    profileUpload.single("image"),
    async (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
      const current = db.findProfileByProviderUserId(request.authUser!.uid) ?? profileForDecodedUser(db, request.authUser!);
      if (!request.file) {
        response.status(400).json({ ok: false, error: "Choose a JPG, PNG, or WebP image to upload." });
        return;
      }
      try {
        const normalized = await validateAndNormalizeProfileImage(request.file);
        const previousKey = db.getCustomProfilePhotoKey(current.id);
        const publicOrigin = `${request.protocol}://${request.get("host")}`;
        const stored = await imageStorage.save(current.id, normalized.buffer, publicOrigin);
        const profile = db.setCustomProfilePhoto(current.id, stored.url, stored.key);
        if (!profile) {
          await imageStorage.remove(stored.key);
          throw new Error("The profile image could not be saved.");
        }
        await imageStorage.remove(previousKey).catch(() => undefined);
        response.json({ ok: true, profile });
      } catch (error) {
        response.status(400).json({ ok: false, error: errorMessage(error, "The profile image could not be uploaded.") });
      }
    }
  );

  router.delete(
    "/profile/image",
    requireAuth(),
    uploadLimit,
    async (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
      const current = db.findProfileByProviderUserId(request.authUser!.uid) ?? profileForDecodedUser(db, request.authUser!);
      const previousKey = db.getCustomProfilePhotoKey(current.id);
      try {
        const profile = db.clearCustomProfilePhoto(current.id);
        await imageStorage.remove(previousKey).catch(() => undefined);
        response.json({ ok: true, profile });
      } catch (error) {
        response.status(400).json({ ok: false, error: errorMessage(error, "The uploaded photo could not be removed.") });
      }
    }
  );

  router.post(
    "/profile/merge-guest",
    requireAuth(),
    updateLimit,
    (request: AuthenticatedRequest, response: Response<AuthProfileResponse>) => {
      const current = db.findProfileByProviderUserId(request.authUser!.uid) ?? profileForDecodedUser(db, request.authUser!);
      const guest = parseGuestTransfer(request.body);
      if (!guest) {
        response.status(400).json({ ok: false, error: "Guest progress could not be verified." });
        return;
      }
      response.json({ ok: true, profile: db.mergeGuestProgress(current.id, guest) });
    }
  );

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      response.status(400).json({
        ok: false,
        error: error.code === "LIMIT_FILE_SIZE"
          ? "Profile photos must be no larger than 5 MB."
          : "The profile photo upload was rejected."
      });
      return;
    }
    next(error);
  });

  return router;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
}

function validateUsername(value: string): string | undefined {
  if (!/^[a-z0-9_]{3,16}$/.test(value)) return "Use 3-16 letters, numbers, or underscores.";
  if (blockedNameFragments.some((fragment) => value.includes(fragment))) return "Choose a different username.";
  return undefined;
}

function parseProfileUpdate(input: UpdatePlayerProfileInput | null | undefined): { value: UpdatePlayerProfileInput; error?: string } {
  const source = input && typeof input === "object" ? input : {};
  const value: UpdatePlayerProfileInput = {};
  if (source.displayName !== undefined) {
    const displayName = cleanText(source.displayName, 24);
    if (displayName.length < 2) return { value, error: "Display name must be at least 2 characters." };
    if (blockedNameFragments.some((fragment) => displayName.toLowerCase().includes(fragment))) {
      return { value, error: "Choose a different display name." };
    }
    value.displayName = displayName;
  }
  if (source.username !== undefined) {
    const username = normalizeUsername(source.username);
    const error = validateUsername(username);
    if (error) return { value, error };
    value.username = username;
  }
  const selectedAvatarId = source.selectedAvatarId ?? source.avatarId;
  if (selectedAvatarId !== undefined) {
    if (!BUILT_IN_AVATAR_IDS.has(selectedAvatarId)) return { value, error: "Choose a valid game avatar." };
    value.avatarId = selectedAvatarId;
    value.selectedAvatarId = selectedAvatarId;
  }
  if (source.profileFrameId !== undefined) {
    if (!profileFrames.has(source.profileFrameId)) return { value, error: "Choose a valid profile frame." };
    value.profileFrameId = source.profileFrameId;
  }
  if (source.activeImageType !== undefined) {
    if (!imageTypes.has(source.activeImageType)) return { value, error: "Choose a valid profile image source." };
    value.activeImageType = source.activeImageType;
  }
  if (source.profileImageVisibility !== undefined) {
    if (!imageVisibilities.has(source.profileImageVisibility)) return { value, error: "Choose a valid profile image visibility." };
    value.profileImageVisibility = source.profileImageVisibility;
  }
  if (source.country !== undefined) value.country = cleanText(source.country, 56);
  if (source.bio !== undefined) value.bio = cleanText(source.bio, 160);
  if (source.selectedBadgeId !== undefined) value.selectedBadgeId = cleanText(source.selectedBadgeId, 40);
  if (source.preferences && typeof source.preferences === "object") value.preferences = parsePreferences(source.preferences);
  return { value };
}

function parseGuestTransfer(input: unknown): GuestProgressTransfer | undefined {
  if (!input || typeof input !== "object") return undefined;
  const data = input as Partial<GuestProgressTransfer>;
  if (!data.guestId || !data.displayName || !data.avatarId) return undefined;
  return {
    guestId: String(data.guestId).slice(0, 80),
    displayName: cleanText(data.displayName, 24),
    avatarId: cleanText(data.avatarId, 24),
    coins: Number(data.coins ?? 0),
    stats: data.stats ?? {},
    achievementProgress: data.achievementProgress ?? {},
    preferences: parsePreferences(data.preferences ?? {})
  };
}

function parsePreferences(input: Partial<PlayerPreferences>): Partial<PlayerPreferences> {
  const preferences: Partial<PlayerPreferences> = {};
  if (typeof input.tableTheme === "string" && tableThemes.has(input.tableTheme)) preferences.tableTheme = input.tableTheme;
  if (typeof input.cardBack === "string" && cardStyles.has(input.cardBack)) preferences.cardBack = input.cardBack;
  for (const key of [
    "soundEnabled",
    "musicEnabled",
    "vibrationEnabled",
    "reducedMotion",
    "highContrast",
    "shareAvatarInResults",
    "shareUsernameInResults"
  ] as const) {
    if (typeof input[key] === "boolean") preferences[key] = input[key];
  }
  if (input.activityVisibility === "everyone" || input.activityVisibility === "friends" || input.activityVisibility === "nobody") {
    preferences.activityVisibility = input.activityVisibility;
  }
  if (typeof input.friendOnlineNotifications === "boolean") {
    preferences.friendOnlineNotifications = input.friendOnlineNotifications;
  }
  if (typeof input.language === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.language)) {
    preferences.language = input.language;
  }
  return preferences;
}

function cleanText(value: string, maxLength: number): string {
  return String(value).replace(/[<>\u0000-\u001f]/g, "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isFrameUnlocked(frameId: string, level: number, tournamentWins: number): boolean {
  if (frameId === "tournament_champion") return tournamentWins > 0;
  const requiredLevel: Record<string, number> = {
    default: 1,
    bronze: 2,
    silver: 4,
    gold: 7,
    platinum: 10,
    diamond: 15,
    master: 20
  };
  return level >= (requiredLevel[frameId] ?? Number.POSITIVE_INFINITY);
}

function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (request: Request, response: Response, next: NextFunction): void => {
    const key = request.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= limit) {
      response.status(429).json({ ok: false, error: "Too many profile requests. Try again shortly." });
      return;
    }
    bucket.count += 1;
    next();
  };
}

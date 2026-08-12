import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";
import { config } from "./config.js";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MIN_SOURCE_EDGE = 256;
const OUTPUT_EDGE = 512;

export interface StoredProfileImage {
  url: string;
  key: string;
}

export interface ValidatedProfileImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export async function validateAndNormalizeProfileImage(file: Express.Multer.File): Promise<ValidatedProfileImage> {
  const extension = extname(file.originalname).toLowerCase();
  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
    throw new Error("Upload a JPG, JPEG, PNG, or WebP image.");
  }
  if (!file.buffer.length || file.buffer.length > MAX_SOURCE_BYTES) {
    throw new Error("Profile photos must be no larger than 5 MB.");
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(file.buffer, { failOn: "error", limitInputPixels: 25_000_000 }).metadata();
  } catch {
    throw new Error("That file is not a valid image.");
  }
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("That image format is not supported.");
  }
  if (!metadata.width || !metadata.height || metadata.width < MIN_SOURCE_EDGE || metadata.height < MIN_SOURCE_EDGE) {
    throw new Error("Profile photos must be at least 256 by 256 pixels.");
  }

  const buffer = await sharp(file.buffer, { failOn: "error", limitInputPixels: 25_000_000 })
    .rotate()
    .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: "cover", position: "centre", withoutEnlargement: false })
    .webp({ quality: 86, effort: 5, smartSubsample: true })
    .toBuffer();
  return { buffer, width: OUTPUT_EDGE, height: OUTPUT_EDGE };
}

export class ProfileImageStorage {
  async save(userId: string, image: Buffer, publicOrigin: string): Promise<StoredProfileImage> {
    const safeUserId = safePathPart(userId);
    const version = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const key = `avatars/${safeUserId}/profile-${version}.webp`;

    if (config.firebaseStorageBucket) {
      const token = randomUUID();
      const bucket = getStorage().bucket(config.firebaseStorageBucket);
      await bucket.file(key).save(image, {
        resumable: false,
        validation: "crc32c",
        metadata: {
          contentType: "image/webp",
          cacheControl: "public,max-age=31536000,immutable",
          metadata: { firebaseStorageDownloadTokens: token }
        }
      });
      const encoded = encodeURIComponent(key);
      return {
        key,
        url: `https://firebasestorage.googleapis.com/v0/b/${config.firebaseStorageBucket}/o/${encoded}?alt=media&token=${token}`
      };
    }

    const localKey = `${safeUserId}/profile-${version}.webp`;
    const target = safeLocalPath(localKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, image, { flag: "wx" });
    return {
      key: `local:${localKey}`,
      url: `${publicOrigin.replace(/\/$/, "")}/uploads/profile/${localKey.split(sep).join("/")}`
    };
  }

  async remove(key: string | undefined): Promise<void> {
    if (!key) return;
    if (key.startsWith("local:")) {
      await rm(safeLocalPath(key.slice(6)), { force: true });
      return;
    }
    if (config.firebaseStorageBucket && key.startsWith("avatars/")) {
      await getStorage().bucket(config.firebaseStorageBucket).file(key).delete({ ignoreNotFound: true });
    }
  }
}

function safePathPart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!cleaned) throw new Error("The profile image path is invalid.");
  return cleaned;
}

function safeLocalPath(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || !/^[a-zA-Z0-9_\/-]+\.webp$/.test(normalized)) {
    throw new Error("The profile image path is invalid.");
  }
  const root = resolve(config.profileImageDir);
  const target = resolve(root, normalized);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("The profile image path is invalid.");
  return target;
}

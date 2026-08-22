import "dotenv/config";
import { resolve } from "node:path";

function numberFromEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function originsFromEnv(): string[] {
  const raw = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function listFromEnv(name: string, fallback: string[] = []): string[] {
  const value = process.env[name]?.trim();
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : fallback;
}

export const config = {
  port: numberFromEnv("PORT", 4000),
  clientOrigins: originsFromEnv(),
  sqlitePath: resolve(process.env.SQLITE_PATH ?? "./data/bhabhi-thulla.sqlite"),
  seedDemo: (process.env.SEED_DEMO ?? "true").toLowerCase() === "true",
  nodeEnv: process.env.NODE_ENV ?? "development",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID?.trim(),
  voice: {
    stunUrls: listFromEnv("VOICE_STUN_URLS", [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302"
    ]),
    turnUrls: listFromEnv("VOICE_TURN_URLS"),
    turnUsername: process.env.VOICE_TURN_USERNAME?.trim(),
    turnCredential: process.env.VOICE_TURN_CREDENTIAL?.trim(),
    turnRestSecret: process.env.VOICE_TURN_REST_SECRET?.trim(),
    turnCredentialTtlSeconds: numberFromEnv("VOICE_TURN_CREDENTIAL_TTL_SECONDS", 3600)
  }
};

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

export const config = {
  port: numberFromEnv("PORT", 4000),
  clientOrigins: originsFromEnv(),
  sqlitePath: resolve(process.env.SQLITE_PATH ?? "./data/bhabhi-thulla.sqlite"),
  seedDemo: (process.env.SEED_DEMO ?? "true").toLowerCase() === "true",
  nodeEnv: process.env.NODE_ENV ?? "development"
};

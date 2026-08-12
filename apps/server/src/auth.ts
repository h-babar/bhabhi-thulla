import type { PlayerProfilePayload } from "@getaway-cards/shared";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { GameDatabase } from "./db.js";

export interface AuthenticatedRequest extends Request {
  authUser?: DecodedIdToken;
}

export interface TrustedPlayerProfile extends PlayerProfilePayload {
  identityId: string;
  accountType: "guest" | "registered";
  profileId?: string;
  rankBadge?: string;
}

let firebaseReady = false;

export function initializeFirebaseAdmin(): boolean {
  if (!config.firebaseProjectId) return false;
  if (getApps().length > 0) {
    firebaseReady = true;
    return true;
  }

  initializeApp({ projectId: config.firebaseProjectId });
  firebaseReady = true;
  return true;
}

export function isGoogleAuthEnabled(): boolean {
  return firebaseReady || initializeFirebaseAdmin();
}

export async function verifyFirebaseToken(token: string): Promise<DecodedIdToken> {
  if (!isGoogleAuthEnabled()) {
    throw new Error("Google sign-in has not been configured on the server.");
  }
  return getAuth().verifyIdToken(token);
}

export function requireAuth() {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction): Promise<void> => {
    const token = bearerToken(request);
    if (!token) {
      response.status(401).json({ ok: false, error: "Sign in is required." });
      return;
    }
    try {
      request.authUser = await verifyFirebaseToken(token);
      next();
    } catch {
      response.status(401).json({ ok: false, error: "Your sign-in session has expired. Please sign in again." });
    }
  };
}

export async function trustedPlayerPayload(
  db: GameDatabase,
  payload: PlayerProfilePayload
): Promise<TrustedPlayerProfile> {
  if (payload.authToken) {
    const decoded = await verifyFirebaseToken(payload.authToken);
    const profile = db.getOrCreateGoogleProfile({
      providerUserId: decoded.uid,
      email: decoded.email ?? `${decoded.uid}@private.firebase`,
      displayName: decoded.name ?? payload.username,
      photoUrl: decoded.picture
    });
    return {
      username: profile.displayName,
      avatar: profile.avatarId,
      avatarUrl: profile.photoUrl,
      profileFrameId: profile.profileFrameId,
      profileImageVisibility: profile.profileImageVisibility,
      level: profile.level,
      sessionId: payload.sessionId,
      accountType: "registered",
      identityId: profile.id,
      profileId: profile.id,
      rankBadge: profile.rank
    };
  }

  return {
    username: cleanPublicName(payload.username),
    avatar: cleanAvatar(payload.avatar),
    profileFrameId: "default",
    profileImageVisibility: "everyone",
    sessionId: payload.sessionId,
    guestId: payload.guestId,
    accountType: "guest",
    identityId: payload.guestId?.trim().slice(0, 80) || randomUUID()
  };
}

export function profileForDecodedUser(db: GameDatabase, decoded: DecodedIdToken) {
  return db.getOrCreateGoogleProfile({
    providerUserId: decoded.uid,
    email: decoded.email ?? `${decoded.uid}@private.firebase`,
    displayName: decoded.name ?? "Player",
    photoUrl: decoded.picture
  });
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.header("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
}

function cleanPublicName(value: string): string {
  return value.replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().replace(/\s+/g, " ").slice(0, 24) || "Guest";
}

function cleanAvatar(value: string): string {
  return value.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 24) || "Aero";
}

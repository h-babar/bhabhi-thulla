import type {
  AuthProfileResponse,
  GuestProgressTransfer,
  UpdatePlayerProfileInput,
  UsernameAvailabilityResponse
} from "@getaway-cards/shared";
import { API_URL } from "./api.js";

export async function exchangeGoogleToken(token: string): Promise<AuthProfileResponse> {
  return authRequest<AuthProfileResponse>("/api/auth/google", token, { method: "POST" });
}

export async function loadMyProfile(token: string): Promise<AuthProfileResponse> {
  return authRequest<AuthProfileResponse>("/api/profile/me", token);
}

export async function updateMyProfile(
  token: string,
  input: UpdatePlayerProfileInput
): Promise<AuthProfileResponse> {
  return authRequest<AuthProfileResponse>("/api/profile/me", token, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function mergeGuestProgress(
  token: string,
  input: GuestProgressTransfer
): Promise<AuthProfileResponse> {
  return authRequest<AuthProfileResponse>("/api/profile/merge-guest", token, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function checkUsername(
  token: string,
  username: string
): Promise<UsernameAvailabilityResponse> {
  return authRequest<UsernameAvailabilityResponse>(
    `/api/profile/username/${encodeURIComponent(username)}`,
    token
  );
}

async function authRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers
      }
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Account request failed.");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The account server is taking too long to respond. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

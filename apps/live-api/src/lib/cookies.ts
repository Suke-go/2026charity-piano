import { SESSION_COOKIE_NAME } from "@charity/shared";
import { createId } from "./ids";

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    result[rawKey] = rest.join("=");
  }
  return result;
}

export function getSessionCookie(cookieHeader: string | null | undefined) {
  return parseCookieHeader(cookieHeader)[SESSION_COOKIE_NAME] ?? null;
}

export function createSessionCookie(sessionId: string = createId()) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

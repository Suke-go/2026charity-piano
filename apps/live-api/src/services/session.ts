import { createSessionCookie, getSessionCookie } from "../lib/cookies";
import { createId } from "../lib/ids";

export function ensureSessionId(cookieHeader: string | null | undefined) {
  const sessionId = getSessionCookie(cookieHeader) ?? createId();
  const setCookie = getSessionCookie(cookieHeader) ? null : createSessionCookie(sessionId);
  return {
    sessionId,
    setCookie
  };
}

import { COMMENT_MAX_LENGTH, DEFAULT_BLOCKED_PATTERNS, type ModerationStatus } from "@charity/shared";

export interface ModerationDecision {
  status: ModerationStatus;
  reason: string | null;
}

export function evaluateComment(text: string, blockedWords: string[] = []): ModerationDecision {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { status: "BLOCKED", reason: "empty_comment" };
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return { status: "BLOCKED", reason: "too_long" };
  }
  for (const pattern of DEFAULT_BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { status: "BLOCKED", reason: "url_not_allowed" };
    }
  }
  for (const word of blockedWords) {
    if (!word) continue;
    if (trimmed.toLowerCase().includes(word.toLowerCase())) {
      return { status: "BLOCKED", reason: "blocked_word" };
    }
  }
  return { status: "NONE", reason: null };
}

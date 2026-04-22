import {
  COMMENT_MAX_LENGTH,
  DEFAULT_BLOCKED_PATTERNS,
  type CommentDisplayMode,
  type CommentRenderPolicy,
  type CommentRenderPriority,
  type DisplayStatus,
  type ModerationStatus
} from "@charity/shared";

export interface ModerationDecision {
  status: ModerationStatus;
  reason: string | null;
}

export interface CommentPolicyDecision {
  displayStatus: DisplayStatus;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  renderPriority: CommentRenderPriority;
  renderPolicy: CommentRenderPolicy;
  displayModeHint: CommentDisplayMode;
}

export interface CommentPolicyContext {
  msSinceLastPost?: number | null;
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

export function decideCommentPolicy(
  text: string,
  blockedWords: string[] = [],
  context: CommentPolicyContext = {}
): CommentPolicyDecision {
  const moderation = evaluateComment(text, blockedWords);
  if (moderation.status === "BLOCKED") {
    return {
      displayStatus: "HIDDEN",
      moderationStatus: moderation.status,
      moderationReason: moderation.reason,
      renderPriority: "LOW",
      renderPolicy: "ADMIN_ONLY",
      displayModeHint: "COMPACT"
    };
  }

  const render = rankVisibleComment(text, context);
  return {
    displayStatus: "VISIBLE",
    moderationStatus: moderation.status,
    moderationReason: moderation.reason,
    ...render
  };
}

export function rankVisibleComment(
  text: string,
  context: CommentPolicyContext = {}
): Pick<CommentPolicyDecision, "renderPriority" | "renderPolicy" | "displayModeHint"> {
  const normalized = text.trim().replace(/\s+/g, " ");
  const length = Array.from(normalized).length;

  if (context.msSinceLastPost !== null && context.msSinceLastPost !== undefined && context.msSinceLastPost < 3500) {
    return {
      renderPriority: "LOW",
      renderPolicy: "DROP_WHEN_DENSE",
      displayModeHint: "SCROLL"
    };
  }

  if (length > 90) {
    return {
      renderPriority: "LOW",
      renderPolicy: "DROP_WHEN_DENSE",
      displayModeHint: "COMPACT"
    };
  }

  if (isLightweightReaction(normalized)) {
    return {
      renderPriority: "LOW",
      renderPolicy: "DROP_WHEN_DENSE",
      displayModeHint: "SCROLL"
    };
  }

  return {
    renderPriority: "NORMAL",
    renderPolicy: "NORMAL",
    displayModeHint: "SCROLL"
  };
}

function isLightweightReaction(value: string) {
  const lower = value.toLowerCase();
  if (Array.from(value).length <= 2) return true;
  if (/^([\u0077\uFF57\u7B11\u8349\u0038\uFF18!\uFF01?\uFF1F\u30FC~\u301C\u30FB.\u3002\u2026\u3001,])\1{2,}$/u.test(value)) {
    return true;
  }
  if (/^(?:[\uFE0F\u200D]|\p{Extended_Pictographic})+$/u.test(value)) return true;
  const lightweightReactions = [
    "ww",
    "www",
    "888",
    "8888",
    "nice",
    "lol",
    "\u3059\u3054\u3044",
    "\u6700\u9ad8",
    "\u3044\u3044\u306d",
    "\u304b\u308f\u3044\u3044",
    "\u3046\u307e\u3044"
  ];
  return lightweightReactions.includes(lower);
}

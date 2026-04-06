export const ROOM_MODES = ["OPEN", "SLOW", "CLOSED"] as const;
export type RoomMode = (typeof ROOM_MODES)[number];

export const DISPLAY_STATUSES = ["VISIBLE", "HIDDEN"] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const MODERATION_STATUSES = ["NONE", "BLOCKED", "PENDING"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const COMMENT_MAX_LENGTH = 200;
export const SESSION_COOKIE_NAME = "live_session";
export const DEFAULT_COMMENT_PAGE_SIZE = 50;
export const DEFAULT_ADMIN_COMMENT_PAGE_SIZE = 100;

export const SSE_EVENT_TYPES = {
  COMMENT_CREATED: "comment_created",
  ROOM_STATE_UPDATED: "room_state_updated",
  COMMENT_DELETED: "comment_deleted",
  SYNC_REQUIRED: "sync_required"
} as const;

export type SseEventType = (typeof SSE_EVENT_TYPES)[keyof typeof SSE_EVENT_TYPES];

export const DEFAULT_BLOCKED_PATTERNS = [
  /https?:\/\/\S+/i,
  /\bwww\.\S+/i
];

import { z } from "zod";
import {
  COMMENT_MAX_LENGTH,
  DISPLAY_STATUSES,
  MODERATION_STATUSES,
  ROOM_MODES
} from "./constants";

export const roomModeSchema = z.enum(ROOM_MODES);
export const displayStatusSchema = z.enum(DISPLAY_STATUSES);
export const moderationStatusSchema = z.enum(MODERATION_STATUSES);

export const eventIdSchema = z.string().min(1).max(128);
export const commentIdSchema = z.string().min(1).max(128);
export const userSessionIdSchema = z.string().min(1).max(128);
export const isoTimestampSchema = z.string().datetime({ offset: true });

export const eventSchema = z.object({
  eventId: eventIdSchema,
  title: z.string().min(1).max(200),
  streamPlaybackUid: z.string().min(1).max(200).nullable(),
  status: z.string().min(1).max(64)
});

export const roomStateSchema = z.object({
  mode: roomModeSchema,
  slowModeIntervalSec: z.number().int().min(0).max(3600),
  updatedAt: isoTimestampSchema
});

export const commentSchema = z.object({
  commentId: commentIdSchema,
  eventId: eventIdSchema,
  userSessionId: userSessionIdSchema,
  commentText: z.string().min(1).max(COMMENT_MAX_LENGTH),
  serverReceivedAt: isoTimestampSchema,
  displayStatus: displayStatusSchema,
  moderationStatus: moderationStatusSchema,
  deletedFlag: z.boolean(),
  moderationReason: z.string().min(1).max(512).nullable()
});

export const commentStreamCommentCreatedSchema = z.object({
  eventId: eventIdSchema,
  comment: commentSchema
});

export const commentStreamRoomStateUpdatedSchema = z.object({
  eventId: eventIdSchema,
  roomState: roomStateSchema
});

export const commentStreamCommentDeletedSchema = z.object({
  eventId: eventIdSchema,
  commentId: commentIdSchema
});

export const commentStreamSyncRequiredSchema = z.object({
  eventId: eventIdSchema,
  lastEventId: z.string().min(1).max(256)
});

export const publicEventResponseSchema = z.object({
  event: eventSchema,
  roomState: roomStateSchema
});

export const postCommentRequestSchema = z.object({
  commentText: z.string().min(1).max(COMMENT_MAX_LENGTH),
  turnstileToken: z.string().min(1),
  clientRequestId: z.string().min(1).max(128)
});

export const postCommentResponseSchema = z.object({
  commentId: commentIdSchema,
  serverReceivedAt: isoTimestampSchema,
  displayStatus: displayStatusSchema,
  moderationStatus: moderationStatusSchema,
  deliveryStatus: z.enum(["broadcasted", "delayed"])
});

export const adminSetModeRequestSchema = z.object({
  mode: roomModeSchema,
  slowModeIntervalSec: z.number().int().min(0).max(3600).optional()
});

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional()
});

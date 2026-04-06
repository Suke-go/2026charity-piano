import { z } from "zod";
import {
  adminSetModeRequestSchema,
  apiErrorSchema,
  commentStreamCommentCreatedSchema,
  commentStreamCommentDeletedSchema,
  commentStreamRoomStateUpdatedSchema,
  commentStreamSyncRequiredSchema,
  commentSchema,
  eventSchema,
  postCommentRequestSchema,
  postCommentResponseSchema,
  publicEventResponseSchema,
  roomStateSchema
} from "./schemas";

export const apiSchemas = {
  event: eventSchema,
  roomState: roomStateSchema,
  comment: commentSchema,
  publicEventResponse: publicEventResponseSchema,
  postCommentRequest: postCommentRequestSchema,
  postCommentResponse: postCommentResponseSchema,
  adminSetModeRequest: adminSetModeRequestSchema,
  commentStreamCommentCreated: commentStreamCommentCreatedSchema,
  commentStreamRoomStateUpdated: commentStreamRoomStateUpdatedSchema,
  commentStreamCommentDeleted: commentStreamCommentDeletedSchema,
  commentStreamSyncRequired: commentStreamSyncRequiredSchema,
  apiError: apiErrorSchema
} satisfies Record<string, z.ZodTypeAny>;

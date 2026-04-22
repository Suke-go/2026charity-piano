import type { DisplayStatus, ModerationStatus, RoomMode } from "./constants";

export interface EventDto {
  eventId: string;
  title: string;
  streamPlaybackUid: string | null;
  status: string;
}

export interface CommentDto {
  commentId: string;
  eventId: string;
  userSessionId: string;
  commentText: string;
  serverReceivedAt: string;
  displayStatus: DisplayStatus;
  moderationStatus: ModerationStatus;
  deletedFlag: boolean;
  moderationReason: string | null;
}

export interface RoomStateDto {
  mode: RoomMode;
  slowModeIntervalSec: number;
  updatedAt: string;
}

export interface PublicEventResponse {
  event: EventDto;
  roomState: RoomStateDto;
}

export interface PostCommentRequest {
  commentText: string;
  turnstileToken?: string;
  clientRequestId: string;
}

export interface PostCommentResponse {
  commentId: string;
  serverReceivedAt: string;
  displayStatus: DisplayStatus;
  moderationStatus: ModerationStatus;
  deliveryStatus: "broadcasted" | "delayed";
}

export interface AdminSetModeRequest {
  mode: RoomMode;
  slowModeIntervalSec?: number;
}

export interface CommentStreamCommentCreated {
  eventId: string;
  comment: CommentDto;
}

export interface CommentStreamRoomStateUpdated {
  eventId: string;
  roomState: RoomStateDto;
}

export interface CommentStreamCommentDeleted {
  eventId: string;
  commentId: string;
}

export interface CommentStreamSyncRequired {
  eventId: string;
  lastEventId: string;
}

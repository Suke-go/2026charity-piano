import type { CommentDto, DisplayStatus, ModerationStatus } from "@charity/shared";
import { createId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { rankVisibleComment } from "../services/moderation";

interface CommentRow {
  comment_id: string;
  event_id: string;
  user_session_id: string;
  comment_text: string;
  server_received_at: string;
  display_status: DisplayStatus;
  moderation_status: ModerationStatus;
  deleted_flag: number;
  moderation_reason: string | null;
}

export async function listComments(
  db: D1Database,
  eventId: string,
  limit: number,
  cursor?: string | null,
  includeDeleted = false
): Promise<CommentDto[]> {
  const clauses = ["event_id = ?"];
  const binds: unknown[] = [eventId];
  if (!includeDeleted) {
    clauses.push("deleted_flag = 0");
    clauses.push("display_status = 'VISIBLE'");
  }
  if (cursor) {
    clauses.push("server_received_at > ?");
    binds.push(cursor);
  }

  const query = await db
    .prepare(
      `SELECT comment_id, event_id, user_session_id, comment_text, server_received_at, display_status, moderation_status, deleted_flag, moderation_reason
       FROM comments
       WHERE ${clauses.join(" AND ")}
       ORDER BY server_received_at ASC
       LIMIT ?`
    )
    .bind(...binds, limit)
    .all<CommentRow>();

  return (query.results ?? []).map(mapCommentRow);
}

export async function listAllComments(
  db: D1Database,
  eventId: string,
  includeDeleted = false
): Promise<CommentDto[]> {
  const clauses = ["event_id = ?"];
  const binds: unknown[] = [eventId];
  if (!includeDeleted) {
    clauses.push("deleted_flag = 0");
    clauses.push("display_status = 'VISIBLE'");
  }

  const query = await db
    .prepare(
      `SELECT comment_id, event_id, user_session_id, comment_text, server_received_at, display_status, moderation_status, deleted_flag, moderation_reason
       FROM comments
       WHERE ${clauses.join(" AND ")}
       ORDER BY server_received_at ASC`
    )
    .bind(...binds)
    .all<CommentRow>();

  return (query.results ?? []).map(mapCommentRow);
}

export async function getCommentById(db: D1Database, commentId: string) {
  const row = await db
    .prepare(
      `SELECT comment_id, event_id, user_session_id, comment_text, server_received_at, display_status, moderation_status, deleted_flag, moderation_reason
       FROM comments
       WHERE comment_id = ?`
    )
    .bind(commentId)
    .first<CommentRow>();
  return row ? mapCommentRow(row) : null;
}

export async function findCommentByDedupKey(
  db: D1Database,
  eventId: string,
  userSessionId: string,
  clientRequestId: string
) {
  const row = await db
    .prepare(
      `SELECT comment_id
       FROM comment_request_dedup
       WHERE event_id = ? AND user_session_id = ? AND client_request_id = ?`
    )
    .bind(eventId, userSessionId, clientRequestId)
    .first<{ comment_id: string }>();
  return row?.comment_id ?? null;
}

export async function insertComment(
  db: D1Database,
  comment: CommentDto,
  clientRequestId: string
) {
  const createdAt = nowIso();
  const commentId = comment.commentId ?? createId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO comments (comment_id, event_id, user_session_id, comment_text, server_received_at, display_status, moderation_status, deleted_flag, moderation_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        commentId,
        comment.eventId,
        comment.userSessionId,
        comment.commentText,
        comment.serverReceivedAt,
        comment.displayStatus,
        comment.moderationStatus,
        comment.deletedFlag ? 1 : 0,
        comment.moderationReason ?? null
      ),
    db
      .prepare(
        `INSERT INTO comment_request_dedup (dedup_id, event_id, user_session_id, client_request_id, comment_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(createId(), comment.eventId, comment.userSessionId, clientRequestId, commentId, createdAt)
  ]);
  return commentId;
}

export async function softDeleteComment(db: D1Database, commentId: string) {
  await db
    .prepare(
      `UPDATE comments
       SET deleted_flag = 1,
           display_status = 'HIDDEN'
       WHERE comment_id = ?`
    )
    .bind(commentId)
    .run();
}

function mapCommentRow(row: CommentRow): CommentDto {
  const renderDecision = row.display_status === "VISIBLE"
    ? rankVisibleComment(row.comment_text)
    : {
        renderPriority: "LOW" as const,
        renderPolicy: "ADMIN_ONLY" as const,
        displayModeHint: "COMPACT" as const
      };

  return {
    commentId: row.comment_id,
    eventId: row.event_id,
    userSessionId: row.user_session_id,
    commentText: row.comment_text,
    serverReceivedAt: row.server_received_at,
    displayStatus: row.display_status,
    moderationStatus: row.moderation_status,
    deletedFlag: Boolean(row.deleted_flag),
    moderationReason: row.moderation_reason,
    ...renderDecision
  };
}

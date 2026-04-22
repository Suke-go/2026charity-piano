import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import type { CommentDto, PublicCommentDto } from "@charity/shared";
import { apiSchemas } from "@charity/shared";
import { ensureEvent } from "../../db/events";
import {
  findCommentByDedupKey,
  getCommentById,
  insertComment,
  listComments
} from "../../db/comments";
import { decideCommentPolicy } from "../../services/moderation";
import { verifyTurnstileToken } from "../../services/turnstile";
import { ensureSessionId } from "../../services/session";
import { createId } from "../../lib/ids";
import { nowIso } from "../../lib/time";
import { jsonCreated, jsonError, jsonOk } from "../../lib/http";
import {
  canPostInRoom,
  broadcastCommentCreated,
  getRoomStateFromRoom,
  markPostedInRoom
} from "../room-client";
import { writeAuditLog } from "../../services/audit";

export function registerPublicCommentRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/events/:eventId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const cursor = c.req.query("cursor") ?? c.req.query("since") ?? null;
    const comments = await listComments(c.env.DB, eventId, limit, cursor, false);
    return jsonOk(c, { comments: comments.map(toPublicComment) });
  });

  app.post("/api/events/:eventId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > 4096) {
      return jsonError(c, 413, "payload_too_large", "Request body too large", c.get("requestId"));
    }
    const body = apiSchemas.postCommentRequest.parse(await c.req.json());

    const turnstileRequired = c.env.PUBLIC_COMMENT_TURNSTILE_REQUIRED === "true";
    if (turnstileRequired) {
      if (!body.turnstileToken) {
        return jsonError(
          c,
          400,
          "turnstile_required",
          "Turnstile token is required by the current comment policy",
          c.get("requestId")
        );
      }

      const verification = await verifyTurnstileToken(c.env, body.turnstileToken);
      if (!verification.success) {
        const isUnavailable = verification.errorCodes.includes("turnstile_unavailable");
        return jsonError(
          c,
          isUnavailable ? 503 : 400,
          isUnavailable ? "turnstile_unavailable" : "turnstile_failed",
          isUnavailable ? "Turnstile verification is unavailable" : "Turnstile verification failed",
          c.get("requestId")
        );
      }
    }

    const session = ensureSessionId(c.req.header("Cookie"));
    const roomCheck = await canPostInRoom(c.env, eventId, session.sessionId);
    if (!roomCheck.allowed) {
      const reason = roomCheck.reason ?? "comment_unavailable";
      return jsonError(
        c,
        reason === "slow_mode_active" ? 429 : 403,
        reason,
        reason === "room_closed" ? "Comment posting is closed" : "Comment posting is temporarily unavailable",
        c.get("requestId")
      );
    }
    const policy = decideCommentPolicy(body.commentText, parseBlockedWords(c.env.BLOCKED_COMMENT_WORDS), {
      msSinceLastPost: roomCheck.msSinceLastPost
    });

    const existingCommentId = await findCommentByDedupKey(
      c.env.DB,
      eventId,
      session.sessionId,
      body.clientRequestId
    );
    if (existingCommentId) {
      const existingComment = await getCommentById(c.env.DB, existingCommentId);
      if (!existingComment) {
        return jsonError(c, 500, "dedup_inconsistent", "Comment exists but could not be loaded");
      }
      if (session.setCookie) c.header("Set-Cookie", session.setCookie);
      return jsonCreated(c, {
        commentId: existingComment.commentId,
        serverReceivedAt: existingComment.serverReceivedAt,
        displayStatus: existingComment.displayStatus,
        moderationStatus: existingComment.moderationStatus,
        deliveryStatus: deliveryStatusForStoredComment(existingComment)
      });
    }

    const commentId = createId();
    const serverReceivedAt = nowIso();
    try {
      await insertComment(
        c.env.DB,
        {
          commentId,
          eventId,
          userSessionId: session.sessionId,
          commentText: body.commentText,
          serverReceivedAt,
          displayStatus: policy.displayStatus,
          moderationStatus: policy.moderationStatus,
          deletedFlag: false,
          moderationReason: policy.moderationReason,
          renderPriority: policy.renderPriority,
          renderPolicy: policy.renderPolicy,
          displayModeHint: policy.displayModeHint
        },
        body.clientRequestId
      );
    } catch {
      const dedupCommentId = await findCommentByDedupKey(
        c.env.DB,
        eventId,
        session.sessionId,
        body.clientRequestId
      );
      if (!dedupCommentId) {
        return jsonError(c, 500, "comment_persist_failed", "Failed to save comment");
      }
      const dedupComment = await getCommentById(c.env.DB, dedupCommentId);
      if (!dedupComment) {
        return jsonError(c, 500, "comment_persist_failed", "Failed to save comment");
      }
      if (session.setCookie) c.header("Set-Cookie", session.setCookie);
      return jsonCreated(c, {
        commentId: dedupComment.commentId,
        serverReceivedAt: dedupComment.serverReceivedAt,
        displayStatus: dedupComment.displayStatus,
        moderationStatus: dedupComment.moderationStatus,
        deliveryStatus: deliveryStatusForStoredComment(dedupComment)
      });
    }

    await markPostedInRoom(c.env, eventId, session.sessionId, serverReceivedAt);

    await writeAuditLog(c.env.DB, c.env, {
      eventId,
      actionType: "comment_created",
      targetId: commentId,
      actorId: session.sessionId,
      payload: {
        moderationStatus: policy.moderationStatus,
        displayStatus: policy.displayStatus,
        renderPriority: policy.renderPriority,
        renderPolicy: policy.renderPolicy
      }
    });

    const deliveryStatus = policy.displayStatus === "VISIBLE" && policy.renderPolicy !== "ADMIN_ONLY"
      ? (await broadcastCommentCreated(c.env, eventId, {
          commentId,
          eventId,
          commentText: body.commentText,
          serverReceivedAt,
          renderPriority: policy.renderPriority,
          renderPolicy: policy.renderPolicy,
          displayModeHint: policy.displayModeHint
        }))
        ? "broadcasted"
        : "delayed"
      : "filtered";

    if (session.setCookie) c.header("Set-Cookie", session.setCookie);
    return jsonCreated(c, {
      commentId,
      serverReceivedAt,
      displayStatus: policy.displayStatus,
      moderationStatus: policy.moderationStatus,
      deliveryStatus
    });
  });

  app.get("/api/events/:eventId/room-state", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const roomState = await getRoomStateFromRoom(c.env, eventId);
    return jsonOk(c, { roomState });
  });
}

function parseBlockedWords(value?: string) {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function deliveryStatusForStoredComment(comment: {
  displayStatus: string;
  renderPolicy: string;
}) {
  return comment.displayStatus === "VISIBLE" && comment.renderPolicy !== "ADMIN_ONLY"
    ? "broadcasted" as const
    : "filtered" as const;
}

function toPublicComment(comment: CommentDto): PublicCommentDto {
  return {
    commentId: comment.commentId,
    eventId: comment.eventId,
    commentText: comment.commentText,
    serverReceivedAt: comment.serverReceivedAt,
    renderPriority: comment.renderPriority,
    renderPolicy: comment.renderPolicy,
    displayModeHint: comment.displayModeHint
  };
}

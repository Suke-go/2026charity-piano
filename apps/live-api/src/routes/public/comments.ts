import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { apiSchemas } from "@charity/shared";
import { ensureEvent } from "../../db/events";
import {
  findCommentByDedupKey,
  getCommentById,
  insertComment,
  listComments
} from "../../db/comments";
import { evaluateComment } from "../../services/moderation";
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
    return jsonOk(c, { comments });
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

    const session = ensureSessionId(c.req.header("Cookie"));
    const moderation = evaluateComment(body.commentText, parseBlockedWords(c.env.BLOCKED_COMMENT_WORDS));
    const roomCheck = await canPostInRoom(c.env, eventId, session.sessionId);
    if (!roomCheck.allowed) {
      return jsonError(
        c,
        429,
        "room_closed",
        roomCheck.reason ?? "Comment posting is temporarily unavailable",
        c.get("requestId")
      );
    }

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
        deliveryStatus: "broadcasted" as const
      });
    }

    const commentId = createId();
    const serverReceivedAt = nowIso();
    const displayStatus = moderation.status === "BLOCKED" ? "HIDDEN" : "VISIBLE";
    const moderationStatus = moderation.status;
    const moderationReason = moderation.reason;

    try {
      await insertComment(
        c.env.DB,
        {
          commentId,
          eventId,
          userSessionId: session.sessionId,
          commentText: body.commentText,
          serverReceivedAt,
          displayStatus,
          moderationStatus,
          deletedFlag: false,
          moderationReason
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
        deliveryStatus: "broadcasted" as const
      });
    }

    await markPostedInRoom(c.env, eventId, session.sessionId, serverReceivedAt);

    await writeAuditLog(c.env.DB, c.env, {
      eventId,
      actionType: "comment_created",
      targetId: commentId,
      actorId: session.sessionId,
      payload: { moderationStatus, displayStatus }
    });

    const deliveryStatus = (await broadcastCommentCreated(c.env, eventId, {
      commentId,
      eventId,
      userSessionId: session.sessionId,
      commentText: body.commentText,
      serverReceivedAt,
      displayStatus,
      moderationStatus,
      deletedFlag: false,
      moderationReason
    }))
      ? "broadcasted"
      : "delayed";

    if (session.setCookie) c.header("Set-Cookie", session.setCookie);
    return jsonCreated(c, {
      commentId,
      serverReceivedAt,
      displayStatus,
      moderationStatus,
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

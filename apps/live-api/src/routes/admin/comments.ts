import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { ensureEvent } from "../../db/events";
import { getCommentById, listComments, softDeleteComment } from "../../db/comments";
import { writeAuditLog } from "../../services/audit";
import { broadcastCommentDeleted } from "../room-client";
import { jsonOk, jsonError } from "../../lib/http";

export function registerAdminCommentRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/admin/events/:eventId/comments", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const limit = Math.min(Number(c.req.query("limit") ?? 100), 100);
    const cursor = c.req.query("cursor") ?? null;
    const comments = await listComments(c.env.DB, eventId, limit, cursor, true);
    return jsonOk(c, { comments });
  });

  app.post("/api/admin/comments/:commentId/delete", async (c) => {
    const commentId = c.req.param("commentId");
    const adminUser = c.get("adminUser");
    if (!adminUser) {
      return jsonError(c, 401, "unauthorized", "Admin authentication required", c.get("requestId"));
    }
    const comment = await getCommentById(c.env.DB, commentId);
    if (!comment) {
      return jsonError(c, 404, "comment_not_found", "Comment not found", c.get("requestId"));
    }
    await softDeleteComment(c.env.DB, commentId);
    await writeAuditLog(c.env.DB, c.env, {
      eventId: comment.eventId,
      actionType: "comment_deleted",
      targetId: commentId,
      actorId: adminUser.email,
      payload: { deleted: true }
    });
    await broadcastCommentDeleted(c.env, comment.eventId, commentId);
    return jsonOk(c, { ok: true });
  });
}

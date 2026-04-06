import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { createExportEnvelope, createExportFilename } from "@charity/export-core";
import { apiSchemas } from "@charity/shared";
import { ensureEvent } from "../../db/events";
import { listAllComments } from "../../db/comments";
import { getRoomStateFromRoom, updateRoomMode } from "../room-client";
import { writeAuditLog } from "../../services/audit";
import { jsonOk, jsonError } from "../../lib/http";
import { nowIso } from "../../lib/time";

export function registerAdminEventRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/admin/events/:eventId/state", async (c) => {
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

  app.post("/api/admin/events/:eventId/mode", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const body = apiSchemas.adminSetModeRequest.parse(await c.req.json());
    const adminUser = c.get("adminUser");
    if (!adminUser) {
      return jsonError(c, 401, "unauthorized", "Admin authentication required", c.get("requestId"));
    }
    const roomState = await updateRoomMode(c.env, eventId, body);
    await writeAuditLog(c.env.DB, c.env, {
      eventId,
      actionType: "room_mode_updated",
      actorId: adminUser.email,
      payload: body
    });
    return jsonOk(c, { roomState });
  });

  app.get("/api/admin/events/:eventId/export", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }

    const adminUser = c.get("adminUser");
    if (!adminUser) {
      return jsonError(c, 401, "unauthorized", "Admin authentication required", c.get("requestId"));
    }

    const includeDeleted = c.req.query("includeDeleted") === "true";
    const roomState = await getRoomStateFromRoom(c.env, eventId);
    const comments = await listAllComments(c.env.DB, eventId, includeDeleted);
    const exportedAt = nowIso();
    const payload = createExportEnvelope({
      exportedAt,
      eventId,
      exportKind: "youtube-comments",
      source: "youtube-comment-api",
      meta: {
        includeDeleted,
        roomState,
        event
      },
      records: comments
    });

    await writeAuditLog(c.env.DB, c.env, {
      eventId,
      actionType: "comments_exported",
      actorId: adminUser.email,
      payload: { includeDeleted, commentCount: comments.length, exportedAt }
    });

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"${createExportFilename({
          eventId,
          exportKind: "youtube-comments",
          exportedAt
        })}\"`
      }
    });
  });
}

import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { ensureEvent } from "../../db/events";
import { jsonError } from "../../lib/http";
import { getRoomStub } from "../room-client";

export function registerPublicStreamRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/events/:eventId/live-updates", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    return getRoomStub(c.env, eventId).fetch(buildRoomStreamRequest(c.req.raw, eventId));
  });

  app.get("/api/events/:eventId/stream", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    return getRoomStub(c.env, eventId).fetch(buildRoomStreamRequest(c.req.raw, eventId));
  });
}

function buildRoomStreamRequest(rawRequest: Request, eventId: string) {
  const url = new URL(rawRequest.url);
  url.pathname = "/stream";
  url.searchParams.set("eventId", eventId);
  return new Request(url.toString(), rawRequest);
}

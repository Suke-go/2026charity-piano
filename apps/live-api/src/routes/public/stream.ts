import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { ensureEvent } from "../../db/events";
import { jsonError } from "../../lib/http";
import { getRoomStub } from "../room-client";

export function registerPublicStreamRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/events/:eventId/live-feed", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const url = new URL(c.req.raw.url);
    url.searchParams.set("eventId", eventId);
    const request = new Request(url.toString(), c.req.raw);
    return getRoomStub(c.env, eventId).fetch(request);
  });

  app.get("/api/events/:eventId/stream", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const url = new URL(c.req.raw.url);
    url.searchParams.set("eventId", eventId);
    const request = new Request(url.toString(), c.req.raw);
    return getRoomStub(c.env, eventId).fetch(request);
  });
}

import type { Hono } from "hono";
import type { AppVariables, Env } from "../../env";
import { ensureEvent } from "../../db/events";
import { getRoomStateFromRoom } from "../room-client";
import { jsonError, jsonOk } from "../../lib/http";

export function registerPublicEventRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>) {
  app.get("/api/events/:eventId", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await ensureEvent(c.env.DB, eventId, {
      allowCreate: c.env.ALLOW_LOCAL_DEV_BYPASS === "true"
    });
    if (!event) {
      return jsonError(c, 404, "event_not_found", "Event not found", c.get("requestId"));
    }
    const roomState = await getRoomStateFromRoom(c.env, eventId);
    return jsonOk(c, { event, roomState });
  });
}

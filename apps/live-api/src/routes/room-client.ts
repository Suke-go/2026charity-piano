import { apiSchemas, type PublicCommentDto, type RoomMode, type RoomStateDto } from "@charity/shared";
import type { Env } from "../env";

async function fetchRoomJson<T>(responsePromise: Promise<Response>, label: string): Promise<T> {
  const response = await responsePromise;
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`room_${label}_failed:${response.status}:${bodyText || "no_body"}`);
  }
  return (await response.json()) as T;
}

export function getRoomStub(env: Env, eventId: string) {
  const id = env.COMMENT_ROOMS.idFromName(eventId);
  return env.COMMENT_ROOMS.get(id);
}

export async function getRoomStateFromRoom(env: Env, eventId: string): Promise<RoomStateDto> {
  const url = new URL("https://room/state");
  url.searchParams.set("eventId", eventId);
  const payload = await fetchRoomJson<unknown>(getRoomStub(env, eventId).fetch(url.toString()), "state");
  return apiSchemas.roomState.parse(payload);
}

export async function canPostInRoom(env: Env, eventId: string, sessionId: string) {
  const url = new URL("https://room/can-post");
  url.searchParams.set("eventId", eventId);
  return fetchRoomJson<{ allowed?: boolean; reason?: string | null; msSinceLastPost?: number | null }>(
    getRoomStub(env, eventId).fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId })
    }),
    "can_post"
  );
}

export async function markPostedInRoom(
  env: Env,
  eventId: string,
  sessionId: string,
  serverReceivedAt: string
) {
  const url = new URL("https://room/mark-posted");
  url.searchParams.set("eventId", eventId);
  const response = await getRoomStub(env, eventId).fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, serverReceivedAt })
  });
  return response.ok;
}

export async function updateRoomMode(
  env: Env,
  eventId: string,
  body: { mode: RoomMode; slowModeIntervalSec?: number }
) {
  const url = new URL("https://room/mode");
  url.searchParams.set("eventId", eventId);
  const payload = await fetchRoomJson<unknown>(
    getRoomStub(env, eventId).fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    "mode"
  );
  return apiSchemas.roomState.parse(payload);
}

export async function broadcastCommentCreated(env: Env, eventId: string, comment: PublicCommentDto) {
  const url = new URL("https://room/broadcast");
  url.searchParams.set("eventId", eventId);
  const response = await getRoomStub(env, eventId).fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "comment_created",
      payload: { eventId, comment }
    })
  });
  return response.ok;
}

export async function broadcastCommentDeleted(env: Env, eventId: string, commentId: string) {
  const url = new URL("https://room/broadcast");
  url.searchParams.set("eventId", eventId);
  const response = await getRoomStub(env, eventId).fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "comment_deleted",
      payload: { eventId, commentId }
    })
  });
  return response.ok;
}

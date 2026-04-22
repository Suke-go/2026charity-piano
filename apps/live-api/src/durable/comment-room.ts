import { SSE_EVENT_TYPES, type CommentDto, type RoomMode, type RoomStateDto } from "@charity/shared";
import { loadRoomState, saveRoomState } from "../db/room-state";
import { nowIso } from "../lib/time";
import { createSseEventId, encodeSseEvent } from "../services/sse";

type StreamEvent =
  | { type: "comment_created"; payload: { eventId: string; comment: CommentDto } }
  | { type: "comment_deleted"; payload: { eventId: string; commentId: string } }
  | { type: "room_state_updated"; payload: { eventId: string; roomState: RoomStateDto } }
  | { type: "sync_required"; payload: { eventId: string; lastEventId: string } };

export class CommentRoom {
  private connectedClients = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private lastPostedAtBySession = new Map<string, number>();
  private ready: Promise<void>;
  private encoder = new TextEncoder();

  constructor(private state: DurableObjectState) {
    this.ready = this.restore();
  }

  async fetch(request: Request) {
    await this.ready;
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId") ?? this.state.id.toString();

    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      return Response.json(await loadRoomState(this.state.storage));
    }

    if (request.method === "POST" && url.pathname.endsWith("/can-post")) {
      const body = (await request.json()) as { sessionId: string };
      return Response.json(await this.canPost(eventId, body.sessionId));
    }

    if (request.method === "POST" && url.pathname.endsWith("/mark-posted")) {
      const body = (await request.json()) as { sessionId: string; serverReceivedAt: string };
      this.markPosted(body.sessionId, body.serverReceivedAt);
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && url.pathname.endsWith("/mode")) {
      const body = (await request.json()) as { mode: RoomMode; slowModeIntervalSec?: number };
      const interval = Math.max(0, Math.min(3600, Math.floor(body.slowModeIntervalSec ?? 0)));
      const roomState = await this.setMode(eventId, body.mode, interval);
      return Response.json(roomState);
    }

    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const body = (await request.json()) as StreamEvent;
      await this.broadcast(body);
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET" && url.pathname.endsWith("/stream")) {
      return this.handleStream(eventId, request);
    }

    return new Response("Not found", { status: 404 });
  }

  private async restore() {
    await loadRoomState(this.state.storage);
  }

  private async canPost(eventId: string, sessionId: string) {
    const state = await loadRoomState(this.state.storage);
    if (state.mode === "CLOSED") {
      return { allowed: false, reason: "room_closed" };
    }
    if (state.mode === "SLOW") {
      const intervalMs = Math.max(1, state.slowModeIntervalSec) * 1000;
      const lastPostedAt = this.lastPostedAtBySession.get(sessionId) ?? 0;
      const now = Date.now();
      if (now - lastPostedAt < intervalMs) {
        return { allowed: false, reason: "slow_mode_active" };
      }
    }
    return { allowed: true, reason: null, roomState: { ...state, updatedAt: state.updatedAt } };
  }

  private markPosted(sessionId: string, serverReceivedAt: string) {
    const postedAt = Number.parseInt(serverReceivedAt ? Date.parse(serverReceivedAt).toString() : "", 10);
    this.lastPostedAtBySession.set(sessionId, Number.isNaN(postedAt) ? Date.now() : postedAt);
  }

  private async setMode(eventId: string, mode: RoomMode, slowModeIntervalSec: number) {
    const roomState = await saveRoomState(this.state.storage, { mode, slowModeIntervalSec });
    await this.broadcast({
      type: SSE_EVENT_TYPES.ROOM_STATE_UPDATED,
      payload: { eventId, roomState }
    });
    return roomState;
  }

  private async broadcast(event: StreamEvent) {
    const payload = encodeSseEvent(this.encoder, {
      id: this.eventIdFor(event),
      type: event.type,
      data: event.payload
    });
    const stale: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const writer of this.connectedClients) {
      try {
        await writer.write(payload);
      } catch {
        stale.push(writer);
      }
    }
    for (const writer of stale) {
      this.connectedClients.delete(writer);
      try {
        await writer.close();
      } catch {
        // ignore
      }
    }
  }

  private async handleStream(eventId: string, request: Request) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.connectedClients.add(writer);
    const lastEventId = request.headers.get("Last-Event-ID");
    let closed = false;
    const closeStream = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.connectedClients.delete(writer);
      void writer.close().catch(() => undefined);
    };

    const heartbeat = setInterval(() => {
      void writer.write(this.encoder.encode(`: ping ${nowIso()}\n\n`)).catch(() => {
        closeStream();
      });
    }, 15000);

    request.signal.addEventListener("abort", closeStream, { once: true });

    void this.initializeStream(writer, eventId, lastEventId, closeStream);

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform"
      }
    });
  }

  private async initializeStream(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    eventId: string,
    lastEventId: string | null,
    closeStream: () => void
  ) {
    try {
      const roomState = await loadRoomState(this.state.storage);
      if (lastEventId) {
        await writer.write(
          encodeSseEvent(this.encoder, {
            id: `sync:${lastEventId}`,
            type: "sync_required",
            data: { eventId, lastEventId }
          })
        );
      }
      await writer.write(
        encodeSseEvent(this.encoder, {
          id: createSseEventId(SSE_EVENT_TYPES.ROOM_STATE_UPDATED, roomState.updatedAt),
          type: SSE_EVENT_TYPES.ROOM_STATE_UPDATED,
          data: { eventId, roomState }
        })
      );
    } catch {
      closeStream();
    }
  }

  private eventIdFor(event: StreamEvent) {
    switch (event.type) {
      case "comment_created":
        return createSseEventId(
          event.type,
          event.payload.comment.serverReceivedAt,
          event.payload.comment.commentId
        );
      case "comment_deleted":
        return createSseEventId(event.type, nowIso(), event.payload.commentId);
      case "room_state_updated":
        return createSseEventId(event.type, event.payload.roomState.updatedAt);
      case "sync_required":
        return `sync:${event.payload.lastEventId}`;
    }
  }
}

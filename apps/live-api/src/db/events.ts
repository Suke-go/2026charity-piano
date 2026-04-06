import { nowIso } from "../lib/time";
import type { EventDto } from "@charity/shared";

export async function getEvent(db: D1Database, eventId: string): Promise<EventDto | null> {
  const row = await db
    .prepare(
      `SELECT event_id, title, stream_playback_uid, status
       FROM events
       WHERE event_id = ?`
    )
    .bind(eventId)
    .first<{
      event_id: string;
      title: string;
      stream_playback_uid: string | null;
      status: string;
    }>();

  if (!row) return null;
  return {
    eventId: row.event_id,
    title: row.title,
    streamPlaybackUid: row.stream_playback_uid,
    status: row.status
  };
}

export async function ensureEvent(
  db: D1Database,
  eventId: string,
  options?: { allowCreate?: boolean; title?: string }
): Promise<EventDto | null> {
  const existing = await getEvent(db, eventId);
  if (existing) return existing;
  if (!options?.allowCreate) return null;

  const createdAt = nowIso();
  const title = options.title?.trim() || humanizeEventId(eventId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO events (event_id, title, stream_live_input_uid, stream_playback_uid, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(eventId, title, null, null, "ACTIVE", createdAt, createdAt)
    .run();

  return getEvent(db, eventId);
}

function humanizeEventId(eventId: string) {
  const words = eventId
    .split(/[-_]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.length > 0 ? words.join(" ") : "Local Feedback";
}

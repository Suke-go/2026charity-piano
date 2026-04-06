import { createId } from "../lib/ids";
import { nowIso } from "../lib/time";

export async function insertAuditLog(
  db: D1Database,
  entry: {
    eventId: string;
    actionType: string;
    targetId?: string | null;
    actorId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const createdAt = nowIso();
  const logId = createId();
  await db
    .prepare(
      `INSERT INTO admin_audit_logs (log_id, event_id, action_type, target_id, actor_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      logId,
      entry.eventId,
      entry.actionType,
      entry.targetId ?? null,
      entry.actorId ?? null,
      entry.payload ? JSON.stringify(entry.payload) : null,
      createdAt
    )
    .run();

  return { logId, createdAt };
}

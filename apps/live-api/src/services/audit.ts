import { insertAuditLog } from "../db/audit-logs";

export async function writeAuditLog(
  db: D1Database,
  env: { AUDIT_QUEUE?: Queue<unknown>; R2_BUCKET?: R2Bucket },
  entry: {
    eventId: string;
    actionType: string;
    targetId?: string | null;
    actorId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const { logId, createdAt } = await insertAuditLog(db, entry);

  const payload = { logId, createdAt, ...entry };
  try {
    await env.AUDIT_QUEUE?.send(payload);
  } catch {
    if (env.R2_BUCKET) {
      await env.R2_BUCKET.put(
        `audit/${entry.eventId}/${createdAt}-${logId}.json`,
        JSON.stringify(payload, null, 2)
      );
    }
  }

  return { logId, createdAt };
}

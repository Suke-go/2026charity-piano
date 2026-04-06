export function logError(message: string, fields: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", message, ...fields }));
}

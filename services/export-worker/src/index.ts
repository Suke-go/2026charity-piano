import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceBaseUrl = process.env.EXPORT_SOURCE_URL ?? "http://127.0.0.1:8787";
const eventId = process.env.EXPORT_EVENT_ID ?? "local-feedback";
const outputRoot = process.env.EXPORT_OUTPUT_DIR ?? path.join(process.cwd(), "var", "exports");
const includeDeleted = process.env.EXPORT_INCLUDE_DELETED !== "false";
const devAccessToken = process.env.EXPORT_ACCESS_TOKEN ?? "dev-admin";

async function main() {
  const exportUrl = `${sourceBaseUrl}/api/admin/events/${eventId}/export?includeDeleted=${includeDeleted ? "true" : "false"}`;
  const response = await fetch(exportUrl, {
    headers: {
      "X-Dev-Access-Token": devAccessToken
    }
  });

  if (!response.ok) {
    throw new Error(`export_failed:${response.status}:${await response.text()}`);
  }

  const payload = await response.text();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(outputRoot, eventId, timestamp);
  const outputPath = path.join(directory, "submissions.json");

  await mkdir(directory, { recursive: true });
  await writeFile(outputPath, payload, "utf8");

  console.log(JSON.stringify({ ok: true, eventId, outputPath }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { createExportEnvelope, createExportFilename } from "@charity/export-core";
import {
  getExperimentConfigPath,
  getPromptCatalog,
  getSubmissionPolicy,
  resolvePromptTemplate
} from "./config.js";
import {
  createPrompt,
  createSubmission,
  ensureEvent,
  getAdminBootstrap,
  getDatabasePath,
  getPublicBootstrap,
  hideSubmission,
  listPublicFeed,
  listSubmissions,
  promptExists,
  setCollectionMode,
  setDisplayMode
} from "./db.js";
import type { CollectionMode, DisplayMode } from "./models.js";

interface PostSubmissionBody {
  promptId?: string;
  answerText?: string;
  clientRequestId?: string;
}

interface CreatePromptBody {
  templateKey?: string;
  title?: string;
  description?: string;
}

interface SetCollectionStateBody {
  mode?: CollectionMode;
}

interface SetDisplayModeBody {
  displayMode?: DisplayMode;
}

type ExportScope = "all" | "active_prompt" | "visible_only";
type ExportFormat = "json" | "jsonl" | "csv";

const port = Number(process.env.LOCAL_ANSWER_API_PORT ?? 8789);
const adminToken = process.env.LOCAL_ADMIN_TOKEN ?? "dev-admin";
const sessionCookieName = "local_session_id";
const sseRetryMillis = 3000;
const MAX_BODY_BYTES = 16 * 1024;
const submissionCsvHeaders = [
  "submissionId",
  "eventId",
  "promptId",
  "sessionId",
  "answerText",
  "clientRequestId",
  "createdAt",
  "deletedFlag"
];
const allowedOrigins = (
  process.env.LOCAL_ALLOWED_ORIGINS ??
  "http://127.0.0.1:5174,http://127.0.0.1:5175,http://127.0.0.1:5176,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://live.local,http://admin.local,http://live.home.arpa,http://admin.home.arpa"
).split(",").map((s) => s.trim());

const liveUpdateClients = new Map<string, Map<string, { response: ServerResponse; keepAliveTimer: NodeJS.Timeout }>>();

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    sendRequestError(response, error);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`local-answer-api listening on http://127.0.0.1:${port}`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  setCors(response, request);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const pathname = normalizePath(url.pathname);
  const submissionPolicy = getSubmissionPolicy();
  const maxAnswerLength = Number(process.env.LOCAL_ANSWER_MAX_LENGTH ?? submissionPolicy.maxLength);

  if (request.method === "GET" && pathname === "/healthz") {
    return json(response, 200, {
      ok: true,
      service: "local-answer-api",
      now: new Date().toISOString(),
      dbPath: getDatabasePath()
    });
  }

  if (request.method === "GET" && pathname === "/api/meta/server-info") {
    const lanIp = detectLanIp();
    return json(response, 200, {
      lanIp,
      audienceBaseUrl: lanIp ? `http://${lanIp}:5175` : null,
      adminBaseUrl: lanIp ? `http://${lanIp}:5174` : null
    });
  }

  const publicBootstrapMatch = pathname.match(/^\/api\/events\/([^/]+)\/bootstrap$/);
  if (request.method === "GET" && publicBootstrapMatch?.[1]) {
    return json(response, 200, getPublicBootstrap(publicBootstrapMatch[1]));
  }

  const publicLiveUpdatesMatch = pathname.match(/^\/api\/events\/([^/]+)\/live-updates$/);
  if (request.method === "GET" && publicLiveUpdatesMatch?.[1]) {
    ensureEvent(publicLiveUpdatesMatch[1]);
    return openLiveUpdatesStream(publicLiveUpdatesMatch[1], request, response);
  }

  const publicFeedMatch = pathname.match(/^\/api\/events\/([^/]+)\/feed$/);
  if (request.method === "GET" && publicFeedMatch?.[1]) {
    const eventId = publicFeedMatch[1];
    ensureEvent(eventId);
    const limitParam = Number(url.searchParams.get("limit") ?? "80");
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.floor(limitParam))) : 80;
    return json(response, 200, {
      eventId,
      items: listPublicFeed(eventId, limit),
      generatedAt: new Date().toISOString()
    });
  }

  const publicSubmitMatch = pathname.match(/^\/api\/events\/([^/]+)\/submissions$/);
  if (request.method === "POST" && publicSubmitMatch?.[1]) {
    const eventId = publicSubmitMatch[1];
    const eventState = ensureEvent(eventId);
    if (eventState.collectionState.mode !== "OPEN") {
      return json(response, 409, {
        error: "collection_closed",
        message: "Submission collection is not open"
      });
    }

    const body = await readJson<PostSubmissionBody>(request);
    const answerText = body.answerText?.trim() ?? "";
    const clientRequestId = body.clientRequestId?.trim() ?? "";
    const promptId = body.promptId ?? eventState.activePromptId;

    if (!promptExists(eventId, promptId)) {
      return json(response, 404, { error: "prompt_not_found", message: "Prompt not found" });
    }
    if (!answerText) {
      return json(response, 400, { error: "answer_required", message: "answerText is required" });
    }
    if (answerText.length > maxAnswerLength) {
      return json(response, 400, {
        error: "answer_too_long",
        message: `answerText must be at most ${maxAnswerLength} characters`
      });
    }
    if (containsBlockedTerm(answerText)) {
      return json(response, 400, {
        error: "answer_contains_blocked_term",
        message: "answerText contains a blocked term"
      });
    }
    if (!clientRequestId) {
      return json(response, 400, {
        error: "client_request_id_required",
        message: "clientRequestId is required"
      });
    }

    const sessionId = ensureSessionId(request, response);
    const created = createSubmission({
      eventId,
      promptId,
      sessionId,
      answerText,
      clientRequestId
    });
    return json(response, 201, created);
  }

  const adminBootstrapMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/bootstrap$/);
  if (request.method === "GET" && adminBootstrapMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    return json(response, 200, getAdminBootstrap(adminBootstrapMatch[1]));
  }

  if (request.method === "GET" && pathname === "/api/admin/prompt-catalog") {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    return json(response, 200, {
      configPath: getExperimentConfigPath(),
      promptCatalog: getPromptCatalog(),
      submissionPolicy: {
        maxLength: maxAnswerLength,
        blockedTerms: submissionPolicy.blockedTerms
      }
    });
  }

  const adminSubmissionsMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/submissions$/);
  if (request.method === "GET" && adminSubmissionsMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    return json(response, 200, {
      submissions: listSubmissions(adminSubmissionsMatch[1], {
        includeDeleted: url.searchParams.get("includeDeleted") === "true",
        promptId: url.searchParams.get("promptId")
      })
    });
  }

  const adminStateMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/state$/);
  if (request.method === "POST" && adminStateMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const body = await readJson<SetCollectionStateBody>(request);
    if (!body.mode || !isCollectionMode(body.mode)) {
      return json(response, 400, { error: "invalid_mode", message: "mode must be OPEN, PAUSED, or CLOSED" });
    }
    const collectionState = setCollectionMode(adminStateMatch[1], body.mode);
    publishLiveUpdate(adminStateMatch[1], "bootstrap.updated", getPublicBootstrap(adminStateMatch[1]));
    return json(response, 200, {
      collectionState
    });
  }

  const adminDisplayModeMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/display-mode$/);
  if (request.method === "POST" && adminDisplayModeMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const body = await readJson<SetDisplayModeBody>(request);
    if (!body.displayMode || !isDisplayMode(body.displayMode)) {
      return json(response, 400, {
        error: "invalid_display_mode",
        message: "displayMode must be INPUT or ANSWERS"
      });
    }
    const collectionState = setDisplayMode(adminDisplayModeMatch[1], body.displayMode);
    publishLiveUpdate(adminDisplayModeMatch[1], "bootstrap.updated", getPublicBootstrap(adminDisplayModeMatch[1]));
    return json(response, 200, { collectionState });
  }

  const adminPromptMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/prompt$/);
  if (request.method === "POST" && adminPromptMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const body = await readJson<CreatePromptBody>(request);
    const template = resolvePromptTemplate(body.templateKey);

    if (body.templateKey && !template) {
      return json(response, 404, {
        error: "template_not_found",
        message: "templateKey was not found in the prompt catalog"
      });
    }

    const title = body.title?.trim() || template?.title || "";
    const description = body.description?.trim() || template?.description || "";
    if (!title) {
      return json(response, 400, { error: "title_required", message: "title is required" });
    }
    const createdPrompt = createPrompt(adminPromptMatch[1], {
      title,
      description
    });
    publishLiveUpdate(adminPromptMatch[1], "bootstrap.updated", getPublicBootstrap(adminPromptMatch[1]));
    return json(response, 201, createdPrompt);
  }

  const adminHideMatch = pathname.match(/^\/api\/admin\/submissions\/([^/]+)\/hide$/);
  if (request.method === "POST" && adminHideMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const submissionId = adminHideMatch[1];
    if (!hideSubmission(submissionId)) {
      return json(response, 404, { error: "submission_not_found" });
    }
    return json(response, 200, { ok: true, submissionId });
  }

  const adminExportMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/export$/);
  if (request.method === "GET" && adminExportMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }

    const eventId = adminExportMatch[1];
    const eventState = ensureEvent(eventId);
    const exportedAt = new Date().toISOString();
    const format = getExportFormat(url.searchParams.get("format"));
    const filters = getExportFilters(url, eventId, eventState.activePromptId);
    const payload = createExportEnvelope({
      exportedAt,
      source: "local-answer-api",
      exportKind: "prompt-answers",
      eventId,
      meta: {
        event: eventState.event,
        prompts: eventState.prompts,
        activePromptId: eventState.activePromptId,
        collectionState: eventState.collectionState,
        filters: {
          scope: filters.scope,
          promptId: filters.promptId,
          includeDeleted: filters.includeDeleted,
          format
        }
      },
      records: listSubmissions(eventId, {
        includeDeleted: filters.includeDeleted,
        promptId: filters.promptId
      })
    });

    return sendExportDownload(
      response,
      payload,
      createExportFilename({
        eventId,
        exportKind: "prompt-answers",
        exportedAt,
        extension: format
      }),
      format
    );
  }

  return json(response, 404, { error: "not_found", path: pathname });
}

function openLiveUpdatesStream(eventId: string, request: IncomingMessage, response: ServerResponse) {
  const clientId = randomUUID();

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  response.write(`retry: ${sseRetryMillis}\n\n`);
  writeSseEvent(response, "bootstrap.updated", getPublicBootstrap(eventId));

  const keepAliveTimer = setInterval(() => {
    if (!response.writableEnded) {
      response.write(`: keepalive ${Date.now()}\n\n`);
    }
  }, 15000);

  const clientsForEvent = liveUpdateClients.get(eventId) ?? new Map();
  clientsForEvent.set(clientId, { response, keepAliveTimer });
  liveUpdateClients.set(eventId, clientsForEvent);

  const cleanup = () => removeLiveUpdateClient(eventId, clientId);
  request.on("close", cleanup);
  response.on("close", cleanup);
  response.on("error", cleanup);
}

function removeLiveUpdateClient(eventId: string, clientId: string) {
  const clientsForEvent = liveUpdateClients.get(eventId);
  if (!clientsForEvent) return;
  const client = clientsForEvent.get(clientId);
  if (!client) return;

  clearInterval(client.keepAliveTimer);
  clientsForEvent.delete(clientId);

  if (clientsForEvent.size === 0) {
    liveUpdateClients.delete(eventId);
  }
}

function publishLiveUpdate(eventId: string, type: string, data: unknown) {
  const clientsForEvent = liveUpdateClients.get(eventId);
  if (!clientsForEvent || clientsForEvent.size === 0) {
    return;
  }

  for (const [clientId, client] of clientsForEvent) {
    try {
      writeSseEvent(client.response, type, data);
    } catch {
      removeLiveUpdateClient(eventId, clientId);
    }
  }
}

function writeSseEvent(response: ServerResponse, type: string, data: unknown) {
  response.write(`id: ${createSseEventId(type)}\n`);
  response.write(`event: ${type}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createSseEventId(type: string) {
  return `${type}:${Date.now()}:${randomUUID()}`;
}

function containsBlockedTerm(answerText: string) {
  const lowered = answerText.toLocaleLowerCase();
  return getSubmissionPolicy().blockedTerms.some((term) => lowered.includes(term.toLocaleLowerCase()));
}

function isAuthorizedAdmin(request: IncomingMessage) {
  const token = request.headers["x-dev-access-token"];
  return typeof token === "string" && token === adminToken;
}

function ensureSessionId(request: IncomingMessage, response: ServerResponse) {
  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[sessionCookieName];
  if (existing) {
    return existing;
  }
  const next = randomUUID();
  response.setHeader("Set-Cookie", `${sessionCookieName}=${next}; Path=/; HttpOnly; SameSite=Lax`);
  return next;
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) return {} as Record<string, string>;
  return cookieHeader.split(";").reduce<Record<string, string>>((accumulator, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name || rest.length === 0) {
      return accumulator;
    }
    accumulator[name] = rest.join("=");
    return accumulator;
  }, {});
}

function detectLanIp(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const lowered = name.toLowerCase();
    if (
      lowered.includes("wsl") ||
      lowered.includes("vethernet") ||
      lowered.includes("bluetooth") ||
      lowered.includes("loopback") ||
      lowered.includes("virtual") ||
      lowered.includes("vmware") ||
      lowered.includes("vbox")
    ) {
      continue;
    }
    for (const iface of interfaces[name] ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (
        iface.address.startsWith("192.168.") ||
        iface.address.startsWith("10.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(iface.address)
      ) {
        return iface.address;
      }
    }
  }
  return null;
}

function isCollectionMode(value: string): value is CollectionMode {
  return value === "OPEN" || value === "PAUSED" || value === "CLOSED";
}

function isDisplayMode(value: string): value is DisplayMode {
  return value === "INPUT" || value === "ANSWERS";
}

function normalizePath(pathname: string) {
  return pathname === "/" ? "/healthz" : pathname;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalSize += buf.length;
    if (totalSize > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413, code: "body_too_large" });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as T;
}

function getExportFilters(url: URL, eventId: string, activePromptId: string) {
  const scope = getExportScope(url.searchParams.get("scope"));
  const explicitPromptId = url.searchParams.get("promptId");

  if (explicitPromptId && !promptExists(eventId, explicitPromptId)) {
    throw Object.assign(new Error("promptId was not found"), {
      statusCode: 404,
      code: "prompt_not_found"
    });
  }

  if (explicitPromptId) {
    return {
      scope,
      promptId: explicitPromptId,
      includeDeleted: url.searchParams.get("includeDeleted") === "true"
    };
  }

  if (scope === "active_prompt") {
    return {
      scope,
      promptId: activePromptId,
      includeDeleted: url.searchParams.get("includeDeleted") === "true"
    };
  }

  return {
    scope,
    promptId: null,
    includeDeleted: scope === "visible_only" ? false : url.searchParams.get("includeDeleted") !== "false"
  };
}

function getExportScope(value: string | null): ExportScope {
  if (value === "active_prompt" || value === "visible_only") {
    return value;
  }
  return "all";
}

function getExportFormat(value: string | null): ExportFormat {
  if (value === "jsonl" || value === "csv") {
    return value;
  }
  return "json";
}

function setCors(response: ServerResponse, request?: IncomingMessage) {
  const origin = request?.headers.origin ?? "";
  if (allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
  response.setHeader("Access-Control-Allow-Headers", "content-type,x-dev-access-token");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendExportDownload<TRecord extends object>(
  response: ServerResponse,
  body: {
    exportedAt: string;
    source: string;
    exportKind: string;
    eventId: string;
    meta: unknown;
    records: TRecord[];
  },
  filename: string,
  format: ExportFormat
) {
  if (format === "jsonl") {
    const lines = [
      JSON.stringify({
        exportedAt: body.exportedAt,
        source: body.source,
        exportKind: body.exportKind,
        eventId: body.eventId,
        meta: body.meta
      }),
      ...body.records.map((record) => JSON.stringify(record))
    ];
    return sendTextDownload(response, lines.join("\n"), filename, "application/x-ndjson; charset=utf-8");
  }

  if (format === "csv") {
    const records = body.records.map(flattenForCsv);
    return sendTextDownload(response, buildCsv(records), filename, "text/csv; charset=utf-8");
  }

  return sendJsonDownload(response, body, filename);
}

function flattenForCsv(record: object) {
  const flattened: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    flattened[key] = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  }
  return flattened;
}

function buildCsv(rows: Record<string, string>[]) {
  const headers = rows.length === 0
    ? submissionCsvHeaders
    : Array.from(new Set([...submissionCsvHeaders, ...rows.flatMap((row) => Object.keys(row))]));
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? "")).join(","))
  ];
  return lines.join("\n");
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function sendTextDownload(response: ServerResponse, body: string, filename: string, contentType: string) {
  response.writeHead(200, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename}"`
  });
  response.end(body);
}

function sendJsonDownload(response: ServerResponse, body: unknown, filename: string) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendRequestError(response: ServerResponse, error: unknown) {
  if (response.writableEnded) {
    return;
  }

  const statusCode =
    typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : error instanceof SyntaxError
        ? 400
        : 500;
  const errorCode =
    typeof error === "object" && error && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof SyntaxError
        ? "invalid_json"
        : "internal_error";
  const message =
    error instanceof SyntaxError
      ? "Request body must be valid JSON"
      : error instanceof Error
        ? error.message
        : "Internal server error";

  json(response, statusCode, {
    error: errorCode,
    message
  });
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

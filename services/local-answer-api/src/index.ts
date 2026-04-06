import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createExportEnvelope, createExportFilename } from "@charity/export-core";
import {
  createPrompt,
  createSubmission,
  ensureEvent,
  getAdminBootstrap,
  getDatabasePath,
  getPublicBootstrap,
  hideSubmission,
  listSubmissions,
  promptExists,
  setCollectionMode
} from "./db.js";
import type { CollectionMode } from "./models.js";

interface PostSubmissionBody {
  promptId?: string;
  answerText?: string;
  clientRequestId?: string;
}

interface CreatePromptBody {
  title?: string;
  description?: string;
}

interface SetCollectionStateBody {
  mode?: CollectionMode;
}

const port = Number(process.env.LOCAL_ANSWER_API_PORT ?? 8789);
const adminToken = process.env.LOCAL_ADMIN_TOKEN ?? "dev-admin";
const maxAnswerLength = Number(process.env.LOCAL_ANSWER_MAX_LENGTH ?? 280);
const sessionCookieName = "local_session_id";

const server = createServer(async (request, response) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const pathname = normalizePath(url.pathname);

  if (request.method === "GET" && pathname === "/healthz") {
    return json(response, 200, {
      ok: true,
      service: "local-answer-api",
      now: new Date().toISOString(),
      dbPath: getDatabasePath()
    });
  }

  const publicBootstrapMatch = pathname.match(/^\/api\/events\/([^/]+)\/bootstrap$/);
  if (request.method === "GET" && publicBootstrapMatch?.[1]) {
    return json(response, 200, getPublicBootstrap(publicBootstrapMatch[1]));
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
    return json(response, 200, {
      collectionState: setCollectionMode(adminStateMatch[1], body.mode)
    });
  }

  const adminPromptMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/prompt$/);
  if (request.method === "POST" && adminPromptMatch?.[1]) {
    if (!isAuthorizedAdmin(request)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const body = await readJson<CreatePromptBody>(request);
    const title = body.title?.trim() ?? "";
    if (!title) {
      return json(response, 400, { error: "title_required", message: "title is required" });
    }
    return json(response, 201, createPrompt(adminPromptMatch[1], {
      title,
      description: body.description?.trim() ?? ""
    }));
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
    const payload = createExportEnvelope({
      exportedAt,
      source: "local-answer-api",
      exportKind: "prompt-answers",
      eventId,
      meta: {
        event: eventState.event,
        prompts: eventState.prompts,
        activePromptId: eventState.activePromptId,
        collectionState: eventState.collectionState
      },
      records: listSubmissions(eventId, { includeDeleted: true })
    });
    return sendJsonDownload(
      response,
      payload,
      createExportFilename({
        eventId,
        exportKind: "prompt-answers",
        exportedAt
      })
    );
  }

  return json(response, 404, { error: "not_found", path: pathname });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`local-answer-api listening on http://127.0.0.1:${port}`);
});

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

function isCollectionMode(value: string): value is CollectionMode {
  return value === "OPEN" || value === "PAUSED" || value === "CLOSED";
}

function normalizePath(pathname: string) {
  return pathname === "/" ? "/healthz" : pathname;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as T;
}

function setCors(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type,x-dev-access-token");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJsonDownload(response: ServerResponse, body: unknown, filename: string) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`
  });
  response.end(JSON.stringify(body, null, 2));
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { getPromptCatalog, getSubmissionPolicy } from "./config.js";
import type {
  CollectionMode,
  CollectionStateRecord,
  DisplayMode,
  EventRecord,
  LocalEventState,
  PromptRecord,
  PublicBootstrapResponse,
  PublicFeedItem,
  SubmissionRecord
} from "./models.js";

interface EventRow {
  event_id: string;
  title: string;
  status: "LOCAL_ACTIVE";
}

interface PromptRow {
  prompt_id: string;
  title: string;
  description: string;
  created_at: string;
}

interface CollectionStateRow {
  active_prompt_id: string;
  mode: CollectionMode;
  display_mode: DisplayMode;
  updated_at: string;
}

interface SubmissionRow {
  submission_id: string;
  event_id: string;
  prompt_id: string;
  session_id: string;
  answer_text: string;
  client_request_id: string;
  created_at: string;
  deleted_flag: number;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "../../..");
const defaultDatabasePath = path.join(projectRoot, "var", "data", "local-answer-api.sqlite");

const databasePath = process.env.LOCAL_ANSWER_DB_PATH
  ? path.resolve(process.env.LOCAL_ANSWER_DB_PATH)
  : defaultDatabasePath;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    prompt_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collection_state (
    event_id TEXT PRIMARY KEY,
    active_prompt_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    display_mode TEXT NOT NULL DEFAULT 'INPUT',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (active_prompt_id) REFERENCES prompts(prompt_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS submissions (
    submission_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    client_request_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_flag INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_id) REFERENCES prompts(prompt_id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_dedup
    ON submissions(event_id, prompt_id, session_id, client_request_id);

  CREATE INDEX IF NOT EXISTS idx_prompts_event_created_at
    ON prompts(event_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_submissions_event_created_at
    ON submissions(event_id, created_at DESC);
`);

const existingCollectionColumns = db
  .prepare<[], { name: string }>("PRAGMA table_info(collection_state)")
  .all();
if (!existingCollectionColumns.some((column) => column.name === "display_mode")) {
  db.exec("ALTER TABLE collection_state ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'INPUT'");
}

const selectEventStatement = db.prepare<[string], EventRow>(
  "SELECT event_id, title, status FROM events WHERE event_id = ?"
);
const selectPromptsStatement = db.prepare<[string], PromptRow>(
  "SELECT prompt_id, title, description, created_at FROM prompts WHERE event_id = ? ORDER BY created_at DESC"
);
const selectCollectionStateStatement = db.prepare<[string], CollectionStateRow>(
  "SELECT active_prompt_id, mode, display_mode, updated_at FROM collection_state WHERE event_id = ?"
);
const selectPromptByIdStatement = db.prepare<[string], PromptRow>(
  "SELECT prompt_id, title, description, created_at FROM prompts WHERE prompt_id = ?"
);
const selectPromptByEventAndIdStatement = db.prepare<[string, string], PromptRow>(
  "SELECT prompt_id, title, description, created_at FROM prompts WHERE event_id = ? AND prompt_id = ?"
);
const listSubmissionsStatement = db.prepare<[string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE event_id = ?
   ORDER BY created_at DESC`
);
const listVisibleSubmissionsStatement = db.prepare<[string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE event_id = ? AND deleted_flag = 0
   ORDER BY created_at DESC`
);
const listSubmissionsByPromptStatement = db.prepare<[string, string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE event_id = ? AND prompt_id = ?
   ORDER BY created_at DESC`
);
const listVisibleSubmissionsByPromptStatement = db.prepare<[string, string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE event_id = ? AND prompt_id = ? AND deleted_flag = 0
   ORDER BY created_at DESC`
);
const countVisibleSubmissionsStatement = db.prepare<[string]>(
  "SELECT COUNT(*) AS count FROM submissions WHERE event_id = ? AND deleted_flag = 0"
);
const insertEventStatement = db.prepare(
  "INSERT INTO events (event_id, title, status) VALUES (@event_id, @title, @status)"
);
const insertPromptStatement = db.prepare(
  `INSERT INTO prompts (prompt_id, event_id, title, description, created_at)
   VALUES (@prompt_id, @event_id, @title, @description, @created_at)`
);
const insertCollectionStateStatement = db.prepare(
  `INSERT INTO collection_state (event_id, active_prompt_id, mode, display_mode, updated_at)
   VALUES (@event_id, @active_prompt_id, @mode, @display_mode, @updated_at)`
);
const updateCollectionModeStatement = db.prepare(
  "UPDATE collection_state SET mode = @mode, updated_at = @updated_at WHERE event_id = @event_id"
);
const updateDisplayModeStatement = db.prepare(
  "UPDATE collection_state SET display_mode = @display_mode, updated_at = @updated_at WHERE event_id = @event_id"
);
const updateActivePromptStatement = db.prepare(
  `UPDATE collection_state
   SET active_prompt_id = @active_prompt_id, updated_at = @updated_at
   WHERE event_id = @event_id`
);
const selectDedupSubmissionStatement = db.prepare<[string, string, string, string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE event_id = ? AND prompt_id = ? AND session_id = ? AND client_request_id = ?`
);
const insertSubmissionStatement = db.prepare(
  `INSERT INTO submissions (
    submission_id,
    event_id,
    prompt_id,
    session_id,
    answer_text,
    client_request_id,
    created_at,
    deleted_flag
  ) VALUES (
    @submission_id,
    @event_id,
    @prompt_id,
    @session_id,
    @answer_text,
    @client_request_id,
    @created_at,
    @deleted_flag
  )`
);
const selectSubmissionByIdStatement = db.prepare<[string], SubmissionRow>(
  `SELECT submission_id, event_id, prompt_id, session_id, answer_text, client_request_id, created_at, deleted_flag
   FROM submissions
   WHERE submission_id = ?`
);
const hideSubmissionStatement = db.prepare<[string]>(
  "UPDATE submissions SET deleted_flag = 1 WHERE submission_id = ?"
);

const initializeEventStatement = db.transaction((eventId: string) => {
  const now = new Date().toISOString();
  const promptId = randomUUID();
  const defaultTemplate = getPromptCatalog()[0];
  insertEventStatement.run({
    event_id: eventId,
    title: humanizeEventId(eventId),
    status: "LOCAL_ACTIVE"
  });
  insertPromptStatement.run({
    prompt_id: promptId,
    event_id: eventId,
    title: defaultTemplate?.title ?? "Today's prompt",
    description: defaultTemplate?.description ?? "Please share your feedback.",
    created_at: now
  });
  insertCollectionStateStatement.run({
    event_id: eventId,
    active_prompt_id: promptId,
    mode: "OPEN",
    display_mode: "INPUT",
    updated_at: now
  });
});

export function ensureEvent(eventId: string) {
  if (!selectEventStatement.get(eventId)) {
    initializeEventStatement(eventId);
  }

  const state = getEventState(eventId);
  if (!state) {
    throw new Error(`Failed to initialize local event: ${eventId}`);
  }
  return state;
}

export function getEventState(eventId: string): LocalEventState | null {
  const eventRow = selectEventStatement.get(eventId);
  const collectionStateRow = selectCollectionStateStatement.get(eventId);

  if (!eventRow || !collectionStateRow) {
    return null;
  }

  return {
    event: mapEvent(eventRow),
    prompts: selectPromptsStatement.all(eventId).map(mapPrompt),
    activePromptId: collectionStateRow.active_prompt_id,
    collectionState: mapCollectionState(collectionStateRow),
    submissions: listSubmissionsStatement.all(eventId).map(mapSubmission)
  };
}

export function getPublicBootstrap(eventId: string): PublicBootstrapResponse {
  const state = ensureEvent(eventId);
  const activePrompt = state.prompts.find((prompt) => prompt.promptId === state.activePromptId) ?? null;

  return {
    event: state.event,
    activePrompt,
    collectionState: state.collectionState,
    submissionPolicy: {
      maxLength: getSubmissionPolicy().maxLength
    }
  };
}

export function getAdminBootstrap(eventId: string) {
  const state = ensureEvent(eventId);
  const countRow = countVisibleSubmissionsStatement.get(eventId) as { count: number };

  return {
    event: state.event,
    prompts: state.prompts,
    activePromptId: state.activePromptId,
    collectionState: state.collectionState,
    submissionCount: countRow.count
  };
}

export function listSubmissions(eventId: string, options?: { includeDeleted?: boolean; promptId?: string | null }) {
  ensureEvent(eventId);

  const includeDeleted = options?.includeDeleted === true;
  const promptId = options?.promptId ?? null;

  if (promptId && includeDeleted) {
    return listSubmissionsByPromptStatement.all(eventId, promptId).map(mapSubmission);
  }
  if (promptId) {
    return listVisibleSubmissionsByPromptStatement.all(eventId, promptId).map(mapSubmission);
  }
  if (includeDeleted) {
    return listSubmissionsStatement.all(eventId).map(mapSubmission);
  }
  return listVisibleSubmissionsStatement.all(eventId).map(mapSubmission);
}

export function setCollectionMode(eventId: string, mode: CollectionMode): CollectionStateRecord {
  ensureEvent(eventId);
  const updatedAt = new Date().toISOString();
  updateCollectionModeStatement.run({
    event_id: eventId,
    mode,
    updated_at: updatedAt
  });
  const row = selectCollectionStateStatement.get(eventId);
  if (!row) {
    throw new Error(`Collection state not found for event ${eventId}`);
  }
  return mapCollectionState(row);
}

export function setDisplayMode(eventId: string, displayMode: DisplayMode): CollectionStateRecord {
  ensureEvent(eventId);
  const updatedAt = new Date().toISOString();
  updateDisplayModeStatement.run({
    event_id: eventId,
    display_mode: displayMode,
    updated_at: updatedAt
  });
  const row = selectCollectionStateStatement.get(eventId);
  if (!row) {
    throw new Error(`Collection state not found for event ${eventId}`);
  }
  return mapCollectionState(row);
}

export function listPublicFeed(eventId: string, limit = 80): PublicFeedItem[] {
  ensureEvent(eventId);
  return listVisibleSubmissionsStatement
    .all(eventId)
    .slice(0, limit)
    .map((row) => ({
      submissionId: row.submission_id,
      answerText: row.answer_text,
      createdAt: row.created_at
    }));
}

export function createPrompt(eventId: string, input: { title: string; description: string }) {
  ensureEvent(eventId);
  const promptId = randomUUID();
  const createdAt = new Date().toISOString();

  const transaction = db.transaction(() => {
    insertPromptStatement.run({
      prompt_id: promptId,
      event_id: eventId,
      title: input.title,
      description: input.description,
      created_at: createdAt
    });
    updateActivePromptStatement.run({
      event_id: eventId,
      active_prompt_id: promptId,
      updated_at: createdAt
    });
  });

  transaction();

  const promptRow = selectPromptByIdStatement.get(promptId);
  if (!promptRow) {
    throw new Error(`Prompt not found after insert: ${promptId}`);
  }

  return {
    prompt: mapPrompt(promptRow),
    activePromptId: promptId
  };
}

export function promptExists(eventId: string, promptId: string) {
  ensureEvent(eventId);
  return Boolean(selectPromptByEventAndIdStatement.get(eventId, promptId));
}

export function createSubmission(input: {
  eventId: string;
  promptId: string;
  sessionId: string;
  answerText: string;
  clientRequestId: string;
}) {
  ensureEvent(input.eventId);

  const existing = selectDedupSubmissionStatement.get(
    input.eventId,
    input.promptId,
    input.sessionId,
    input.clientRequestId
  );
  if (existing) {
    return {
      submission: mapSubmission(existing),
      duplicated: true
    };
  }

  const submissionId = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    insertSubmissionStatement.run({
      submission_id: submissionId,
      event_id: input.eventId,
      prompt_id: input.promptId,
      session_id: input.sessionId,
      answer_text: input.answerText,
      client_request_id: input.clientRequestId,
      created_at: createdAt,
      deleted_flag: 0
    });
  } catch (error) {
    const deduped = selectDedupSubmissionStatement.get(
      input.eventId,
      input.promptId,
      input.sessionId,
      input.clientRequestId
    );
    if (deduped) {
      return {
        submission: mapSubmission(deduped),
        duplicated: true
      };
    }
    throw error;
  }

  const inserted = selectSubmissionByIdStatement.get(submissionId);
  if (!inserted) {
    throw new Error(`Submission not found after insert: ${submissionId}`);
  }

  return {
    submission: mapSubmission(inserted),
    duplicated: false
  };
}

export function hideSubmission(submissionId: string) {
  const result = hideSubmissionStatement.run(submissionId);
  return result.changes > 0;
}

export function getSubmissionById(submissionId: string) {
  const row = selectSubmissionByIdStatement.get(submissionId);
  return row ? mapSubmission(row) : null;
}

export function getDatabasePath() {
  return databasePath;
}

function mapEvent(row: EventRow): EventRecord {
  return {
    eventId: row.event_id,
    title: row.title,
    status: row.status
  };
}

function mapPrompt(row: PromptRow): PromptRecord {
  return {
    promptId: row.prompt_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at
  };
}

function mapCollectionState(row: CollectionStateRow): CollectionStateRecord {
  return {
    mode: row.mode,
    displayMode: row.display_mode ?? "INPUT",
    updatedAt: row.updated_at
  };
}

function mapSubmission(row: SubmissionRow): SubmissionRecord {
  return {
    submissionId: row.submission_id,
    eventId: row.event_id,
    promptId: row.prompt_id,
    sessionId: row.session_id,
    answerText: row.answer_text,
    clientRequestId: row.client_request_id,
    createdAt: row.created_at,
    deletedFlag: row.deleted_flag === 1
  };
}

function humanizeEventId(eventId: string) {
  return eventId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

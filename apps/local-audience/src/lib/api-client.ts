const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const DEV_ACCESS_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN ?? "dev-admin";

export type CollectionMode = "OPEN" | "PAUSED" | "CLOSED";
export type DisplayMode = "INPUT" | "ANSWERS";

export interface LocalEventDto {
  eventId: string;
  title: string;
  status: "LOCAL_ACTIVE";
}

export interface PromptDto {
  promptId: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface CollectionStateDto {
  mode: CollectionMode;
  displayMode: DisplayMode;
  updatedAt: string;
}

export interface FeedItemDto {
  submissionId: string;
  answerText: string;
  createdAt: string;
}

export interface FeedResponse {
  eventId: string;
  items: FeedItemDto[];
  generatedAt: string;
}

export interface SubmissionDto {
  submissionId: string;
  eventId: string;
  promptId: string;
  sessionId: string;
  answerText: string;
  clientRequestId: string;
  createdAt: string;
  deletedFlag: boolean;
}

export interface SubmissionPolicyDto {
  maxLength: number;
}

export interface AudienceBootstrapResponse {
  event: LocalEventDto;
  activePrompt: PromptDto | null;
  collectionState: CollectionStateDto;
  submissionPolicy: SubmissionPolicyDto;
}

export interface AdminBootstrapResponse {
  event: LocalEventDto;
  prompts: PromptDto[];
  activePromptId: string;
  collectionState: CollectionStateDto;
  submissionCount: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as T;
}

async function requestBlob(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return response;
}

async function readError(response: Response) {
  try {
    const payload = await response.json() as { error?: string; message?: string };
    const error = new Error(payload.message ?? response.statusText);
    error.name = payload.error ?? "request_failed";
    return error;
  } catch {
    return new Error(response.statusText);
  }
}

export async function fetchAudienceBootstrap(eventId: string) {
  return requestJson<AudienceBootstrapResponse>(`/api/events/${eventId}/bootstrap`);
}

export function buildAudienceStreamUrl(eventId: string) {
  return `${API_BASE_URL}/api/events/${eventId}/live-updates`;
}

export async function fetchFeed(eventId: string, limit = 80) {
  return requestJson<FeedResponse>(`/api/events/${eventId}/feed?limit=${limit}`);
}

function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

export async function submitAnswer(eventId: string, promptId: string, answerText: string) {
  return requestJson<{ submission: SubmissionDto; duplicated: boolean }>(`/api/events/${eventId}/submissions`, {
    method: "POST",
    body: JSON.stringify({
      promptId,
      answerText,
      clientRequestId: generateClientRequestId()
    })
  });
}

export async function fetchAdminBootstrap(eventId: string) {
  return requestJson<AdminBootstrapResponse>(`/api/admin/events/${eventId}/bootstrap`, {
    headers: withDevAccessHeader()
  });
}

export async function fetchAdminSubmissions(eventId: string, options?: {
  includeDeleted?: boolean;
  promptId?: string | null;
}) {
  const query = new URLSearchParams();
  if (options?.includeDeleted) query.set("includeDeleted", "true");
  if (options?.promptId) query.set("promptId", options.promptId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<{ submissions: SubmissionDto[] }>(`/api/admin/events/${eventId}/submissions${suffix}`, {
    headers: withDevAccessHeader()
  });
}

export async function setCollectionState(eventId: string, mode: CollectionMode) {
  return requestJson<{ collectionState: CollectionStateDto }>(`/api/admin/events/${eventId}/state`, {
    method: "POST",
    body: JSON.stringify({ mode }),
    headers: withDevAccessHeader()
  });
}

export async function createPrompt(eventId: string, input: { title: string; description: string }) {
  return requestJson<{ prompt: PromptDto; activePromptId: string }>(`/api/admin/events/${eventId}/prompt`, {
    method: "POST",
    body: JSON.stringify(input),
    headers: withDevAccessHeader()
  });
}

export async function hideSubmission(submissionId: string) {
  return requestJson<{ ok: boolean; submissionId: string }>(`/api/admin/submissions/${submissionId}/hide`, {
    method: "POST",
    headers: withDevAccessHeader()
  });
}

export async function downloadEventExport(eventId: string, includeDeleted = true) {
  const response = await requestBlob(
    `/api/admin/events/${eventId}/export?includeDeleted=${includeDeleted ? "true" : "false"}`,
    {
      headers: withDevAccessHeader()
    }
  );
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("content-disposition");
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);

  anchor.href = downloadUrl;
  anchor.download = filenameMatch?.[1] ?? `${eventId}-prompt-answers.json`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

export function withDevAccessHeader(): HeadersInit | undefined {
  return DEV_ACCESS_TOKEN ? { "X-Dev-Access-Token": DEV_ACCESS_TOKEN } : undefined;
}

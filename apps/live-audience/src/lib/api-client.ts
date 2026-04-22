import { apiSchemas, COMMENT_MAX_LENGTH, type CommentDto, type PostCommentResponse, type PublicEventResponse } from "@charity/shared";
import { z } from "zod";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "https://charity-api.kosuke05816.workers.dev").replace(/\/$/, "");

const commentsResponseSchema = z.object({
  comments: z.array(apiSchemas.comment)
});

export { COMMENT_MAX_LENGTH };

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function validateId(id: string, label: string) {
  if (!SAFE_ID_RE.test(id)) throw new Error(`Invalid ${label} format`);
  return id;
}

export async function fetchEvent(eventId: string): Promise<PublicEventResponse> {
  return apiSchemas.publicEventResponse.parse(await requestJson(`/api/events/${validateId(eventId, "event ID")}`));
}

export async function fetchComments(eventId: string, limit = 50): Promise<CommentDto[]> {
  const payload = commentsResponseSchema.parse(
    await requestJson(`/api/events/${validateId(eventId, "event ID")}/comments?limit=${Math.min(limit, 100)}`)
  );
  return payload.comments;
}

export async function postComment(
  eventId: string,
  input: { commentText: string; turnstileToken?: string; clientRequestId: string }
): Promise<PostCommentResponse> {
  return apiSchemas.postCommentResponse.parse(
    await requestJson(`/api/events/${validateId(eventId, "event ID")}/comments`, {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
}

export function buildStreamUrl(eventId: string) {
  return `${API_BASE_URL}/api/events/${validateId(eventId, "event ID")}/live-updates`;
}

export function buildPlaybackUrl(playbackUid: string | null) {
  if (!playbackUid) return null;
  return `https://iframe.videodelivery.net/${playbackUid}`;
}

async function requestJson(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      },
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      throw await readError(response);
    }

    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readError(response: Response) {
  try {
    const payload = apiSchemas.apiError.parse(await response.json());
    const error = new Error(payload.message);
    error.name = payload.error;
    return error;
  } catch {
    return new Error(response.statusText || "Request failed");
  }
}

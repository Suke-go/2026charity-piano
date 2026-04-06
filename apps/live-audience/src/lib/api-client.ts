import { apiSchemas, COMMENT_MAX_LENGTH, type CommentDto, type PostCommentResponse, type PublicEventResponse } from "@charity/shared";
import { z } from "zod";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "https://charity-api.kosuke05816.workers.dev").replace(/\/$/, "");

const commentsResponseSchema = z.object({
  comments: z.array(apiSchemas.comment)
});

export { COMMENT_MAX_LENGTH };

export async function fetchEvent(eventId: string): Promise<PublicEventResponse> {
  return apiSchemas.publicEventResponse.parse(await requestJson(`/api/events/${eventId}`));
}

export async function fetchComments(eventId: string, limit = 50): Promise<CommentDto[]> {
  const payload = commentsResponseSchema.parse(
    await requestJson(`/api/events/${eventId}/comments?limit=${Math.min(limit, 100)}`)
  );
  return payload.comments;
}

export async function postComment(
  eventId: string,
  input: { commentText: string; turnstileToken: string; clientRequestId: string }
): Promise<PostCommentResponse> {
  return apiSchemas.postCommentResponse.parse(
    await requestJson(`/api/events/${eventId}/comments`, {
      method: "POST",
      body: JSON.stringify(input)
    })
  );
}

export function buildStreamUrl(eventId: string) {
  return `${API_BASE_URL}/api/events/${eventId}/stream`;
}

export function buildPlaybackUrl(playbackUid: string | null) {
  if (!playbackUid) return null;
  return `https://iframe.videodelivery.net/${playbackUid}`;
}

async function requestJson(path: string, init?: RequestInit) {
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

  return response.json();
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

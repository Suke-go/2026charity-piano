import type { Context } from "hono";
import { apiSchemas } from "@charity/shared";

export function jsonOk<T>(c: Context, body: T, init?: ResponseInit) {
  return Response.json(body as never, { ...init, status: 200 });
}

export function jsonCreated<T>(c: Context, body: T, init?: ResponseInit) {
  return Response.json(body as never, { ...init, status: 201 });
}

export function jsonError(
  c: Context,
  status: number,
  error: string,
  message: string,
  requestId?: string
) {
  const payload = { error, message, requestId };
  apiSchemas.apiError.parse(payload);
  return Response.json(payload, { status });
}

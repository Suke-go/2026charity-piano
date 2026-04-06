import type { ErrorHandler, NotFoundHandler } from "hono";
import type { AppVariables, Env } from "../env";
import { jsonError } from "../lib/http";
import { logError } from "../lib/logger";

export const handleError: ErrorHandler<{ Bindings: Env; Variables: AppVariables }> = (err, c) => {
  logError("request_failed", {
    requestId: c.get("requestId"),
    path: c.req.path,
    message: err instanceof Error ? err.message : String(err)
  });
  return jsonError(c, 500, "internal_error", "Internal server error", c.get("requestId"));
};

export const handleNotFound: NotFoundHandler<{ Bindings: Env; Variables: AppVariables }> = (c) =>
  jsonError(c, 404, "not_found", "Route not found", c.get("requestId"));

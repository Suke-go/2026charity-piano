import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../env";

export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return cors({
    origin: (origin, c) => c.env.WEB_ALLOWED_ORIGIN ?? origin ?? "*",
    credentials: true
  });
}

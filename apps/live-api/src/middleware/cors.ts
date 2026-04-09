import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../env";

export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return cors({
    origin: (origin, c) => {
      const allowed = c.env.WEB_ALLOWED_ORIGIN;
      if (!allowed) return origin ?? "";
      return allowed.split(",").map((o: string) => o.trim()).includes(origin ?? "") ? (origin ?? "") : "";
    },
    credentials: true
  });
}

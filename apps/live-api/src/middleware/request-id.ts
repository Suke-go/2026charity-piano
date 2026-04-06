import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../env";

export function requestId(): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    return next();
  };
}

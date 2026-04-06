import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../env";
import { jsonError } from "../lib/http";

const jwkCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const verifyAccessJwt: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const token =
    c.req.header("Cf-Access-Jwt-Assertion") ??
    c.req.header("cf-access-jwt-assertion") ??
    c.req.header("X-Dev-Access-Token");
  if (!token) {
    return jsonError(c, 401, "unauthorized", "Access token is required", c.get("requestId"));
  }

  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_ADMIN_AUD) {
    if (c.env.ALLOW_LOCAL_DEV_BYPASS === "true" && token === "dev-admin") {
      c.set("adminUser", {
        email: "admin@example.com",
        sub: "dev-admin"
      });
      return next();
    }
    return jsonError(c, 503, "access_unconfigured", "Access is not configured", c.get("requestId"));
  }

  try {
    const jwks = getJwks(c.env.ACCESS_TEAM_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_ADMIN_AUD
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      return jsonError(c, 403, "access_denied", "Access user email is missing", c.get("requestId"));
    }

    const allowedEmails =
      c.env.ADMIN_ALLOWED_EMAILS?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean) ??
      [];
    if (allowedEmails.length > 0 && !allowedEmails.includes(email.toLowerCase())) {
      return jsonError(c, 403, "access_denied", "User is not allowed", c.get("requestId"));
    }

    c.set("adminUser", {
      email,
      sub: typeof payload.sub === "string" ? payload.sub : email,
      issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined
    });
    return next();
  } catch {
    return jsonError(c, 403, "access_denied", "Access token verification failed", c.get("requestId"));
  }
};

function getJwks(teamDomain: string) {
  const cached = jwkCache.get(teamDomain);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`));
  jwkCache.set(teamDomain, jwks);
  return jwks;
}

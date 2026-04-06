export interface AdminUser {
  email: string;
  sub: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface Env {
  DB: D1Database;
  COMMENT_ROOMS: DurableObjectNamespace;
  R2_BUCKET?: R2Bucket;
  AUDIT_QUEUE?: Queue<unknown>;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  TURNSTILE_EXPECTED_ACTION?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_ADMIN_AUD?: string;
  ADMIN_ALLOWED_EMAILS?: string;
  BLOCKED_COMMENT_WORDS?: string;
  WEB_ALLOWED_ORIGIN?: string;
  ALLOW_LOCAL_DEV_BYPASS?: string;
}

export interface AppVariables {
  requestId: string;
  adminUser?: AdminUser;
}

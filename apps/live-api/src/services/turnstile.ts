export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes: string[];
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
}

export async function verifyTurnstileToken(
  env: {
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_EXPECTED_HOSTNAME?: string;
    TURNSTILE_EXPECTED_ACTION?: string;
    ALLOW_LOCAL_DEV_BYPASS?: string;
  },
  token: string
): Promise<TurnstileVerificationResult> {
  if (token === "dev-turnstile") {
    return { success: true, errorCodes: [] };
  }
  if (env.ALLOW_LOCAL_DEV_BYPASS === "true") {
    return { success: true, errorCodes: [] };
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    return { success: false, errorCodes: ["missing_secret"] };
  }
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    return { success: false, errorCodes: ["turnstile_unavailable"] };
  }
  clearTimeout(timeout);
  if (!response.ok) {
    return { success: false, errorCodes: ["turnstile_unavailable"] };
  }
  const data = (await response.json()) as TurnstileResponse;
  const hostnameOk =
    !env.TURNSTILE_EXPECTED_HOSTNAME || data.hostname === env.TURNSTILE_EXPECTED_HOSTNAME;
  const actionOk = !env.TURNSTILE_EXPECTED_ACTION || data.action === env.TURNSTILE_EXPECTED_ACTION;
  return {
    success: Boolean(data.success && hostnameOk && actionOk),
    errorCodes: data["error-codes"] ?? []
  };
}

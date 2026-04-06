import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";

type ServiceName = "live-api" | "export-worker" | "nginx";

interface ServiceState {
  name: ServiceName;
  status: "configured" | "restart_requested";
  restartSupported: boolean;
  lastRestartRequestedAt: string | null;
}

const port = Number(process.env.OPS_AGENT_PORT ?? 8788);
const serviceNames = ((process.env.OPS_SERVICE_NAMES ?? "live-api,export-worker,nginx")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean) as ServiceName[]);

const serviceState = new Map<ServiceName, ServiceState>(
  serviceNames.map((name) => [
    name,
    {
      name,
      status: "configured",
      restartSupported: name !== "nginx",
      lastRestartRequestedAt: null
    }
  ])
);

const server = createServer(async (request, response) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const pathname = normalizePath(url.pathname);

  if (request.method === "GET" && pathname === "/health") {
    return json(response, 200, {
      ok: true,
      service: "ops-agent",
      now: new Date().toISOString()
    });
  }

  if (request.method === "GET" && pathname === "/system") {
    return json(response, 200, {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSec: os.uptime(),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      loadAverage: os.loadavg(),
      nodeVersion: process.version
    });
  }

  if (request.method === "GET" && pathname === "/services") {
    return json(response, 200, {
      services: Array.from(serviceState.values())
    });
  }

  const restartMatch = pathname.match(/^\/services\/([^/]+)\/restart$/);
  if (request.method === "POST" && restartMatch?.[1]) {
    const name = restartMatch[1] as ServiceName;
    const state = serviceState.get(name);
    if (!state) {
      return json(response, 404, { error: "service_not_found" });
    }
    if (!state.restartSupported) {
      return json(response, 400, { error: "restart_not_supported", service: name });
    }

    const nextState: ServiceState = {
      ...state,
      status: "restart_requested",
      lastRestartRequestedAt: new Date().toISOString()
    };
    serviceState.set(name, nextState);
    return json(response, 200, {
      ok: true,
      service: name,
      status: nextState.status,
      lastRestartRequestedAt: nextState.lastRestartRequestedAt
    });
  }

  return json(response, 404, { error: "not_found", path: pathname });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ops-agent listening on http://127.0.0.1:${port}`);
});

function normalizePath(pathname: string) {
  if (pathname.startsWith("/ops-api/")) {
    return pathname.slice("/ops-api".length);
  }
  return pathname;
}

function setCors(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

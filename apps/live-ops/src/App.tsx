import { useEffect, useState } from "react";

interface HealthResponse {
  ok: boolean;
  service: string;
  now: string;
}

interface SystemResponse {
  hostname: string;
  platform: string;
  arch: string;
  uptimeSec: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  loadAverage: number[];
  nodeVersion: string;
}

interface ServiceStatus {
  name: string;
  status: string;
  restartSupported: boolean;
  lastRestartRequestedAt: string | null;
}

const OPS_BASE_URL = import.meta.env.VITE_OPS_BASE_URL ?? "http://127.0.0.1:8788";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${OPS_BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(await response.text() || response.statusText);
  }
  return (await response.json()) as T;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyService, setBusyService] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const [nextHealth, nextSystem, nextServices] = await Promise.all([
        requestJson<HealthResponse>("/health"),
        requestJson<SystemResponse>("/system"),
        requestJson<{ services: ServiceStatus[] }>("/services")
      ]);
      setHealth(nextHealth);
      setSystem(nextSystem);
      setServices(nextServices.services);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load ops data");
    }
  }

  async function requestRestart(name: string) {
    setBusyService(name);
    try {
      await requestJson<{ ok: boolean; service: string }>(`/services/${name}/restart`, { method: "POST" });
      await refresh();
    } finally {
      setBusyService(null);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Live Ops</p>
        <h1>Server Verification Dashboard</h1>
        <p className="lead">`ops-agent` が返す health、system、service 状態をここから確認します。</p>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Health</h2>
            <p className={`status ${health?.ok ? "ok" : "warn"}`}>{health?.ok ? "OK" : "UNKNOWN"}</p>
          </div>
          <button onClick={() => void refresh()}>Refresh</button>
        </div>
        <p className="muted">{health ? `${health.service} at ${health.now}` : "No health data yet."}</p>
      </section>

      <section className="panel">
        <h2>System</h2>
        {system ? (
          <dl className="grid">
            <div><dt>Hostname</dt><dd>{system.hostname}</dd></div>
            <div><dt>Platform</dt><dd>{system.platform} / {system.arch}</dd></div>
            <div><dt>Node</dt><dd>{system.nodeVersion}</dd></div>
            <div><dt>Uptime</dt><dd>{Math.round(system.uptimeSec / 60)} min</dd></div>
            <div><dt>Total Memory</dt><dd>{Math.round(system.totalMemoryBytes / 1024 / 1024)} MB</dd></div>
            <div><dt>Free Memory</dt><dd>{Math.round(system.freeMemoryBytes / 1024 / 1024)} MB</dd></div>
          </dl>
        ) : (
          <p className="muted">System data is not loaded yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>Services</h2>
        <div className="service-list">
          {services.map((service) => (
            <article className="service-card" key={service.name}>
              <div>
                <strong>{service.name}</strong>
                <p className="muted">{service.status}</p>
                <small>{service.lastRestartRequestedAt ?? "never restarted"}</small>
              </div>
              <button
                disabled={!service.restartSupported || busyService === service.name}
                onClick={() => void requestRestart(service.name)}
              >
                {busyService === service.name ? "Restarting..." : "Restart"}
              </button>
            </article>
          ))}
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

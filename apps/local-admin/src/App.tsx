import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type CollectionMode = "OPEN" | "PAUSED" | "CLOSED";
type DisplayMode = "INPUT" | "ANSWERS";
type ExportScope = "all" | "active_prompt" | "visible_only";
type ExportFormat = "json" | "jsonl" | "csv";

const ADMIN_PASSWORD = "jundaiokano";
const ADMIN_UNLOCK_KEY = "local-admin:unlocked";
const WIFI_SSID_KEY = "local-admin:wifi-ssid";
const WIFI_PASSWORD_KEY = "local-admin:wifi-password";
const WIFI_SECURITY_KEY = "local-admin:wifi-security";

type WifiSecurity = "WPA" | "WEP" | "nopass";

function buildWifiQrString(ssid: string, password: string, security: WifiSecurity): string {
  if (!ssid) return "";
  const escape = (value: string) => value.replace(/([\\;,":])/g, "\\$1");
  const parts = [`T:${security}`, `S:${escape(ssid)}`];
  if (security !== "nopass") {
    parts.push(`P:${escape(password)}`);
  }
  parts.push("H:false");
  return `WIFI:${parts.join(";")};;`;
}

interface LocalEventDto {
  eventId: string;
  title: string;
  status: "LOCAL_ACTIVE";
}

interface PromptDto {
  promptId: string;
  title: string;
  description: string;
  createdAt: string;
}

interface PromptTemplateDto {
  key: string;
  title: string;
  description: string;
}

interface CollectionStateDto {
  mode: CollectionMode;
  displayMode: DisplayMode;
  updatedAt: string;
}

interface SubmissionDto {
  submissionId: string;
  eventId: string;
  promptId: string;
  sessionId: string;
  answerText: string;
  clientRequestId: string;
  createdAt: string;
  deletedFlag: boolean;
}

interface AdminBootstrapResponse {
  event: LocalEventDto;
  prompts: PromptDto[];
  activePromptId: string;
  collectionState: CollectionStateDto;
  submissionCount: number;
}

interface PromptCatalogResponse {
  configPath: string;
  promptCatalog: PromptTemplateDto[];
  submissionPolicy: {
    maxLength: number;
    blockedTerms: string[];
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const DEV_ACCESS_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN ?? "dev-admin";
const DEFAULT_EVENT_ID = import.meta.env.VITE_DEFAULT_EVENT_ID ?? "local-feedback";

function getAudienceBaseUrl() {
  const explicit = import.meta.env.VITE_AUDIENCE_BASE_URL;
  if (explicit) return explicit;
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "";
  }
  return `${window.location.protocol}//${host}:5175`;
}
const AUDIENCE_BASE_URL_FALLBACK = getAudienceBaseUrl();

async function fetchAudienceBaseUrl(): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meta/server-info`);
    if (!response.ok) throw new Error("server-info unavailable");
    const data = (await response.json()) as { audienceBaseUrl: string | null };
    if (data.audienceBaseUrl) return data.audienceBaseUrl;
  } catch {
    // fall through
  }
  return AUDIENCE_BASE_URL_FALLBACK;
}

function buildAudiencePath(eventId: string) {
  return eventId === DEFAULT_EVENT_ID ? "/" : `/events/${eventId}`;
}

function buildAdminPath(eventId: string) {
  return eventId === DEFAULT_EVENT_ID ? "/" : `/events/${eventId}`;
}

function getRoute(pathname: string) {
  if (pathname === "/" || pathname === "/admin") {
    return { type: "admin" as const, eventId: DEFAULT_EVENT_ID };
  }
  const canonicalMatch = pathname.match(/^\/events\/([^/]+)$/);
  if (canonicalMatch?.[1]) {
    return { type: "admin" as const, eventId: canonicalMatch[1] };
  }
  const legacyMatch = pathname.match(/^\/admin\/events\/([^/]+)$/);
  if (legacyMatch?.[1]) {
    return { type: "admin" as const, eventId: legacyMatch[1] };
  }
  return null;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "X-Dev-Access-Token": DEV_ACCESS_TOKEN,
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as T;
}

async function requestExport(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "X-Dev-Access-Token": DEV_ACCESS_TOKEN }
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return response;
}

async function readError(response: Response) {
  try {
    const payload = await response.json() as { error?: string; message?: string };
    const error = new Error(payload.message ?? response.statusText);
    error.name = payload.error ?? "request_failed";
    return error;
  } catch {
    return new Error(response.statusText);
  }
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value === ADMIN_PASSWORD) {
      window.localStorage.setItem(ADMIN_UNLOCK_KEY, "1");
      onUnlock();
      return;
    }
    setError("パスワードが違います。");
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Local Admin</p>
        <h1>管理画面</h1>
        <p className="lead">続行するにはパスワードを入力してください。</p>
      </section>
      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            パスワード
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          </label>
          <div className="button-row">
            <button type="submit">開く</button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

function readStoredWifi() {
  if (typeof window === "undefined") {
    return { ssid: "", password: "", security: "WPA" as WifiSecurity };
  }
  return {
    ssid: window.localStorage.getItem(WIFI_SSID_KEY) ?? "",
    password: window.localStorage.getItem(WIFI_PASSWORD_KEY) ?? "",
    security: ((window.localStorage.getItem(WIFI_SECURITY_KEY) as WifiSecurity) ?? "WPA") as WifiSecurity
  };
}

function useAudienceBase() {
  const [audienceBase, setAudienceBase] = useState<string>(AUDIENCE_BASE_URL_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await fetchAudienceBaseUrl();
      if (!cancelled && resolved) setAudienceBase(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return audienceBase;
}

function FullscreenQrView() {
  const params = new URLSearchParams(window.location.search);
  const qrMode = params.get("qr");

  if (qrMode === "wifi") {
    return <FullscreenWifiQr />;
  }
  if (qrMode === "combo") {
    return <FullscreenComboQr />;
  }
  return <FullscreenUrlQr />;
}

function FullscreenUrlQr() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event") ?? DEFAULT_EVENT_ID;
  const audiencePath = eventId === DEFAULT_EVENT_ID ? "/" : `/events/${eventId}`;
  const resolved = useAudienceBase();
  const audienceBase = params.get("audience") ?? resolved;
  const target = `${audienceBase}${audiencePath}`;

  return (
    <main className="qr-fullscreen">
      <div className="qr-fullscreen-card">
        <QRCodeSVG value={target} size={560} level="M" marginSize={4} />
        <p className="qr-fullscreen-url">{target || "接続先を解決中..."}</p>
        <p className="qr-fullscreen-hint">スマホで読み取ってアクセス</p>
      </div>
    </main>
  );
}

function FullscreenWifiQr() {
  const wifi = readStoredWifi();
  const qr = buildWifiQrString(wifi.ssid, wifi.password, wifi.security);

  return (
    <main className="qr-fullscreen">
      <div className="qr-fullscreen-card">
        {qr ? (
          <QRCodeSVG value={qr} size={560} level="M" marginSize={4} />
        ) : (
          <p className="qr-fullscreen-url">Wi-Fi 設定が未登録です。管理画面で設定してください。</p>
        )}
        {qr ? <p className="qr-fullscreen-url">SSID: {wifi.ssid}</p> : null}
        <p className="qr-fullscreen-hint">スマホで読み取って Wi-Fi に接続</p>
      </div>
    </main>
  );
}

function FullscreenComboQr() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event") ?? DEFAULT_EVENT_ID;
  const audiencePath = eventId === DEFAULT_EVENT_ID ? "/" : `/events/${eventId}`;
  const resolved = useAudienceBase();
  const audienceBase = params.get("audience") ?? resolved;
  const target = `${audienceBase}${audiencePath}`;
  const wifi = readStoredWifi();
  const wifiQr = buildWifiQrString(wifi.ssid, wifi.password, wifi.security);

  return (
    <main className="qr-fullscreen">
      <div className="qr-combo">
        <div className="qr-combo-card">
          <p className="qr-combo-step">1. Wi-Fi に接続</p>
          {wifiQr ? (
            <QRCodeSVG value={wifiQr} size={340} level="M" marginSize={3} />
          ) : (
            <p className="qr-fullscreen-url">Wi-Fi 未設定</p>
          )}
          <p className="qr-combo-label">{wifi.ssid || "(SSID 未設定)"}</p>
        </div>
        <div className="qr-combo-card">
          <p className="qr-combo-step">2. 回答ページを開く</p>
          <QRCodeSVG value={target} size={340} level="M" marginSize={3} />
          <p className="qr-combo-label">{target}</p>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("qr") === "1") {
    return <FullscreenQrView />;
  }

  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ADMIN_UNLOCK_KEY) === "1";
  });

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  const route = getRoute(window.location.pathname);
  if (!route) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Route Fallback</p>
          <h1>Use the admin root or an explicit event path</h1>
          <p className="lead">
            Open the default admin workspace at admin.local or choose a specific event path.
          </p>
        </section>

        <section className="grid two-up">
          <article className="panel">
            <h2>Default Admin</h2>
            <p className="muted">Canonical URL for the default local event.</p>
            <a className="button-link" href={buildAdminPath(DEFAULT_EVENT_ID)}>
              {buildAdminPath(DEFAULT_EVENT_ID)}
            </a>
          </article>

          <article className="panel">
            <h2>Audience Pair</h2>
            <p className="muted">Matching audience URL on live.local.</p>
            <a className="button-link secondary" href={`${AUDIENCE_BASE_URL_FALLBACK}${buildAudiencePath(DEFAULT_EVENT_ID)}`}>
              {`${AUDIENCE_BASE_URL_FALLBACK}${buildAudiencePath(DEFAULT_EVENT_ID)}`}
            </a>
          </article>
        </section>
      </main>
    );
  }

  return <AdminWorkspace eventId={route.eventId} />;
}

function AdminWorkspace({ eventId }: { eventId: string }) {
  const [audienceBase, setAudienceBase] = useState<string>(AUDIENCE_BASE_URL_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await fetchAudienceBaseUrl();
      if (!cancelled && resolved) setAudienceBase(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [wifiSsid, setWifiSsid] = useState<string>(() => readStoredWifi().ssid);
  const [wifiPassword, setWifiPassword] = useState<string>(() => readStoredWifi().password);
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>(() => readStoredWifi().security);

  useEffect(() => {
    window.localStorage.setItem(WIFI_SSID_KEY, wifiSsid);
  }, [wifiSsid]);
  useEffect(() => {
    window.localStorage.setItem(WIFI_PASSWORD_KEY, wifiPassword);
  }, [wifiPassword]);
  useEffect(() => {
    window.localStorage.setItem(WIFI_SECURITY_KEY, wifiSecurity);
  }, [wifiSecurity]);

  const wifiQrString = useMemo(
    () => buildWifiQrString(wifiSsid, wifiPassword, wifiSecurity),
    [wifiSsid, wifiPassword, wifiSecurity]
  );

  const [page, setPage] = useState<AdminBootstrapResponse | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([]);
  const [catalog, setCatalog] = useState<PromptCatalogResponse | null>(null);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [includeDeleted, setIncludeDeleted] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [bootstrap, submissionResponse, promptCatalog] = await Promise.all([
          requestJson<AdminBootstrapResponse>(`/api/admin/events/${eventId}/bootstrap`),
          requestJson<{ submissions: SubmissionDto[] }>(`/api/admin/events/${eventId}/submissions?includeDeleted=true`),
          requestJson<PromptCatalogResponse>("/api/admin/prompt-catalog")
        ]);
        if (cancelled) return;
        setPage(bootstrap);
        setSubmissions(submissionResponse.submissions);
        setCatalog(promptCatalog);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load admin");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [eventId]);

  const promptTitles = useMemo(
    () => new Map((page?.prompts ?? []).map((prompt) => [prompt.promptId, prompt.title])),
    [page]
  );

  const activePromptTitle = page?.prompts.find((prompt) => prompt.promptId === page.activePromptId)?.title ?? "None";
  const policySummary = catalog
    ? `Max ${catalog.submissionPolicy.maxLength} chars. ${catalog.submissionPolicy.blockedTerms.length} blocked terms.`
    : "Loading prompt policy.";

  async function refresh() {
    const [bootstrap, submissionResponse, promptCatalog] = await Promise.all([
      requestJson<AdminBootstrapResponse>(`/api/admin/events/${eventId}/bootstrap`),
      requestJson<{ submissions: SubmissionDto[] }>(`/api/admin/events/${eventId}/submissions?includeDeleted=true`),
      requestJson<PromptCatalogResponse>("/api/admin/prompt-catalog")
    ]);
    setPage(bootstrap);
    setSubmissions(submissionResponse.submissions);
    setCatalog(promptCatalog);
  }

  async function updateMode(mode: CollectionMode) {
    try {
      setBusy(true);
      setError(null);
      await requestJson<{ collectionState: CollectionStateDto }>(`/api/admin/events/${eventId}/state`, {
        method: "POST",
        body: JSON.stringify({ mode })
      });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to update collection state");
    } finally {
      setBusy(false);
    }
  }

  async function updateDisplayMode(displayMode: DisplayMode) {
    try {
      setBusy(true);
      setError(null);
      await requestJson<{ collectionState: CollectionStateDto }>(`/api/admin/events/${eventId}/display-mode`, {
        method: "POST",
        body: JSON.stringify({ displayMode })
      });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to update display mode");
    } finally {
      setBusy(false);
    }
  }

  async function createNextPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promptTitle.trim()) {
      setError("Prompt title is required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await requestJson<{ prompt: PromptDto; activePromptId: string }>(`/api/admin/events/${eventId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          title: promptTitle.trim(),
          description: promptDescription.trim()
        })
      });
      setPromptTitle("");
      setPromptDescription("");
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create prompt");
    } finally {
      setBusy(false);
    }
  }

  async function publishTemplate(templateKey: string) {
    try {
      setBusy(true);
      setError(null);
      await requestJson<{ prompt: PromptDto; activePromptId: string }>(`/api/admin/events/${eventId}/prompt`, {
        method: "POST",
        body: JSON.stringify({ templateKey })
      });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to publish template");
    } finally {
      setBusy(false);
    }
  }

  async function hideAnswer(submissionId: string) {
    try {
      setBusy(true);
      setError(null);
      await requestJson<{ ok: boolean }>(`/api/admin/submissions/${submissionId}/hide`, {
        method: "POST"
      });
      setSubmissions((current) =>
        current.map((submission) =>
          submission.submissionId === submissionId ? { ...submission, deletedFlag: true } : submission
        )
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to hide submission");
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const query = new URLSearchParams({
        scope: exportScope,
        format: exportFormat
      });
      if (exportScope !== "visible_only") {
        query.set("includeDeleted", includeDeleted ? "true" : "false");
      }
      const response = await requestExport(`/api/admin/events/${eventId}/export?${query.toString()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition");
      const filenameMatch = disposition?.match(/filename=\"?([^\"]+)\"?/i);
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ?? `${eventId}-prompt-answers.${exportFormat}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to export data");
    } finally {
      setExporting(false);
    }
  }

  function loadTemplateIntoForm(template: PromptTemplateDto) {
    setPromptTitle(template.title);
    setPromptDescription(template.description);
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Local Admin</p>
        <h1>{page?.event.title ?? "Loading..."}</h1>
        <p className="lead">
          Prompt delivery is pushed to the audience via SSE. Submission review is refreshed every 10 seconds to keep
          traffic lower than the audience fanout path.
        </p>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Collection State</h2>
            <p className={`state-chip state-${page?.collectionState.mode.toLowerCase() ?? "unknown"}`}>
              {page?.collectionState.mode ?? "UNKNOWN"}
            </p>
          </div>
          <div className="button-row">
            <button disabled={busy} onClick={() => void updateMode("OPEN")}>Open</button>
            <button disabled={busy} onClick={() => void updateMode("PAUSED")}>Pause</button>
            <button disabled={busy} onClick={() => void updateMode("CLOSED")}>Close</button>
          </div>
        </div>
        <p className="muted">Active prompt: {activePromptTitle}</p>
        <p className="muted">{policySummary}</p>
        <a className="button-link secondary" href={`${audienceBase}${buildAudiencePath(eventId)}`}>
          Open audience page
        </a>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>観客用 QR（回答ページ）</h2>
            <p className="muted">この QR を掲示／配布してください。</p>
          </div>
          <div className="button-row">
            <a
              className="button-link secondary"
              href={`?qr=url${eventId === DEFAULT_EVENT_ID ? "" : `&event=${encodeURIComponent(eventId)}`}`}
              target="_blank"
              rel="noreferrer"
            >
              全画面
            </a>
          </div>
        </div>
        <div className="qr-inline">
          <QRCodeSVG
            value={`${audienceBase}${buildAudiencePath(eventId)}`}
            size={200}
            level="M"
            marginSize={2}
          />
          <p className="qr-inline-url">{`${audienceBase}${buildAudiencePath(eventId)}`}</p>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Wi-Fi 接続 QR</h2>
            <p className="muted">SSID / パスワードを登録すると接続用 QR が自動生成されます。</p>
          </div>
          <div className="button-row">
            <a
              className="button-link secondary"
              href="?qr=wifi"
              target="_blank"
              rel="noreferrer"
            >
              Wi-Fi 単体
            </a>
            <a
              className="button-link"
              href={`?qr=combo${eventId === DEFAULT_EVENT_ID ? "" : `&event=${encodeURIComponent(eventId)}`}`}
              target="_blank"
              rel="noreferrer"
            >
              掲示用（Wi-Fi + URL）
            </a>
          </div>
        </div>
        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            SSID
            <input
              type="text"
              value={wifiSsid}
              autoComplete="off"
              placeholder="concert-audience"
              onChange={(event) => setWifiSsid(event.target.value)}
            />
          </label>
          <label className="field">
            パスワード
            <input
              type="text"
              value={wifiPassword}
              autoComplete="off"
              placeholder="WPA/WPA2 のパスフレーズ"
              onChange={(event) => setWifiPassword(event.target.value)}
              disabled={wifiSecurity === "nopass"}
            />
          </label>
          <label className="field">
            暗号方式
            <select
              value={wifiSecurity}
              onChange={(event) => setWifiSecurity(event.target.value as WifiSecurity)}
            >
              <option value="WPA">WPA / WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">暗号化なし（オープン）</option>
            </select>
          </label>
        </form>
        {wifiQrString ? (
          <div className="qr-inline">
            <QRCodeSVG value={wifiQrString} size={200} level="M" marginSize={2} />
            <p className="qr-inline-url">SSID: {wifiSsid}</p>
          </div>
        ) : (
          <p className="muted">SSID を入力すると QR が表示されます。</p>
        )}
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Audience 表示モード</h2>
            <p className="muted">
              いま: <strong>{page?.collectionState.displayMode === "ANSWERS" ? "回答を流す" : "入力フォーム"}</strong>
            </p>
          </div>
          <div className="button-row">
            <button
              disabled={busy || page?.collectionState.displayMode === "INPUT"}
              className="secondary"
              onClick={() => void updateDisplayMode("INPUT")}
            >
              入力に戻す
            </button>
            <button
              disabled={busy || page?.collectionState.displayMode === "ANSWERS"}
              onClick={() => void updateDisplayMode("ANSWERS")}
            >
              メッセージを見せる
            </button>
          </div>
        </div>
        <p className="muted">
          観客端末の画面が切り替わります。ANSWERS 中は非表示（Hide 済み以外）の回答が順にフロートします。
        </p>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Prompt Catalog</h2>
            <p className="muted">JSON-backed templates loaded from the local middleware.</p>
          </div>
          <p className="count">{catalog?.promptCatalog.length ?? 0}</p>
        </div>
        <p className="muted">{catalog?.configPath ?? "Loading config path..."}</p>
        <div className="catalog-grid">
          {(catalog?.promptCatalog ?? []).map((template) => (
            <article className="catalog-card" key={template.key}>
              <div className="catalog-copy">
                <strong>{template.title}</strong>
                <p>{template.description}</p>
                <small>{template.key}</small>
              </div>
              <div className="button-row">
                <button className="secondary" disabled={busy} onClick={() => loadTemplateIntoForm(template)}>
                  Load
                </button>
                <button disabled={busy} onClick={() => void publishTemplate(template.key)}>
                  Publish
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Create Prompt</h2>
          <p className="count">{page?.prompts.length ?? 0}</p>
        </div>
        <form className="form" onSubmit={(event) => void createNextPrompt(event)}>
          <label className="field">
            Prompt title
            <input
              type="text"
              value={promptTitle}
              onChange={(event) => setPromptTitle(event.target.value)}
              placeholder="Ask a focused question"
            />
          </label>
          <label className="field">
            Prompt description
            <textarea
              rows={4}
              value={promptDescription}
              onChange={(event) => setPromptDescription(event.target.value)}
              placeholder="Add short guidance for the audience."
            />
          </label>
          <div className="button-row">
            <button type="submit" disabled={busy}>Publish prompt</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Export</h2>
          <p className="count">{submissions.length}</p>
        </div>
        <div className="export-controls">
          <label className="field export-field">
            Scope
            <select value={exportScope} onChange={(event) => setExportScope(event.target.value as ExportScope)}>
              <option value="all">All submissions</option>
              <option value="active_prompt">Active prompt only</option>
              <option value="visible_only">Visible only</option>
            </select>
          </label>
          <label className="field export-field">
            Format
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              <option value="json">JSON</option>
              <option value="jsonl">JSONL</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => setIncludeDeleted(event.target.checked)}
              disabled={exportScope === "visible_only"}
            />
            Include hidden submissions when allowed
          </label>
        </div>
        <div className="button-row">
          <button className="secondary" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Prompt History</h2>
          <p className="count">{page?.prompts.length ?? 0}</p>
        </div>
        <div className="comment-table">
          {(page?.prompts ?? []).map((prompt) => (
            <article className={`comment-row ${prompt.promptId === page?.activePromptId ? "is-active" : ""}`} key={prompt.promptId}>
              <div>
                <strong>{prompt.title}</strong>
                <p>{prompt.description || "No description."}</p>
                <small>{new Date(prompt.createdAt).toLocaleString()}</small>
              </div>
              <span className="pill">{prompt.promptId === page?.activePromptId ? "ACTIVE" : "ARCHIVE"}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Submissions</h2>
          <p className="count">{submissions.length}</p>
        </div>
        {submissions.length === 0 ? <p className="muted">No answers have been stored yet.</p> : null}
        <div className="comment-table">
          {submissions.map((submission) => (
            <article className={`comment-row ${submission.deletedFlag ? "is-hidden" : ""}`} key={submission.submissionId}>
              <div>
                <strong>{promptTitles.get(submission.promptId) ?? submission.promptId}</strong>
                <p>{submission.deletedFlag ? "[hidden]" : submission.answerText}</p>
                <small>{new Date(submission.createdAt).toLocaleString()}</small>
              </div>
              <button disabled={busy || submission.deletedFlag} onClick={() => void hideAnswer(submission.submissionId)}>
                {submission.deletedFlag ? "Hidden" : "Hide"}
              </button>
            </article>
          ))}
        </div>
      </section>

      {loading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

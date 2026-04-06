import { useEffect, useMemo, useState } from "react";

type CollectionMode = "OPEN" | "PAUSED" | "CLOSED";

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

interface CollectionStateDto {
  mode: CollectionMode;
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const DEV_ACCESS_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN ?? "dev-admin";
const AUDIENCE_BASE_URL = import.meta.env.VITE_AUDIENCE_BASE_URL ?? "http://live.local";

function getEventIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/events\/([^/]+)$/);
  return match?.[1] ?? "local-feedback";
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
    throw new Error((await response.text()) || response.statusText);
  }
  return (await response.json()) as T;
}

async function requestExport(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "X-Dev-Access-Token": DEV_ACCESS_TOKEN }
  });
  if (!response.ok) {
    throw new Error((await response.text()) || response.statusText);
  }
  return response;
}

export default function App() {
  const eventId = useMemo(() => getEventIdFromPath(window.location.pathname), []);
  const [page, setPage] = useState<AdminBootstrapResponse | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([]);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [bootstrap, submissionResponse] = await Promise.all([
          requestJson<AdminBootstrapResponse>(`/api/admin/events/${eventId}/bootstrap`),
          requestJson<{ submissions: SubmissionDto[] }>(`/api/admin/events/${eventId}/submissions?includeDeleted=true`)
        ]);
        if (cancelled) return;
        setPage(bootstrap);
        setSubmissions(submissionResponse.submissions);
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
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [eventId]);

  const promptTitles = useMemo(
    () => new Map((page?.prompts ?? []).map((prompt) => [prompt.promptId, prompt.title])),
    [page]
  );

  async function refresh() {
    const [bootstrap, submissionResponse] = await Promise.all([
      requestJson<AdminBootstrapResponse>(`/api/admin/events/${eventId}/bootstrap`),
      requestJson<{ submissions: SubmissionDto[] }>(`/api/admin/events/${eventId}/submissions?includeDeleted=true`)
    ]);
    setPage(bootstrap);
    setSubmissions(submissionResponse.submissions);
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

  async function exportJson() {
    setExporting(true);
    try {
      const response = await requestExport(`/api/admin/events/${eventId}/export?includeDeleted=true`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition");
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ?? `${eventId}-prompt-answers.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Local Admin</p>
        <h1>{page?.event.title ?? "Loading..."}</h1>
        <p className="lead">
          Control the active prompt, pause or reopen collection, review answers, and export the stored result
          set from the local SQLite database.
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
            <button className="secondary" disabled={exporting} onClick={() => void exportJson()}>
              {exporting ? "Exporting..." : "Export JSON"}
            </button>
          </div>
        </div>
        <p className="muted">
          Active prompt:{" "}
          {page?.prompts.find((prompt) => prompt.promptId === page.activePromptId)?.title ?? "None"}
        </p>
        <a className="button-link secondary" href={`${AUDIENCE_BASE_URL}/events/${eventId}`}>Open audience page</a>
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
              placeholder="Ask a new question"
            />
          </label>
          <label className="field">
            Prompt description
            <textarea
              rows={4}
              value={promptDescription}
              onChange={(event) => setPromptDescription(event.target.value)}
              placeholder="Add context for the audience."
            />
          </label>
          <div className="button-row">
            <button type="submit" disabled={busy}>Publish prompt</button>
          </div>
        </form>
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

import { useEffect, useMemo, useState } from "react";
import {
  createPrompt,
  downloadEventExport,
  fetchAdminBootstrap,
  fetchAdminSubmissions,
  hideSubmission,
  setCollectionState,
  type AdminBootstrapResponse,
  type CollectionMode,
  type SubmissionDto
} from "../lib/api-client";

export function AdminPage({ eventId }: { eventId: string }) {
  const [page, setPage] = useState<AdminBootstrapResponse | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([]);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [bootstrap, nextSubmissions] = await Promise.all([
          fetchAdminBootstrap(eventId),
          fetchAdminSubmissions(eventId, { includeDeleted: true })
        ]);
        if (cancelled) return;
        setPage(bootstrap);
        setSubmissions(nextSubmissions.submissions);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load admin page");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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

  async function refreshAdminPage() {
    const [bootstrap, nextSubmissions] = await Promise.all([
      fetchAdminBootstrap(eventId),
      fetchAdminSubmissions(eventId, { includeDeleted: true })
    ]);
    setPage(bootstrap);
    setSubmissions(nextSubmissions.submissions);
  }

  async function handleSetMode(mode: CollectionMode) {
    try {
      setBusy(true);
      setError(null);
      await setCollectionState(eventId, mode);
      await refreshAdminPage();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to change collection state");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promptTitle.trim()) {
      setError("Prompt title is required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await createPrompt(eventId, {
        title: promptTitle.trim(),
        description: promptDescription.trim()
      });
      setPromptTitle("");
      setPromptDescription("");
      await refreshAdminPage();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create prompt");
    } finally {
      setBusy(false);
    }
  }

  async function handleHide(submissionId: string) {
    try {
      setBusy(true);
      setError(null);
      await hideSubmission(submissionId);
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

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Admin</p>
        <h1>{page?.event.title ?? "Admin"}</h1>
        <p className="lead">
          Publish prompts, control collection state, review stored answers, and export the full SQLite-backed
          result set.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Collection State</h2>
          <span className={`state-chip state-${page?.collectionState.mode.toLowerCase() ?? "unknown"}`}>
            {page?.collectionState.mode ?? "UNKNOWN"}
          </span>
        </div>
        <p className="muted">
          Active prompt:{" "}
          {page?.prompts.find((prompt) => prompt.promptId === page.activePromptId)?.title ?? "None"}
        </p>
        <div className="button-row">
          <button disabled={busy} onClick={() => void handleSetMode("OPEN")}>Open</button>
          <button disabled={busy} onClick={() => void handleSetMode("PAUSED")}>Pause</button>
          <button disabled={busy} onClick={() => void handleSetMode("CLOSED")}>Close</button>
          <button
            className="secondary"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadEventExport(eventId, true);
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting..." : "Export JSON"}
          </button>
          <a className="button-link secondary" href={`/events/${eventId}`}>Open audience page</a>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Create Prompt</h2>
          <span className="counter">{page?.prompts.length ?? 0}</span>
        </div>
        <form className="form" onSubmit={(event) => void handleCreatePrompt(event)}>
          <label>
            Prompt title
            <input
              type="text"
              value={promptTitle}
              onChange={(event) => setPromptTitle(event.target.value)}
              placeholder="Opening question"
            />
          </label>
          <label>
            Prompt description
            <textarea
              rows={4}
              value={promptDescription}
              onChange={(event) => setPromptDescription(event.target.value)}
              placeholder="Tell the audience what kind of answer you want."
            />
          </label>
          <div className="button-row">
            <button type="submit" disabled={busy}>Publish prompt</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Prompt History</h2>
          <span className="counter">{page?.prompts.length ?? 0}</span>
        </div>
        <div className="comment-table">
          {(page?.prompts ?? []).map((prompt) => (
            <article
              className={`comment-row ${prompt.promptId === page?.activePromptId ? "is-active" : ""}`}
              key={prompt.promptId}
            >
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
        <div className="section-header">
          <h2>Submissions</h2>
          <span className="counter">{submissions.length}</span>
        </div>
        {submissions.length === 0 ? <p className="muted">No answers have been stored yet.</p> : null}
        <div className="comment-table">
          {submissions.map((submission) => (
            <article
              className={`comment-row ${submission.deletedFlag ? "is-hidden" : ""}`}
              key={submission.submissionId}
            >
              <div>
                <strong>{promptTitles.get(submission.promptId) ?? submission.promptId}</strong>
                <p>{submission.deletedFlag ? "[hidden]" : submission.answerText}</p>
                <small>{new Date(submission.createdAt).toLocaleString()}</small>
              </div>
              <button disabled={busy || submission.deletedFlag} onClick={() => void handleHide(submission.submissionId)}>
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

import { useEffect, useState } from "react";
import {
  fetchAudienceBootstrap,
  submitAnswer,
  type AudienceBootstrapResponse
} from "../lib/api-client";

export function ViewerPage({ eventId }: { eventId: string }) {
  const [page, setPage] = useState<AudienceBootstrapResponse | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextPage = await fetchAudienceBootstrap(eventId);
        if (cancelled) return;
        setPage(nextPage);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load audience page");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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

  const canSubmit = page?.collectionState.mode === "OPEN" && Boolean(page.activePrompt) && !sending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page?.activePrompt) {
      setError("No active prompt is available.");
      return;
    }

    const trimmedAnswer = answerText.trim();
    if (!trimmedAnswer) {
      setError("Answer text is required.");
      return;
    }

    try {
      setSending(true);
      setError(null);
      const result = await submitAnswer(eventId, page.activePrompt.promptId, trimmedAnswer);
      setAnswerText("");
      setSubmitMessage(
        result.duplicated
          ? "The same request was already stored."
          : `Answer saved at ${new Date(result.submission.createdAt).toLocaleTimeString()}.`
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to submit answer");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Audience</p>
        <h1>{page?.event.title ?? "Loading..."}</h1>
        <p className="lead">
          Read the current prompt, submit one answer, and wait for the admin to move to the next topic.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Collection Status</h2>
          <span className={`state-chip state-${page?.collectionState.mode.toLowerCase() ?? "unknown"}`}>
            {page?.collectionState.mode ?? "UNKNOWN"}
          </span>
        </div>
        <p className="muted">
          Last updated:{" "}
          {page?.collectionState.updatedAt
            ? new Date(page.collectionState.updatedAt).toLocaleString()
            : "not available"}
        </p>
      </section>

      <section className="grid two-up">
        <div className="panel">
          <div className="section-header">
            <h2>Current Prompt</h2>
            <span className="counter">{page?.activePrompt ? 1 : 0}</span>
          </div>
          {page?.activePrompt ? (
            <div className="stack">
              <div className="prompt-card">
                <strong>{page.activePrompt.title}</strong>
                <p>{page.activePrompt.description || "No prompt description provided."}</p>
              </div>
              <form className="form" onSubmit={(event) => void handleSubmit(event)}>
                <label>
                  Your answer
                  <textarea
                    rows={6}
                    maxLength={280}
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    placeholder="Write one short answer for the current prompt."
                    disabled={!canSubmit}
                  />
                </label>
                <div className="button-row">
                  <button type="submit" disabled={!canSubmit}>
                    {sending ? "Saving..." : "Submit answer"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <p className="muted">No active prompt is currently published.</p>
          )}
        </div>

        <div className="panel">
          <div className="section-header">
            <h2>How This Works</h2>
            <span className="counter">3</span>
          </div>
          <div className="stack">
            <div className="prompt-card">
              <strong>1. Read the prompt</strong>
              <p>The admin can replace the prompt at any time. This page refreshes the prompt automatically.</p>
            </div>
            <div className="prompt-card">
              <strong>2. Submit one answer</strong>
              <p>Your answer is stored in the local SQLite database and can be exported later.</p>
            </div>
            <div className="prompt-card">
              <strong>3. Wait for the next prompt</strong>
              <p>If collection is paused or closed, the submit button stays disabled until it reopens.</p>
            </div>
          </div>
        </div>
      </section>

      {loading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {submitMessage ? <p className="success">{submitMessage}</p> : null}
    </main>
  );
}

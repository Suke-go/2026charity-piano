import { useEffect, useMemo, useState } from "react";
import {
  buildAudienceStreamUrl,
  fetchAudienceBootstrap,
  submitAnswer,
  type AudienceBootstrapResponse
} from "../lib/api-client";
import { FloatingFeedView } from "../components/floating-feed-view";

const STREAM_BOOTSTRAP_UPDATED = "bootstrap.updated";
const SCRAMBLE_ALPHABET = "01<>[]{}/*+-=|#%&?";

const MODE_LABEL: Record<string, string> = {
  OPEN: "受付中",
  PAUSED: "一時停止",
  CLOSED: "終了"
};

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
        setError(nextError instanceof Error ? nextError.message : "読み込みに失敗しました");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [eventId]);

  useEffect(() => {
    const stream = new EventSource(buildAudienceStreamUrl(eventId));

    stream.addEventListener(STREAM_BOOTSTRAP_UPDATED, (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as AudienceBootstrapResponse;
        setPage(payload);
      } catch {
        // Ignore malformed frames and rely on the next refresh cycle.
      }
    });

    return () => {
      stream.close();
    };
  }, [eventId]);

  const maxLength = page?.submissionPolicy.maxLength ?? 80;
  const canSubmit = page?.collectionState.mode === "OPEN" && Boolean(page.activePrompt) && !sending;
  const remaining = useMemo(() => maxLength - answerText.length, [answerText.length, maxLength]);
  const promptTitle = page?.activePrompt?.title ?? "次の質問を待っています";
  const promptDescription =
    page?.activePrompt?.description ?? "まもなく運営から質問が届きます。";
  const titleMotion = useScrambledText(promptTitle, { frameMs: 34, settlePadding: 8 });
  const descriptionMotion = useScrambledText(promptDescription, { frameMs: 18, settlePadding: 14, delayMs: 110 });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page?.activePrompt) {
      setError("いま受付中の質問はありません。");
      return;
    }

    const trimmedAnswer = answerText.trim();
    if (!trimmedAnswer) {
      setError("メッセージを入力してください。");
      return;
    }

    try {
      setSending(true);
      setError(null);
      const result = await submitAnswer(eventId, page.activePrompt.promptId, trimmedAnswer);
      setAnswerText("");
      setSubmitMessage(result.duplicated ? "すでに送信されています。" : "送信しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました。");
    } finally {
      setSending(false);
    }
  }

  if (page?.collectionState.displayMode === "ANSWERS") {
    return <FloatingFeedView eventId={eventId} />;
  }

  return (
    <main className="audience-phone">
      <section className="audience-frame">
        <header className="audience-header">
          <div className="audience-header-row">
            <span className={`state-chip state-${page?.collectionState.mode.toLowerCase() ?? "unknown"}`}>
              {page ? MODE_LABEL[page.collectionState.mode] ?? page.collectionState.mode : "準備中"}
            </span>
          </div>
        </header>

        <section className="audience-question" aria-live="polite">
          <div className="audience-question-head">
            <p className="audience-section-label">いまの質問</p>
          </div>
          <h2 className={`audience-scramble ${titleMotion.isAnimating ? "is-animating" : ""}`}>
            {titleMotion.text}
          </h2>
          <p className={`audience-description ${descriptionMotion.isAnimating ? "is-animating" : ""}`}>
            {descriptionMotion.text}
          </p>
        </section>

        <form className="audience-composer" onSubmit={(event) => void handleSubmit(event)}>
          <div className="audience-question-head">
            <label htmlFor="audience-answer" className="audience-section-label">あなたのメッセージ</label>
          </div>
          <textarea
            id="audience-answer"
            rows={5}
            maxLength={maxLength}
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder={`${maxLength} 文字以内で短く書いてください。`}
            disabled={!canSubmit}
          />
          <div className="audience-composer-meta">
            <p className="audience-caption">残り {remaining} 文字</p>
          </div>
          <button type="submit" disabled={!canSubmit}>
            {sending ? "送信中..." : "送信する"}
          </button>
        </form>

        <footer className="audience-footer">
          {loading ? <p className="muted">読み込み中...</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {submitMessage ? <p className="success">{submitMessage}</p> : null}
        </footer>
      </section>
    </main>
  );
}

function useScrambledText(
  targetText: string,
  options?: {
    delayMs?: number;
    frameMs?: number;
    settlePadding?: number;
  }
) {
  const [text, setText] = useState(targetText);
  const [isAnimating, setIsAnimating] = useState(false);
  const delayMs = options?.delayMs ?? 0;
  const frameMs = options?.frameMs ?? 28;
  const settlePadding = options?.settlePadding ?? 10;

  useEffect(() => {
    if (!targetText) {
      setText("");
      setIsAnimating(false);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(targetText);
      setIsAnimating(false);
      return;
    }

    let frame = 0;
    let timeoutId = 0;
    let started = false;
    const totalFrames = Math.max(targetText.length + settlePadding, 14);

    const tick = () => {
      started = true;
      const revealedCount = Math.min(
        targetText.length,
        Math.floor((frame / totalFrames) * (targetText.length + 1))
      );
      setText(scrambleText(targetText, revealedCount));
      setIsAnimating(revealedCount < targetText.length);
      frame += 1;

      if (revealedCount >= targetText.length) {
        setText(targetText);
        setIsAnimating(false);
        return;
      }

      timeoutId = window.setTimeout(tick, frameMs);
    };

    timeoutId = window.setTimeout(tick, delayMs);

    return () => {
      if (!started) {
        setText(targetText);
      }
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, frameMs, settlePadding, targetText]);

  return { text, isAnimating };
}

function scrambleText(targetText: string, revealedCount: number) {
  let next = "";

  for (let index = 0; index < targetText.length; index += 1) {
    const character = targetText[index] ?? "";
    if (index < revealedCount || /\s/.test(character)) {
      next += character;
      continue;
    }
    next += SCRAMBLE_ALPHABET[Math.floor(Math.random() * SCRAMBLE_ALPHABET.length)] ?? "";
  }

  return next;
}

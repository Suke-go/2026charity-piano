import type {
  PublicCommentDto,
  PublicEventResponse,
  RoomStateDto
} from "@charity/shared";
import { apiSchemas, SSE_EVENT_TYPES } from "@charity/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommentOverlay } from "../components/comment-overlay";
import { StreamPlayer } from "../components/stream-player";
import { buildStreamUrl, COMMENT_MAX_LENGTH, fetchComments, fetchEvent, postComment } from "../lib/api-client";

type StreamState = "connecting" | "live" | "reconnecting";

export function ViewerPage({ eventId }: { eventId: string }) {
  const [page, setPage] = useState<PublicEventResponse | null>(null);
  const [comments, setComments] = useState<PublicCommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [, setStreamState] = useState<StreamState>("connecting");
  const [commentsVisible, setCommentsVisible] = useState(true);
  const [inputOpen, setInputOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number>(0);
  const latestSeenAtRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  function resetHideTimer() {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    if (!inputOpen) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 4000);
    }
  }

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [inputOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextPage, nextComments] = await Promise.all([fetchEvent(eventId), fetchComments(eventId, 50)]);
        if (cancelled) return;
        setPage(nextPage);
        setComments(nextComments);
        latestSeenAtRef.current = nextComments.at(-1)?.serverReceivedAt ?? null;
      } catch {
        // Retry through SSE and the refresh interval below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    const stream = new EventSource(buildStreamUrl(eventId));
    setStreamState("connecting");
    stream.onopen = () => setStreamState("live");
    stream.onerror = () => setStreamState("reconnecting");

    stream.addEventListener(SSE_EVENT_TYPES.COMMENT_CREATED, (event) => {
      try {
        const payload = apiSchemas.commentStreamCommentCreated.parse(JSON.parse((event as MessageEvent).data));
        upsertComment(payload.comment);
      } catch {
        // Ignore malformed frames and rely on the next refresh cycle.
      }
    });

    stream.addEventListener(SSE_EVENT_TYPES.COMMENT_DELETED, (event) => {
      try {
        const payload = apiSchemas.commentStreamCommentDeleted.parse(JSON.parse((event as MessageEvent).data));
        setComments((cur) => cur.filter((c) => c.commentId !== payload.commentId));
      } catch {
        // Ignore malformed frames and rely on the next refresh cycle.
      }
    });

    stream.addEventListener(SSE_EVENT_TYPES.ROOM_STATE_UPDATED, (event) => {
      try {
        const payload = apiSchemas.commentStreamRoomStateUpdated.parse(JSON.parse((event as MessageEvent).data));
        setPage((cur) => (cur ? { ...cur, roomState: payload.roomState } : cur));
      } catch {
        // Ignore malformed frames and rely on the next refresh cycle.
      }
    });

    stream.addEventListener(SSE_EVENT_TYPES.SYNC_REQUIRED, () => { void refreshComments(); });

    return () => stream.close();
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => void refreshComments(), 20000);
    return () => clearInterval(interval);
  }, [eventId]);

  const visibleComments = useMemo(
    () => comments,
    [comments]
  );

  const roomState: RoomStateDto | null = page?.roomState ?? null;
  const isCommentClosed = roomState?.mode === "CLOSED";
  const canEditComment = !isCommentClosed && !posting;
  const canSubmitComment = canEditComment && Boolean(draft.trim());

  async function refreshComments() {
    try {
      const next = await fetchComments(eventId, 50);
      setComments(next);
      latestSeenAtRef.current = next.at(-1)?.serverReceivedAt ?? latestSeenAtRef.current;
    } catch {
      // Keep the current comment list if refresh fails.
    }
  }

  function upsertComment(next: PublicCommentDto) {
    latestSeenAtRef.current = next.serverReceivedAt;
    setComments((cur) => {
      const idx = cur.findIndex((c) => c.commentId === next.commentId);
      if (idx >= 0) {
        const copy = cur.slice();
        copy[idx] = next;
        return copy;
      }
      return [...cur, next].slice(-100);
    });
  }

  async function handleSubmit() {
    const trimmed = draft.trim();
    if (!trimmed || isCommentClosed || posting) return;
    try {
      setPosting(true);
      setSubmitError(null);
      await postComment(eventId, {
        commentText: trimmed,
        clientRequestId: crypto.randomUUID()
      });
      setDraft("");
      setInputOpen(false);
      await refreshComments();
    } catch (err) {
      setSubmitError(formatSubmitError(err));
    } finally {
      setPosting(false);
    }
  }

  function toggleFullscreen() {
    if (!shellRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void shellRef.current.requestFullscreen();
    }
  }

  if (loading) {
    return <div className="viewer-shell"><div className="viewer-loading" /></div>;
  }

  return (
    <div
      className="viewer-shell"
      ref={shellRef}
      onClick={() => resetHideTimer()}
      onTouchStart={() => resetHideTimer()}
    >
      <div className="viewer-stage">
        <StreamPlayer playbackUid={page?.event.streamPlaybackUid ?? null} title={page?.event.title ?? eventId} />
        <CommentOverlay comments={visibleComments} visible={commentsVisible} />
      </div>

      <div className={`viewer-bar ${controlsVisible ? "is-visible" : ""}`}>
        {inputOpen ? (
          <>
            <div className="input-row">
              <input
                type="text"
                className="comment-input"
                value={draft}
                maxLength={COMMENT_MAX_LENGTH}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="コメントを入力..."
                disabled={!canEditComment}
                autoFocus
              />
              <button
                className="send-btn"
                disabled={!canSubmitComment}
                onClick={() => void handleSubmit()}
              >
                {posting ? "..." : "送信"}
              </button>
              <button className="icon-btn" onClick={() => setInputOpen(false)} aria-label="閉じる">
                x
              </button>
            </div>
            {roomState?.mode === "SLOW" ? (
              <p className="input-hint">連続投稿は少し間隔を空けて送信してください。</p>
            ) : null}
          </>
        ) : (
          <div className="controls-row">
            <button
              className="open-input-btn"
              onClick={() => {
                setInputOpen(true);
                setSubmitError(null);
                resetHideTimer();
              }}
              disabled={isCommentClosed}
            >
              コメントする...
            </button>
            <button
              className="icon-btn"
              onClick={() => setCommentsVisible((v) => !v)}
              aria-label={commentsVisible ? "コメントを非表示" : "コメントを表示"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {commentsVisible ? (
                  <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>
                ) : (
                  <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" opacity="0.3" /><line x1="3" y1="3" x2="21" y2="21" /></>
                )}
              </svg>
            </button>
            <button className="icon-btn" onClick={toggleFullscreen} aria-label="全画面">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        )}

        {inputOpen && submitError ? <p className="input-error">{submitError}</p> : null}
      </div>
    </div>
  );
}

function formatSubmitError(error: unknown) {
  if (!(error instanceof Error)) return "コメントの送信に失敗しました。";

  switch (error.name) {
    case "room_closed":
      return "現在コメント受付は停止中です。";
    case "slow_mode_active":
      return "連続投稿を制限しています。少し待ってから送信してください。";
    case "event_not_found":
      return "配信イベントが見つかりません。";
    case "payload_too_large":
      return "コメントが長すぎます。";
    default:
      return error.message || "コメントの送信に失敗しました。";
  }
}

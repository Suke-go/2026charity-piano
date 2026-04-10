import type {
  CommentDto,
  PublicEventResponse,
  RoomStateDto
} from "@charity/shared";
import { apiSchemas, SSE_EVENT_TYPES } from "@charity/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommentOverlay } from "../components/comment-overlay";
import { StreamPlayer } from "../components/stream-player";
import { TurnstileWidget } from "../components/turnstile-widget";
import { buildStreamUrl, COMMENT_MAX_LENGTH, fetchComments, fetchEvent, postComment } from "../lib/api-client";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
const TURNSTILE_ACTION = import.meta.env.VITE_TURNSTILE_ACTION?.trim() ?? "comment_post";
const TURNSTILE_DEV_TOKEN = import.meta.env.VITE_TURNSTILE_DEV_TOKEN?.trim() ?? "";

type StreamState = "connecting" | "live" | "reconnecting";

export function ViewerPage({ eventId }: { eventId: string }) {
  const [page, setPage] = useState<PublicEventResponse | null>(null);
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [commentsVisible, setCommentsVisible] = useState(true);
  const [inputOpen, setInputOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number>(0);
  const latestSeenAtRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const stableOnTokenChange = useCallback((value: string | null) => setTurnstileToken(value), []);

  // Auto-hide controls after 4s of inactivity (unless input is open)
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
      } catch { /* retry on next interval */ }
      finally { if (!cancelled) setLoading(false); }
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
      } catch { /* ignore */ }
    });

    stream.addEventListener(SSE_EVENT_TYPES.COMMENT_DELETED, (event) => {
      try {
        const payload = apiSchemas.commentStreamCommentDeleted.parse(JSON.parse((event as MessageEvent).data));
        setComments((cur) =>
          cur.map((c) => (c.commentId === payload.commentId ? { ...c, deletedFlag: true, displayStatus: "HIDDEN" } : c))
        );
      } catch { /* ignore */ }
    });

    stream.addEventListener(SSE_EVENT_TYPES.ROOM_STATE_UPDATED, (event) => {
      try {
        const payload = apiSchemas.commentStreamRoomStateUpdated.parse(JSON.parse((event as MessageEvent).data));
        setPage((cur) => (cur ? { ...cur, roomState: payload.roomState } : cur));
      } catch { /* ignore */ }
    });

    stream.addEventListener(SSE_EVENT_TYPES.SYNC_REQUIRED, () => { void refreshComments(); });

    return () => stream.close();
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => void refreshComments(), 20000);
    return () => clearInterval(interval);
  }, [eventId]);

  const visibleComments = useMemo(
    () => comments.filter((c) => c.displayStatus === "VISIBLE" && !c.deletedFlag),
    [comments]
  );

  const roomState: RoomStateDto | null = page?.roomState ?? null;
  const canPost = roomState?.mode === "OPEN" && !posting;
  const siteKeyConfigured = Boolean(TURNSTILE_SITE_KEY);
  const devTokenAvailable = Boolean(TURNSTILE_DEV_TOKEN);

  async function refreshComments() {
    try {
      const next = await fetchComments(eventId, 50);
      setComments(next);
      latestSeenAtRef.current = next.at(-1)?.serverReceivedAt ?? latestSeenAtRef.current;
    } catch { /* ignore */ }
  }

  function upsertComment(next: CommentDto) {
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
    if (!draft.trim()) return;
    const token = siteKeyConfigured ? turnstileToken : TURNSTILE_DEV_TOKEN;
    if (!token) return;
    try {
      setPosting(true);
      setSubmitError(null);
      await postComment(eventId, {
        commentText: draft.trim(),
        turnstileToken: token,
        clientRequestId: crypto.randomUUID()
      });
      setDraft("");
      setInputOpen(false);
      setTurnstileResetKey((k) => k + 1);
      await refreshComments();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to post");
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
      {/* Full-screen video + comment overlay */}
      <div className="viewer-stage">
        <StreamPlayer playbackUid={page?.event.streamPlaybackUid ?? null} title={page?.event.title ?? eventId} />
        <CommentOverlay comments={visibleComments} visible={commentsVisible} />
      </div>

      {/* Floating bottom bar — auto-hides */}
      <div className={`viewer-bar ${controlsVisible ? "is-visible" : ""}`}>
        {inputOpen ? (
          <div className="input-row">
            <input
              type="text"
              className="comment-input"
              value={draft}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="コメントを入力..."
              disabled={!canPost}
              autoFocus
            />
            <button
              className="send-btn"
              disabled={!canPost || !draft.trim() || (!siteKeyConfigured && !devTokenAvailable)}
              onClick={() => void handleSubmit()}
            >
              {posting ? "..." : "送信"}
            </button>
            <button className="icon-btn" onClick={() => setInputOpen(false)} aria-label="Close">✕</button>
          </div>
        ) : (
          <div className="controls-row">
            <button
              className="open-input-btn"
              onClick={() => { setInputOpen(true); resetHideTimer(); }}
              disabled={roomState?.mode === "CLOSED"}
            >
              コメントする...
            </button>
            <button
              className="icon-btn"
              onClick={() => setCommentsVisible((v) => !v)}
              aria-label={commentsVisible ? "Hide comments" : "Show comments"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {commentsVisible ? (
                  <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>
                ) : (
                  <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" opacity="0.3"/><line x1="3" y1="3" x2="21" y2="21"/></>
                )}
              </svg>
            </button>
            <button className="icon-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          </div>
        )}

        {/* Turnstile (hidden below input when active) */}
        {inputOpen && siteKeyConfigured ? (
          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            action={TURNSTILE_ACTION}
            resetKey={turnstileResetKey}
            onTokenChange={stableOnTokenChange}
          />
        ) : null}
        {inputOpen && submitError ? <p className="input-error">{submitError}</p> : null}
      </div>
    </div>
  );
}

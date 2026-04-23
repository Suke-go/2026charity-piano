import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { fetchFeed, type FeedItemDto } from "../lib/api-client";
import {
  type FloatingPlan,
  type LaneReservation,
  planFloatingItem,
  pruneReservations
} from "../lib/comment-layout";

const POLL_INTERVAL_MS = 2000;
const EMIT_INTERVAL_MS = 1600;
const VIEWPORT_FALLBACK = { width: 400, height: 720 };
const MAX_FLOATING = 24;

export function FloatingFeedView({ eventId }: { eventId: string }) {
  const [viewport, setViewport] = useState(VIEWPORT_FALLBACK);
  const [floating, setFloating] = useState<FloatingPlan[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const reservationsRef = useRef<LaneReservation[]>([]);
  const poolRef = useRef<FeedItemDto[]>([]);
  const emitCursorRef = useRef(0);
  const viewportRef = useRef(VIEWPORT_FALLBACK);
  const floatingRef = useRef<FloatingPlan[]>([]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    floatingRef.current = floating;
  }, [floating]);

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetchFeed(eventId);
        if (cancelled) return;
        poolRef.current = response.items;
      } catch {
        // Ignore transient errors; next tick retries.
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [eventId]);

  useEffect(() => {
    const sweep = window.setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((f) => f.startAt + f.durationMs > now));
      reservationsRef.current = pruneReservations(reservationsRef.current, now);
    }, 500);
    return () => window.clearInterval(sweep);
  }, []);

  useEffect(() => {
    const emitter = window.setInterval(() => {
      const pool = poolRef.current;
      if (pool.length === 0) return;

      const activeIds = new Set(floatingRef.current.map((plan) => plan.id));
      const available = pool.filter((item) => !activeIds.has(item.submissionId));
      const sourceList = available.length > 0 ? available : pool;

      if (sourceList.length === 0) return;

      const index = emitCursorRef.current % sourceList.length;
      emitCursorRef.current = (emitCursorRef.current + 1) % Math.max(1, sourceList.length);
      const item = sourceList[index];
      if (!item) return;

      tryFloat(item);
    }, EMIT_INTERVAL_MS);
    return () => window.clearInterval(emitter);
  }, []);

  function tryFloat(item: FeedItemDto) {
    const now = Date.now();
    setFloating((prev) => {
      const active = prev.filter((entry) => entry.startAt + entry.durationMs > now);
      const reservations = pruneReservations(reservationsRef.current, now);

      const result = planFloatingItem(
        { id: `${item.submissionId}-${now}`, text: item.answerText },
        {
          now,
          viewportWidth: viewportRef.current.width,
          viewportHeight: viewportRef.current.height,
          activeCount: active.length,
          reservations
        }
      );
      if (!result) {
        return prev;
      }

      reservations.push(result.reservation);
      reservationsRef.current = reservations;
      return [...active, result.plan].slice(-MAX_FLOATING);
    });
  }

  return (
    <main className="audience-phone">
      <section className="audience-frame audience-feed">
        <div className="comment-overlay" aria-live="polite" ref={overlayRef}>
          {floating.map((f) => (
            <div className="floating-comment" key={f.id} style={toStyle(f)}>
              {f.text}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function toStyle(plan: FloatingPlan): CSSProperties {
  return {
    "--comment-x": `${plan.xPx}px`,
    "--comment-start-y": `${plan.startY}px`,
    "--comment-end-y": `${plan.endY}px`,
    "--comment-drift-x": `${plan.driftX}px`,
    "--comment-duration": `${plan.durationMs}ms`,
    "--comment-delay": `${plan.delayMs}ms`,
    "--comment-width": `${plan.widthPx}px`
  } as CSSProperties;
}

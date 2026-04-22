import type { PublicCommentDto } from "@charity/shared";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  type FloatingCommentPlan,
  type LaneReservation,
  planFloatingComment,
  pruneReservations
} from "../lib/comment-layout";

export function CommentOverlay({
  comments,
  visible
}: {
  comments: PublicCommentDto[];
  visible: boolean;
}) {
  const [floating, setFloating] = useState<FloatingCommentPlan[]>([]);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const laneReservationsRef = useRef<LaneReservation[]>([]);
  const prevIdsRef = useRef(new Set<string>());
  const initializedRef = useRef(false);

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
    const prevIds = prevIdsRef.current;
    if (!initializedRef.current) {
      for (const comment of comments) {
        prevIds.add(comment.commentId);
      }
      initializedRef.current = true;
      return;
    }

    const newComments = comments.filter((c) => !prevIds.has(c.commentId));

    if (newComments.length > 0) {
      const now = Date.now();
      setFloating((prev) => {
        const active = prev.filter((entry) => entry.startAt + entry.durationMs > now);
        const reservations = pruneReservations(laneReservationsRef.current, now);
        const planned: FloatingCommentPlan[] = [];

        for (const comment of newComments) {
          const result = planFloatingComment(comment, {
            now,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            activeCount: active.length + planned.length,
            reservations
          });
          if (!result) continue;
          planned.push(result.plan);
          reservations.push(result.reservation);
        }

        laneReservationsRef.current = reservations;
        return [...active, ...planned].slice(-80);
      });
      for (const c of newComments) {
        prevIds.add(c.commentId);
      }
    }
  }, [comments, viewport.height, viewport.width]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((f) => f.startAt + f.durationMs > now));
      laneReservationsRef.current = pruneReservations(laneReservationsRef.current, now);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="comment-overlay" aria-live="polite" ref={overlayRef} data-visible={visible ? "true" : "false"}>
      {visible ? floating.map((f) => (
        <div
          className="floating-comment"
          data-priority={f.priority}
          data-mode={f.mode}
          key={f.id}
          style={toCommentStyle(f)}
        >
          {f.text}
        </div>
      )) : null}
    </div>
  );
}

function toCommentStyle(comment: FloatingCommentPlan): CSSProperties {
  return {
    "--comment-x": `${comment.xPx}px`,
    "--comment-start-y": `${comment.startY}px`,
    "--comment-end-y": `${comment.endY}px`,
    "--comment-drift-x": `${comment.driftX}px`,
    "--comment-duration": `${comment.durationMs}ms`,
    "--comment-delay": `${comment.delayMs}ms`,
    "--comment-width": `${comment.widthPx}px`
  } as CSSProperties;
}

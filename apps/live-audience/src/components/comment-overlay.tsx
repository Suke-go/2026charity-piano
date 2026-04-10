import type { CommentDto } from "@charity/shared";
import { useEffect, useRef, useState } from "react";

interface FloatingComment {
  id: string;
  text: string;
  createdAt: number;
}

const DISPLAY_DURATION_MS = 8000;

export function CommentOverlay({
  comments,
  visible
}: {
  comments: CommentDto[];
  visible: boolean;
}) {
  const [floating, setFloating] = useState<FloatingComment[]>([]);
  const prevIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const prevIds = prevIdsRef.current;
    const newComments = comments.filter((c) => !prevIds.has(c.commentId));

    if (newComments.length > 0) {
      const now = Date.now();
      const entries: FloatingComment[] = newComments.map((c) => ({
        id: c.commentId,
        text: c.commentText,
        createdAt: now
      }));

      setFloating((prev) => [...prev, ...entries].slice(-40));
      for (const c of newComments) {
        prevIds.add(c.commentId);
      }
    }
  }, [comments]);

  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - DISPLAY_DURATION_MS;
      setFloating((prev) => prev.filter((f) => f.createdAt > cutoff));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="comment-overlay" aria-live="polite">
      {floating.map((f) => (
        <div className="floating-comment" key={f.id}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

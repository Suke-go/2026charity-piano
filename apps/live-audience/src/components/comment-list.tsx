import type { CommentDto } from "@charity/shared";

export function CommentList({ comments }: { comments: CommentDto[] }) {
  if (comments.length === 0) {
    return <p className="muted">No visible comments yet.</p>;
  }

  return (
    <div className="comment-list">
      {comments.map((comment) => (
        <article className="comment-card" key={comment.commentId}>
          <div className="comment-meta">
            <span className="comment-time">{formatTime(comment.serverReceivedAt)}</span>
            <span className="comment-state">{comment.moderationStatus}</span>
          </div>
          <p>{comment.commentText}</p>
        </article>
      ))}
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

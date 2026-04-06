import { COMMENT_MAX_LENGTH } from "../lib/api-client";
import { TurnstileWidget } from "./turnstile-widget";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
const TURNSTILE_ACTION = import.meta.env.VITE_TURNSTILE_ACTION?.trim() ?? "comment_post";
const TURNSTILE_DEV_TOKEN = import.meta.env.VITE_TURNSTILE_DEV_TOKEN?.trim() ?? "";

interface CommentFormProps {
  disabled: boolean;
  draft: string;
  error: string | null;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (turnstileToken: string) => void;
  onTokenChange: (value: string | null) => void;
  token: string | null;
  resetKey: number;
}

export function CommentForm({
  disabled,
  draft,
  error,
  busy,
  onDraftChange,
  onSubmit,
  onTokenChange,
  token,
  resetKey
}: CommentFormProps) {
  const siteKeyConfigured = Boolean(TURNSTILE_SITE_KEY);
  const devTokenAvailable = Boolean(TURNSTILE_DEV_TOKEN);

  return (
    <form
      className="comment-form"
      onSubmit={(event) => {
        event.preventDefault();
        const turnstileToken = siteKeyConfigured ? token : TURNSTILE_DEV_TOKEN;
        if (!turnstileToken) return;
        onSubmit(turnstileToken);
      }}
    >
      <label className="field">
        <span>Comment</span>
        <textarea
          rows={5}
          value={draft}
          maxLength={COMMENT_MAX_LENGTH}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Write a short message for the live timeline."
          disabled={disabled}
        />
      </label>

      {siteKeyConfigured ? (
        <TurnstileWidget
          siteKey={TURNSTILE_SITE_KEY}
          action={TURNSTILE_ACTION}
          resetKey={resetKey}
          onTokenChange={onTokenChange}
        />
      ) : (
        <p className="muted small">
          {devTokenAvailable
            ? "Using the dev turnstile token for local verification."
            : "Comment posting needs a Turnstile site key before public use."}
        </p>
      )}

      {error ? <p className="error compact">{error}</p> : null}

      <div className="form-footer">
        <small className="muted">{draft.length}/{COMMENT_MAX_LENGTH}</small>
        <button type="submit" disabled={disabled || (!siteKeyConfigured && !devTokenAvailable) || !draft.trim()}>
          {busy ? "Posting..." : "Post comment"}
        </button>
      </div>
    </form>
  );
}

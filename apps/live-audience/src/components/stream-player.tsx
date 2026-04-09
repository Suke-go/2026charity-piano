import { buildPlaybackUrl } from "../lib/api-client";

export function StreamPlayer({ playbackUid, title }: { playbackUid: string | null; title: string }) {
  const src = buildPlaybackUrl(playbackUid);

  if (!src) {
    return (
      <div className="stream-fallback">
        <strong>Stream playback is not configured yet.</strong>
        <p>Set the Cloudflare Stream playback UID on the event before public release.</p>
      </div>
    );
  }

  return (
    <div className="stream-shell">
      <iframe
        className="stream-frame"
        src={src}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

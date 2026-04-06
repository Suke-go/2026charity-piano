export function StreamPlayer({ playbackUid, title }: { playbackUid: string | null; title: string }) {
  if (!playbackUid) {
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
        src={`https://iframe.videodelivery.net/${playbackUid}`}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

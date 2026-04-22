import { ViewerPage } from "./routes/viewer-page";

const DEFAULT_EVENT_ID = import.meta.env.VITE_DEFAULT_EVENT_ID?.trim() || "concert-2026-04-25";

function resolveEventId(pathname: string) {
  const match = pathname.match(/^\/events\/([^/]+)$/);
  if (match?.[1]) return match[1];
  if ((pathname === "/" || pathname === "") && DEFAULT_EVENT_ID) return DEFAULT_EVENT_ID;
  return null;
}

export default function App() {
  const eventId = resolveEventId(window.location.pathname);

  if (!eventId) {
    return (
      <main className="page shell">
        <section className="hero-card">
          <p className="eyebrow">Lets Play For Peace</p>
          <h1>Live Viewer is not mapped to an event yet.</h1>
          <p className="hero-copy">
            Set <code>VITE_DEFAULT_EVENT_ID</code> for the root path, or open <code>/events/&lt;eventId&gt;</code>
            directly.
          </p>
          <div className="hero-actions">
            <a className="button-link" href="/events/concert-2026-04-25">Open sample event</a>
          </div>
        </section>
      </main>
    );
  }

  return <ViewerPage eventId={eventId} />;
}

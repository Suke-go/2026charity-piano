import { AdminPage } from "./routes/admin-page";
import { ViewerPage } from "./routes/viewer-page";

const DEFAULT_EVENT_ID = import.meta.env.VITE_DEFAULT_EVENT_ID ?? "local-feedback";

function buildAudiencePath(eventId: string) {
  return eventId === DEFAULT_EVENT_ID ? "/" : `/events/${eventId}`;
}

function buildAdminFallbackPath(eventId: string) {
  return eventId === DEFAULT_EVENT_ID ? "/admin" : `/admin/events/${eventId}`;
}

function matchRoute(pathname: string) {
  if (pathname === "/") {
    return { type: "viewer" as const, eventId: DEFAULT_EVENT_ID };
  }
  if (pathname === "/admin") {
    return { type: "admin" as const, eventId: DEFAULT_EVENT_ID };
  }
  const viewerMatch = pathname.match(/^\/events\/([^/]+)$/);
  if (viewerMatch?.[1]) {
    return { type: "viewer" as const, eventId: viewerMatch[1] };
  }
  const adminMatch = pathname.match(/^\/admin\/events\/([^/]+)$/);
  if (adminMatch?.[1]) {
    return { type: "admin" as const, eventId: adminMatch[1] };
  }
  return null;
}

export default function App() {
  const route = matchRoute(window.location.pathname);

  if (!route) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Route Fallback</p>
          <h1>Use the local audience or admin entrypoint</h1>
          <p className="lead">
            This host supports a simple canonical URL layout. The root path opens the default audience page,
            and the same-host admin fallback remains available when needed.
          </p>
        </section>

        <section className="grid two-up">
          <article className="panel">
            <h2>Audience</h2>
            <p className="muted">
              Canonical audience URL for the default event.
            </p>
            <a className="button-link" href={buildAudiencePath(DEFAULT_EVENT_ID)}>
              {buildAudiencePath(DEFAULT_EVENT_ID)}
            </a>
          </article>

          <article className="panel">
            <h2>Admin Fallback</h2>
            <p className="muted">
              Same-host fallback if `admin.local` is not available.
            </p>
            <a className="button-link secondary" href={buildAdminFallbackPath(DEFAULT_EVENT_ID)}>
              {buildAdminFallbackPath(DEFAULT_EVENT_ID)}
            </a>
          </article>
        </section>

        <section className="panel">
          <h2>Explicit Event URLs</h2>
          <p className="muted">
            For non-default events, use `/events/&lt;eventId&gt;` on `live.local` and `/events/&lt;eventId&gt;`
            on `admin.local`.
          </p>
        </section>
      </main>
    );
  }

  if (route.type === "admin") {
    return <AdminPage eventId={route.eventId} />;
  }

  return <ViewerPage eventId={route.eventId} />;
}

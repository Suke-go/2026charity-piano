import { AdminPage } from "./routes/admin-page";
import { ViewerPage } from "./routes/viewer-page";

function matchRoute(pathname: string) {
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
          <p className="eyebrow">Local AP Feedback</p>
          <h1>Prompt-driven local answer collection</h1>
          <p className="lead">
            Audience devices open the current prompt page, submit one answer, and the admin page manages
            prompts, collection state, moderation, and export.
          </p>
        </section>

        <section className="grid two-up">
          <article className="panel">
            <h2>Audience</h2>
            <p className="muted">
              Open the current prompt, write one answer, and submit it to the local SQLite-backed API.
            </p>
            <a className="button-link" href="/events/local-feedback">/events/local-feedback</a>
          </article>

          <article className="panel">
            <h2>Admin</h2>
            <p className="muted">
              Create prompts, open or close collection, review answers, hide records, and export JSON.
            </p>
            <a className="button-link secondary" href="/admin/events/local-feedback">
              /admin/events/local-feedback
            </a>
          </article>
        </section>
      </main>
    );
  }

  if (route.type === "admin") {
    return <AdminPage eventId={route.eventId} />;
  }

  return <ViewerPage eventId={route.eventId} />;
}

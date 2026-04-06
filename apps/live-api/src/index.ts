import { Hono } from "hono";
import type { AppVariables, Env } from "./env";
import { registerPublicEventRoutes } from "./routes/public/events";
import { registerPublicCommentRoutes } from "./routes/public/comments";
import { registerPublicStreamRoutes } from "./routes/public/stream";
import { registerAdminEventRoutes } from "./routes/admin/events";
import { registerAdminCommentRoutes } from "./routes/admin/comments";
import { verifyAccessJwt } from "./middleware/access-auth";
import { corsMiddleware } from "./middleware/cors";
import { requestId } from "./middleware/request-id";
import { handleError, handleNotFound } from "./middleware/error-handler";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", requestId());
app.use("*", corsMiddleware());

app.get("/healthz", (c) => c.json({ ok: true }));

registerPublicEventRoutes(app);
registerPublicCommentRoutes(app);
registerPublicStreamRoutes(app);

app.use("/api/admin/*", verifyAccessJwt);
registerAdminEventRoutes(app);
registerAdminCommentRoutes(app);

app.onError(handleError);
app.notFound(handleNotFound);

export default app;
export { CommentRoom } from "./durable/comment-room";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env";
import authRoutes from "./routes/auth";
import slackRoutes from "./routes/slack";
import emailRoutes from "./routes/emails";
import senderRoutes from "./routes/senders";
import { emailQueue } from "./queues/emailQueue";
import { reconcileScheduledEmails } from "./queues/scheduler";
import { ensureIndex } from "./services/elasticsearch";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- Live BullMQ dashboard for real-time queue visibility ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
// Cast: @bull-board's BullMQAdapter types lag slightly behind fast-moving
// bullmq minor releases (progress typing in particular); this is a known,
// harmless mismatch that doesn't affect runtime behavior.
createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/auth", slackRoutes);
app.use("/api", emailRoutes);
app.use("/api", senderRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  await ensureIndex();
  await reconcileScheduledEmails(); // restart-safety: rebuild any missing delayed jobs from Postgres

  app.listen(env.PORT, () => {
    console.log(`[server] listening on ${env.BACKEND_URL}`);
    console.log(`[server] BullMQ dashboard: ${env.BACKEND_URL}/admin/queues`);
    console.log(`[server] Run "npm run worker:dev" in another terminal to start processing jobs.`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

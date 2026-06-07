// Loop API Server — Express application
// LILCKY STUDIO LIMITED

import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestLogger } from "./middlewares/requestLogger";

const app: Express = express();

// ── Structured request logging (traceId + latencyMs on every request) ─────────
// Must be first so every downstream handler has req.traceId available.
app.use(requestLogger);

// ── Pino HTTP transport (structured access log) ───────────────────────────────
app.use(
  pinoHttp({
    logger,
    // requestLogger already emits the per-request log; pinoHttp handles the
    // transport-level access log with lower-level detail (useful in production).
    autoLogging: false,
    serializers: {
      req(req) {
        return {
          id:     req.id,
          method: req.method,
          url:    req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;

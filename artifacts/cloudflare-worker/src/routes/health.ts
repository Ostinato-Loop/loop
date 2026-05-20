import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const health = new Hono<{ Bindings: CloudflareEnv }>();

/**
 * GET /api/health
 * Liveness check. Returns worker status + binding availability.
 * Used by monitoring and deployment pipelines.
 */
health.get("/", (c) => {
  return c.json({
    ok: true,
    service: "loop-api",
    version: "1.0.0",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    bindings: {
      db:           typeof c.env.DB !== "undefined",
      cache:        typeof c.env.CACHE !== "undefined",
      media:        typeof c.env.MEDIA !== "undefined",
      taskQueue:    typeof c.env.TASK_QUEUE !== "undefined",
      roomSession:  typeof c.env.ROOM_SESSION !== "undefined",
      ai:           typeof c.env.AI !== "undefined",
    },
  });
});

export { health };

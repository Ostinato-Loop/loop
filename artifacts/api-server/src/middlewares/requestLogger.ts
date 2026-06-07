// Loop API — requestLogger middleware
// Attaches a UUID traceId to every request, sets X-Trace-Id response header,
// and emits a structured JSON log line on response finish.
// Every log line includes: traceId, method, path, userId, statusCode, latencyMs, timestamp
// LILCKY STUDIO LIMITED

import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

declare module "express-serve-static-core" {
  interface Request {
    traceId: string;
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const traceId = randomUUID();
  const start   = Date.now();

  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  res.on("finish", () => {
    const userId = (req as Request & { userId?: string }).userId ?? null;
    logger.info(
      {
        traceId,
        method:     req.method,
        path:       req.path,
        userId,
        statusCode: res.statusCode,
        latencyMs:  Date.now() - start,
        timestamp:  new Date().toISOString(),
      },
      "http",
    );
  });

  next();
}

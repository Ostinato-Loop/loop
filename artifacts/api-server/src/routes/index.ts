// Loop API — Route Registry
// Trust & Retention Sprint — Phase N
// LILCKY STUDIO LIMITED

import { Router, type IRouter } from "express";
import healthRouter        from "./health";
import authRouter          from "./auth";
import notificationsRouter from "./notifications";
import friendRequestsRouter from "./friend-requests";
import audioRouter         from "./audio";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth",            authRouter);
router.use("/audio",           audioRouter);          // GET /api/audio/token — LiveKit JWT (P0-001)
router.use("/notifications",   notificationsRouter);
router.use("/notify",          notificationsRouter);  // /api/notify/dm webhook
router.use("/friend-requests", friendRequestsRouter);

export default router;

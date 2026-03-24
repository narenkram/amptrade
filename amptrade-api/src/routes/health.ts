import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const authHeader = req.headers["x-health-secret"];
  if (authHeader !== process.env.HEALTH_CHECK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

export default router;

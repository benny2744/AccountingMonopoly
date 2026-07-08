import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { issueAdminToken, requireAdmin, verifyCredentials } from "../services/adminService.js";
import { GameError } from "../services/gameService.js";

export const adminRouter: RouterType = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

adminRouter.post("/login", (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    if (!verifyCredentials(username, password)) {
      throw new GameError("NOT_ADMIN", "Invalid username or password");
    }
    res.json({ adminToken: issueAdminToken() });
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/verify", (req, res, next) => {
  try {
    requireAdmin(req.header("X-Admin-Token"));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

import express from "express";
import { login, logout, getMe, getUsers, changePassword, changeUsername, register, googleLogin } from "../controllers/auth.js";
import { setup2fa, verify2faSetup, disable2fa, login2fa } from "../controllers/auth2fa.js";
import { requireAuth } from "../middleware/auth.js";
import { createAuthRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

const authLimiter = createAuthRateLimiter();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/google", authLimiter, googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
router.get("/users", requireAuth, getUsers);
router.put("/password", requireAuth, changePassword);
router.put("/username", requireAuth, changeUsername);

// TOTP two-factor authentication
router.post("/2fa/setup", requireAuth, setup2fa);
router.post("/2fa/verify", requireAuth, verify2faSetup);
router.post("/2fa/disable", requireAuth, disable2fa);
router.post("/2fa/login", authLimiter, login2fa);

export default router;

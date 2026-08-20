import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { readJSON, writeJSON } from "../services/db.js";

import { getJwtSecret, getJwtExpires } from "../config.js";
import { recordAuthFailure, clearAuthFailures } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { setSessionCookies, clearSessionCookies } from "../services/session.js";

const JWT_SECRET = getJwtSecret();

export const register = async (req: Request, res: Response) => {
  const settings = await readJSON("settings.json") || {};
  if (settings.enableRegistration === false) {
    res.status(403).json({ error: "User registration is currently disabled by administrator." });
    return;
  }

  const { username, password, confirmPassword } = req.body;

  if (!username || !password || !confirmPassword) {
    res.status(400).json({ error: "Username, password, and confirm password are required" });
    return;
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const users = await readJSON("users.json") || [];
  const existingUser = users.find((u: any) => u.username.toLowerCase() === cleanUsername.toLowerCase());

  if (existingUser) {
    res.status(400).json({ error: "Username is already taken" });
    return;
  }

  const { writeJSON } = await import("../services/db.js");
  const hashedPassword = await bcrypt.hash(password, 12);
  
  const newUser = {
    id: "user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    username: cleanUsername,
    password: hashedPassword,
    role: "user",
    passwordVersion: 0
  };

  users.push(newUser);
  await writeJSON("users.json", users);
  void audit("auth.register", { username: cleanUsername, ip: req.ip });

  res.status(201).json({
    message: "User registered successfully",
    user: { id: newUser.id, username: newUser.username, role: newUser.role }
  });
};

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const users = (await readJSON("users.json")) || [];
  const user = users.find((u: any) => u.username === username);

  // Development convenience mode is STRICTLY limited to explicit dev
  // environments. Production is never allowed to auto-create or skip the
  // password check, regardless of which port the panel runs on.
  const isDevMode =
    process.env.NODE_ENV !== "production" &&
    (process.env.PORT === "30000" || process.env.DEV_MODE === "true" || process.env.PANEL_DEV_MODE === "true");

  if (isDevMode && !user) {
    // First-boot / dev convenience: create the account on the fly.
    const { writeJSON } = await import("../services/db.js");
    const hashedPassword = await bcrypt.hash(password, 12);
    const isFirstUser = users.length === 0;
    const devUser = {
      id: "dev-user-" + Math.random().toString(36).substr(2, 9),
      username,
      password: hashedPassword,
      role: isFirstUser || username === "admin" ? "owner" : "user",
      passwordVersion: 0
    };
    users.push(devUser);
    await writeJSON("users.json", users);

    const token = jwt.sign(
      { id: devUser.id, username: devUser.username, role: devUser.role, passwordVersion: 0 },
      JWT_SECRET,
      { expiresIn: getJwtExpires() }
    );
    setSessionCookies(res, token);
    res.json({ token, user: { id: devUser.id, username: devUser.username, role: devUser.role } });
    return;
  }

  if (!user) {
    recordAuthFailure(username);
    void audit("auth.login_failed", { username, ip: req.ip });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Always verify the password - also in dev mode for existing accounts.
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    recordAuthFailure(username);
    void audit("auth.login_failed", { username, ip: req.ip });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  clearAuthFailures(username);
  void audit("auth.login", { username, ip: req.ip });

  // RHLZ: if the account has TOTP enabled, the password alone is not
  // enough - issue a short-lived step-up token and require the 2FA code.
  if (user.totp?.enabled && user.totp.secretEnc) {
    const tempToken = jwt.sign(
      { id: user.id, scope: "2fa", passwordVersion: user.passwordVersion || 0 },
      JWT_SECRET,
      { expiresIn: "5m" }
    );
    return res.json({ twoFactorRequired: true, tempToken, username: user.username });
  }

  const role = user.role || "admin";
  const token = jwt.sign(
    { id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: getJwtExpires() }
  );

  setSessionCookies(res, token);
  res.json({ token, user: { id: user.id, username: user.username, role } });
};

export const logout = (req: Request, res: Response) => {
  clearSessionCookies(res);
  res.json({ message: "Logged out" });
};

export const getMe = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  if (reqUser && reqUser.id !== "temp-admin") {
    const users = await readJSON("users.json") || [];
    const dbUser = users.find((u: any) => u.id === reqUser.id);
    if (dbUser) {
      return res.json({
        user: {
          ...reqUser,
          googleId: dbUser.googleId || null,
          isGoogleUser: !!(dbUser.googleId || !dbUser.password),
          totpEnabled: !!(dbUser.totp?.enabled)
        }
      });
    }
  }
  res.json({ user: reqUser });
};

export const getUsers = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  if (!reqUser || (reqUser.role !== "admin" && reqUser.role !== "owner")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const users = await readJSON("users.json") || [];
  res.json(users.map((u: any) => ({ id: u.id, username: u.username, role: u.role, isGoogleUser: !!u.googleId })));
};

export const changeUsername = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { newUsername } = req.body;

  if (!newUsername || typeof newUsername !== "string" || newUsername.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters long." });
  }

  const cleanUsername = newUsername.trim();

  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change username of default admin account." });
  }

  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u: any) => u.id === reqUser.id);

  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!users[userIndex].googleId) {
    return res.status(400).json({ error: "Username change is only available for Google authenticated accounts." });
  }

  const existingUser = users.find((u: any) => u.id !== reqUser.id && u.username && u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: `Username '${cleanUsername}' is already taken.` });
  }

  users[userIndex].username = cleanUsername;
  await writeJSON("users.json", users);

  res.json({ success: true, username: cleanUsername });
};

export const changePassword = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { oldPassword, newPassword } = req.body;
  
  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change password of default admin account. Create a new admin user instead." });
  }

  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u: any) => u.id === reqUser.id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (users[userIndex].googleId || !users[userIndex].password) {
    return res.status(400).json({ error: "Password change is disabled for Google Auth accounts." });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  
  const isMatch = await bcrypt.compare(oldPassword || "", users[userIndex].password);
  if (!isMatch) {
    return res.status(401).json({ error: "Incorrect old password" });
  }

  // Use dynamic import for writeJSON since it's in another file
  const { writeJSON } = await import("../services/db.js");
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  users[userIndex].password = hashedPassword;
  users[userIndex].passwordVersion = (users[userIndex].passwordVersion || 0) + 1;
  await writeJSON("users.json", users);
  
  res.json({ success: true });
};

export const googleLogin = async (req: Request, res: Response) => {
  const { email, googleId, name, photoURL, idToken, credential } = req.body;

  const googleIdToken = idToken || credential;
  const insecure = process.env.GOOGLE_AUTH_INSECURE === "1" && process.env.NODE_ENV !== "production";
  if (!insecure) {
    if (!googleIdToken || typeof googleIdToken !== "string") {
      res.status(401).json({
        error: "Google Sign-In requires a verified ID token. Set GOOGLE_AUTH_INSECURE=1 only for local development.",
      });
      return;
    }
    try {
      const { default: axios } = await import("axios");
      const info = await axios.get("https://oauth2.googleapis.com/tokeninfo", {
        params: { id_token: googleIdToken },
        timeout: 8000,
      });
      const aud = process.env.GOOGLE_CLIENT_ID;
      if (aud && info.data?.aud !== aud) {
        res.status(401).json({ error: "Google token audience mismatch" });
        return;
      }
      if (!info.data?.email || (email && info.data.email.toLowerCase() !== String(email).toLowerCase())) {
        res.status(401).json({ error: "Google token email mismatch" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Google ID token verification failed" });
      return;
    }
  }

  if (!email) {
    res.status(400).json({ error: "Google email is required" });
    return;
  }
  // Track this attempt; cleared below when authentication succeeds.
  recordAuthFailure(email);

  const settings = await readJSON("settings.json") || {};
  if (settings.enableGoogleLogin === false) {
    res.status(403).json({ error: "Google Login is disabled on this panel." });
    return;
  }

  // Derive username from Gmail (e.g. jishnumondal32@gmail.com -> jishnumondal32)
  const emailPrefix = email.split("@")[0].replace(/[^a-zA-Z0-9_.]/g, "");
  const baseUsername = emailPrefix || "user";

  const users = await readJSON("users.json") || [];
  let user = users.find((u: any) => (u.email && u.email.toLowerCase() === email.toLowerCase()) || (u.googleId && u.googleId === googleId) || (u.username && u.username.toLowerCase() === baseUsername.toLowerCase()));

  if (!user) {
    // If no users exist yet in system at all, make this user an owner!
    const isFirstUser = users.length === 0;
    const role = isFirstUser ? "owner" : "user";

    const { writeJSON } = await import("../services/db.js");
    user = {
      id: "google-user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      username: baseUsername,
      email,
      googleId,
      role,
      avatar: photoURL || "",
      passwordVersion: 0,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeJSON("users.json", users);
  } else {
    // Link email & googleId if missing
    let updated = false;
    if (!user.email) { user.email = email; updated = true; }
    if (!user.googleId) { user.googleId = googleId; updated = true; }
    if (photoURL && !user.avatar) { user.avatar = photoURL; updated = true; }
    if (updated) {
      const { writeJSON } = await import("../services/db.js");
      await writeJSON("users.json", users);
    }
  }

  clearAuthFailures(email);
  void audit("auth.google_login", { email, ip: req.ip });

  const role = user.role || "admin";
  const token = jwt.sign(
    { id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: getJwtExpires() }
  );

  setSessionCookies(res, token);
  res.json({ 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      role, 
      email: user.email, 
      avatar: user.avatar,
      googleId: user.googleId,
      isGoogleUser: true 
    } 
  });
};
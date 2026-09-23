import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type Session = {
  expiresAt: number;
};

const sessions = new Map<string, Session>();
const failedLogins = new Map<string, { count: number; blockedUntil: number }>();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const COOKIE_NAME = "texvic_owner_session";

const PUBLIC_PATHS = new Set([
  "/owner-login",
  "/api/auth/owner/login",
  "/api/auth/owner/logout",
  "/api/auth/owner/status",
  "/auth/instagram/callback",
  "/auth/instagram/callback/",
  "/api/webhooks/instagram",
]);

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map(part => {
      const index = part.indexOf("=");
      if (index < 0) return [part.trim(), ""];
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    })
  );
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split("$");
  if (parts.length !== 5 || parts[0] !== "scrypt") return false;

  const [, nText, rText, pText, saltHex, hashHex] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 16384 || r < 8 || p < 1) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

function issueSession(res: Response): void {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSession(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function hasValidSession(req: Request): boolean {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
}

function isPublicPath(req: Request): boolean {
  return PUBLIC_PATHS.has(req.path);
}

function loginPage(error = ""): string {
  const escapedError = error.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] || char));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEXVIC — Owner Access</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#080b12;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}
.card{width:min(420px,100%);background:rgba(15,23,42,.82);border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.45);backdrop-filter:blur(18px)}
.logo{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#22d3ee,#8b5cf6,#ec4899);font-weight:900;color:#fff;margin-bottom:22px}
h1{font-size:24px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px}
label{display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:8px}
input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#fff;outline:none;font-size:15px}
input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.14)}
button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:12px;background:linear-gradient(135deg,#06b6d4,#8b5cf6,#ec4899);color:#fff;font-weight:800;cursor:pointer}
.error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:10px 12px;border-radius:10px;font-size:12px;margin-bottom:16px}
.badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);color:#c4b5fd;font-size:11px;font-weight:700;margin-bottom:14px}
</style>
</head>
<body>
<form class="card" method="post" action="/api/auth/owner/login">
<div class="logo">TX</div>
<div class="badge">OWNER ACCESS ONLY</div>
<h1>Welcome to TEXVIC</h1>
<p>This dashboard is private. Authenticate with the owner credential to continue.</p>
${escapedError ? `<div class="error">${escapedError}</div>` : ""}
<label for="password">Owner password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Unlock TEXVIC</button>
</form>
</body>
</html>`;
}

export function ownerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS" || isPublicPath(req)) {
    next();
    return;
  }

  if (hasValidSession(req)) {
    next();
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ success: false, error: "Owner authentication required." });
    return;
  }

  res.redirect("/owner-login");
}

export function ownerAuthRoutes(req: Request, res: Response): boolean {
  if (req.method === "GET" && req.path === "/owner-login") {
    if (hasValidSession(req)) {
      res.redirect("/");
    } else {
      res.status(200).type("html").send(loginPage());
    }
    return true;
  }

  if (req.method === "POST" && req.path === "/api/auth/owner/login") {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const state = failedLogins.get(ip);

    if (state && state.blockedUntil > now) {
      res.status(429).type("html").send(loginPage("Too many failed attempts. Try again in a few minutes."));
      return true;
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const passwordHash = process.env.TEXVIC_OWNER_PASSWORD_HASH || "";

    if (!passwordHash || !verifyPassword(password, passwordHash)) {
      const nextState = state && state.blockedUntil <= now
        ? { count: state.count + 1, blockedUntil: 0 }
        : { count: 1, blockedUntil: 0 };

      if (nextState.count >= MAX_FAILED_LOGINS) {
        nextState.blockedUntil = now + LOGIN_WINDOW_MS;
      }

      failedLogins.set(ip, nextState);
      res.status(401).type("html").send(loginPage("Invalid owner password."));
      return true;
    }

    failedLogins.delete(ip);
    issueSession(res);
    res.redirect("/");
    return true;
  }

  if (req.method === "POST" && req.path === "/api/auth/owner/logout") {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) sessions.delete(token);
    clearSession(res);
    res.json({ success: true });
    return true;
  }

  if (req.method === "GET" && req.path === "/api/auth/owner/status") {
    res.json({ success: true, authenticated: hasValidSession(req) });
    return true;
  }

  return false;
}

export function startAuthMaintenance(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [ip, state] of failedLogins) {
      if (state.blockedUntil && state.blockedUntil <= now) failedLogins.delete(ip);
    }
  }, 15 * 60 * 1000).unref();
}

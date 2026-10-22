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
  "/api/video-worker/claim",
  "/api/video-worker/jobs/",
  "/api/health",
  "/api/auth/instagram/sync-token",
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

function constantTimeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.trim()) return xRealIp.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

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

function issueSession(res: Response, req?: Request): void {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });

  const isHttps = Boolean(
    (req && (req.protocol === "https" || req.get("x-forwarded-proto") === "https")) ||
    (process.env.NODE_ENV === "production" && process.env.APP_URL?.startsWith("https"))
  );
  const secureFlag = isHttps ? " Secure;" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSession(res: Response, req?: Request): void {
  const isHttps = Boolean(
    (req && (req.protocol === "https" || req.get("x-forwarded-proto") === "https")) ||
    (process.env.NODE_ENV === "production" && process.env.APP_URL?.startsWith("https"))
  );
  const secureFlag = isHttps ? " Secure;" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=0`
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
  if (PUBLIC_PATHS.has(req.path)) return true;
  return req.path.startsWith("/api/video-worker/jobs/") || req.path.startsWith("/media/reels/") || req.path.startsWith("/media/posts/");
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
<form class="card" method="post" action="/owner-login">
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

  // 1. Cross-Site Request Forgery (CSRF) & Origin Defense
  const origin = req.headers.origin ? String(req.headers.origin) : '';
  const secFetchSite = req.headers['sec-fetch-site'] ? String(req.headers['sec-fetch-site']) : '';
  const currentHost = String(req.get('host') || '').toLowerCase();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').toLowerCase();

  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      let appUrlHost = '';
      if (process.env.APP_URL) {
        try { appUrlHost = new URL(process.env.APP_URL).host.toLowerCase(); } catch {}
      }
      const isAllowedOrigin =
        originHost === currentHost ||
        (forwardedHost && (originHost === forwardedHost || originHost === forwardedHost.split(':')[0])) ||
        (appUrlHost && originHost === appUrlHost) ||
        originHost.endsWith('.trycloudflare.com') ||
        originHost.endsWith('.cloudflarestream.com') ||
        originHost === 'texvic.ai' ||
        originHost.endsWith('.texvic.ai') ||
        originHost === 'texvic.tech' ||
        originHost.endsWith('.texvic.tech') ||
        originHost.startsWith('localhost') ||
        originHost.startsWith('127.0.0.1');

      if (!isAllowedOrigin && !hasValidSession(req)) {
        res.status(403).json({ success: false, error: "Cross-origin request rejected." });
        return;
      }
    } catch {
      res.status(403).json({ success: false, error: "Malformed Origin header." });
      return;
    }
  } else if (secFetchSite === 'cross-site' && !hasValidSession(req)) {
    res.status(403).json({ success: false, error: "Cross-site request rejected." });
    return;
  }

  // 2. Check reverse proxy headers
  const hasProxyHeader = Boolean(
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"]
  );

  const host = currentHost;
  const isExternalHost = !host.startsWith("localhost") && !host.startsWith("127.0.0.1");
  const ip = req.ip || req.socket.remoteAddress || "";
  
  // Direct loopback is trusted ONLY for non-proxied local requests with valid local origin
  const isDirectLoopback = !hasProxyHeader && !isExternalHost && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");

  // Mutating requests or live stream across loopback still require valid session or same-origin
  if (hasValidSession(req) || (isDirectLoopback && (!origin || origin.includes(currentHost)))) {
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

  if (req.method === "POST" && (req.path === "/owner-login" || req.path === "/api/auth/owner/login")) {
    const ip = getClientIp(req);
    const now = Date.now();
    const state = failedLogins.get(ip);

    if (state && state.blockedUntil > now) {
      res.status(429).type("html").send(loginPage("Too many failed attempts. Try again in a few minutes."));
      return true;
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const passwordHash = process.env.TEXVIC_OWNER_PASSWORD_HASH || "";
    const plainPassword = process.env.TEXVIC_OWNER_PASSWORD || "";

    const isMatch = Boolean(
      (plainPassword && constantTimeStringEqual(password, plainPassword)) ||
      (passwordHash && verifyPassword(password, passwordHash))
    );

    if (!isMatch) {
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
    issueSession(res, req);

    const isExplicitApiCall = req.path.startsWith('/api/') && req.is('json') && !req.headers.accept?.includes('text/html');
    if (isExplicitApiCall) {
      res.json({ success: true });
      return true;
    }

    res.redirect("/");
    return true;
  }

  if (req.method === "POST" && req.path === "/api/auth/owner/logout") {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) sessions.delete(token);
    clearSession(res, req);
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

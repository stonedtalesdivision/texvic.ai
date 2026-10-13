import { spawn, ChildProcess, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export interface TunnelStatus {
  activeUrl: string | null;
  isRunning: boolean;
  lastHealthCheck: string | null;
  isHealthy: boolean;
  error: string | null;
  restartCount: number;
}

let tunnelProcess: ChildProcess | null = null;
let currentUrl: string | null = null;
let isHealthy = false;
let lastHealthCheck: string | null = null;
let lastError: string | null = null;
let restartCount = 0;
let healthCheckTimer: NodeJS.Timeout | null = null;
let isRestarting = false;

function findCloudflaredBinary(): string {
  if (process.env.CLOUDFLARED_BIN && fs.existsSync(process.env.CLOUDFLARED_BIN)) {
    return process.env.CLOUDFLARED_BIN;
  }

  const commonWindowsPaths = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'cloudflared', 'cloudflared.exe')
  ];

  for (const p of commonWindowsPaths) {
    if (fs.existsSync(p)) return p;
  }

  return 'cloudflared';
}

function updateEnvFile(newAppUrl: string): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    let content = fs.readFileSync(envPath, 'utf8');
    if (/^APP_URL=.*$/m.test(content)) {
      content = content.replace(/^APP_URL=.*$/m, `APP_URL=${newAppUrl}`);
    } else {
      content += `\nAPP_URL=${newAppUrl}\n`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    process.env.APP_URL = newAppUrl;
    dotenv.config({ override: true });
    console.log(`[Tunnel Supervisor] 💾 .env updated with APP_URL=${newAppUrl}`);
  } catch (err: any) {
    console.warn(`[Tunnel Supervisor] Failed to update .env with new APP_URL:`, err?.message || err);
  }
}

function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, () => resolve());
    } else {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
      resolve();
    }
  });
}

async function verifyTunnelReachability(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Texvic-Tunnel-Watchdog/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    // As long as the tunnel forwarded to our local server (any HTTP response), it is alive.
    // 530 or 502 with text from cloudflare means tunnel is disconnected.
    if (res.status === 530) return false;
    return true;
  } catch (err: any) {
    clearTimeout(timeout);
    return false;
  }
}

export function getTunnelStatus(): TunnelStatus {
  return {
    activeUrl: currentUrl || process.env.APP_URL || null,
    isRunning: Boolean(tunnelProcess && !tunnelProcess.killed),
    lastHealthCheck,
    isHealthy,
    error: lastError,
    restartCount
  };
}

export async function restartTunnel(): Promise<void> {
  if (isRestarting) return;

  // Rate-limit breaker: If 5 consecutive tunnel attempts fail, pause for 10 minutes to protect CPU and memory
  if (restartCount >= 5) {
    console.warn(`[Tunnel Supervisor] ⚠️ Cloudflare quick-tunnel has reached 5 consecutive retries. Backing off for 10 minutes to protect VPS resources. Direct access remains active on port 3100.`);
    isHealthy = false;
    setTimeout(() => {
      restartCount = 0;
      restartTunnel().catch(console.error);
    }, 10 * 60 * 1000);
    return;
  }

  isRestarting = true;
  restartCount++;
  console.log(`[Tunnel Supervisor] 🔄 Initiating self-healing tunnel restart (attempt #${restartCount}/5)...`);

  if (tunnelProcess && tunnelProcess.pid) {
    await killProcessTree(tunnelProcess.pid);
    tunnelProcess = null;
  }

  isHealthy = false;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await startTunnelInternal();
  isRestarting = false;
}

function startTunnelInternal(): Promise<string> {
  return new Promise((resolve) => {
    const binPath = findCloudflaredBinary();
    const port = Number(process.env.PORT) || 3100;
    const tunnelToken = (process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
    const args = tunnelToken
      ? ['tunnel', 'run', '--token', tunnelToken]
      : ['tunnel', '--url', `http://localhost:${port}`];

    console.log(`[Tunnel Supervisor] 🚀 Spawning Cloudflare Tunnel via: ${binPath} ${tunnelToken ? 'tunnel run --token [MASKED]' : args.join(' ')}`);

    try {
      tunnelProcess = spawn(binPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (err: any) {
      lastError = `Failed to spawn cloudflared: ${err?.message || err}`;
      console.error(`[Tunnel Supervisor] ❌ ${lastError}`);
      resolve('');
      return;
    }

    if (tunnelToken) {
      const configuredUrl = (process.env.APP_URL || '').trim();
      currentUrl = configuredUrl;
      isHealthy = true;
      lastError = null;
      console.log(`[Tunnel Supervisor] 🌐 Permanent Cloudflare Tunnel Active: ${configuredUrl || 'Running via token'}`);
      resolve(configuredUrl);
      return;
    }

    let urlResolved = false;

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      // Ignore api.trycloudflare.com; match only assigned user subdomains
      const match = text.match(/https:\/\/(?!api\.)([a-zA-Z0-9-]+)\.trycloudflare\.com/i);
      if (match && !urlResolved) {
        const detectedUrl = match[0].trim();
        urlResolved = true;
        currentUrl = detectedUrl;
        isHealthy = true;
        restartCount = 0;
        lastError = null;
        updateEnvFile(detectedUrl);
        console.log(`[Tunnel Supervisor] 🌐 Cloudflare Tunnel Established: ${detectedUrl}`);
        resolve(detectedUrl);
      }
    };

    tunnelProcess.stdout?.on('data', handleOutput);
    tunnelProcess.stderr?.on('data', (chunk: Buffer) => {
      handleOutput(chunk);
      const text = chunk.toString().trim();
      if (text.includes('ERR') || text.includes('error') || text.includes('failed') || text.includes('429')) {
        console.warn(`[Tunnel Supervisor Cloudflared Log] ${text}`);
      }
    });

    tunnelProcess.on('error', (err) => {
      lastError = `Tunnel process error: ${err.message}`;
      console.error(`[Tunnel Supervisor] ❌ ${lastError}`);
      if (!urlResolved) resolve('');
    });

    tunnelProcess.on('exit', (code, signal) => {
      console.warn(`[Tunnel Supervisor] Tunnel process exited with code ${code}, signal ${signal}`);
      isHealthy = false;
      tunnelProcess = null;
      if (!isRestarting) {
        // Exponential backoff to avoid hammering Cloudflare quick-tunnel endpoints
        const delay = Math.min(60000, 5000 + (Math.min(restartCount, 12) * 5000));
        console.log(`[Tunnel Supervisor] Backing off: next tunnel retry in ${Math.round(delay / 1000)}s...`);
        setTimeout(() => {
          restartTunnel().catch(console.error);
        }, delay);
      }
    });

    // Timeout safety: if URL not detected in 25 seconds, resolve
    setTimeout(() => {
      if (!urlResolved) {
        console.warn(`[Tunnel Supervisor] Timed out waiting for trycloudflare URL in logs.`);
        resolve(currentUrl || '');
      }
    }, 25000);
  });
}

function startWatchdog(): void {
  if (healthCheckTimer) clearInterval(healthCheckTimer);

  healthCheckTimer = setInterval(async () => {
    const url = currentUrl || process.env.APP_URL;
    if (!url) return;

    lastHealthCheck = new Date().toISOString();
    const healthy = await verifyTunnelReachability(url);

    if (healthy) {
      isHealthy = true;
      lastError = null;
    } else {
      console.warn(`[Tunnel Supervisor] ⚠️ Cloudflare tunnel ${url} failed health check. Triggering self-healing recovery...`);
      isHealthy = false;
      lastError = 'Health check probe failed (tunnel down or expired)';
      await restartTunnel();
    }
  }, 45000);
}

export async function startTunnelSupervisor(): Promise<string> {
  const isAutoTunnelEnabled = process.env.CLOUDFLARE_AUTO_TUNNEL !== 'false';
  if (!isAutoTunnelEnabled) {
    console.log('[Tunnel Supervisor] Cloudflare auto-tunnel disabled via CLOUDFLARE_AUTO_TUNNEL=false.');
    return process.env.APP_URL || '';
  }

  // Check if current APP_URL is already online and healthy
  const existingUrl = (process.env.APP_URL || '').trim();
  if (existingUrl && existingUrl.includes('trycloudflare.com')) {
    const alreadyHealthy = await verifyTunnelReachability(existingUrl);
    if (alreadyHealthy) {
      console.log(`[Tunnel Supervisor] ✅ Existing Cloudflare tunnel is healthy: ${existingUrl}`);
      currentUrl = existingUrl;
      isHealthy = true;
      startWatchdog();
      return existingUrl;
    }
  }

  // If not healthy or not running, start fresh tunnel
  const url = await startTunnelInternal();
  startWatchdog();

  // Register clean shutdown
  const cleanShutdown = () => {
    if (tunnelProcess && tunnelProcess.pid) {
      console.log('[Tunnel Supervisor] Shutting down Cloudflare Tunnel child process...');
      killProcessTree(tunnelProcess.pid).catch(() => {});
    }
  };

  process.once('SIGINT', cleanShutdown);
  process.once('SIGTERM', cleanShutdown);
  process.once('exit', cleanShutdown);

  return url;
}

import express from "express";
import path from "path";
import crypto from "node:crypto";
import fs from "fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { 
  db, 
  getActiveAccount, 
  getAllAccounts, 
  switchActiveAccount, 
  updateAccountPersona,
  listLeadMagnetTriggers,
  findMatchingLeadTrigger,
  saveLeadMagnetTrigger,
  deleteLeadMagnetTrigger,
  incrementLeadMagnetTrigger
} from "./server/database.js";
import { 
  getMetaOAuthUrl, 
  exchangeCodeForLongLivedTokens, 
  getInstagramAccountProfile, 
  publishReelToInstagram, 
  publishCarouselToInstagram,
  fetchLiveInstagramInsights, 
  fetchLiveInstagramComments, 
  replyToInstagramComment,
  postCommentToMedia
} from "./server/metaGraphApi.js";
import { renderCarouselPostSlides } from "./server/carouselRenderer.js";
import { learnAccountPersona } from "./server/accountPersonaEngine.js";
import { encryptSecret, decryptSecret } from "./server/tokenVault.js";
import { ownerAuthMiddleware, ownerAuthRoutes, startAuthMaintenance } from "./server/accessGate.js";
import { THEME_PAGE_PROFILE, getActivePersona, buildThemeResearchContext, selectDynamicVertical, CONTENT_VERTICALS, type ContentVertical } from "./server/themePage.js";
import { createVideoJob, getVideoJob, listVideoJobs, claimNextVideoJob, saveVideoOutput, updateVideoJob, verifyVideoWorkerToken, getVideoWorkerContract, verifyMediaSignature } from "./server/videoEngine.js";
import { registerAsset, getAsset, listAssets, selectAssets, deleteAsset } from "./server/assetLibrary.js";
import { composeReel } from "./server/reelComposer.js";
import { ensureAutonomousVisualAssets } from "./server/autonomousVisualAssets.js";
import { ensureAutonomousAudioAsset } from "./server/autonomousAudio.js";
import { generateSpeech, concatenateAudioTracks, CREATOR_VOICES, getAudioDuration } from "./server/ttsEngine.js";
import { 
  enqueueJob, 
  startJobWorker, 
  computeStrategyFeedback, 
  StrategyFeedback 
} from "./server/jobQueue.js";
import { renderReelVideo, normalizeVideoUrl } from "./server/reelPipeline.js";
import { 
  listAgents, 
  getAgent, 
  createAgent,
  deleteAgent,
  assignMissionToAgent,
  toggleAgent, 
  toggleAllAgents, 
  updateAgentConfig, 
  getActivityLogs, 
  executeAgentAction, 
  executeSwarmCycle,
  getManagerAuditSummary,
  processSentinelDirective,
  runSentinelGrowthStrategy
} from "./server/agentSwarm.js";
import { startTunnelSupervisor, getTunnelStatus, restartTunnel } from "./server/tunnelSupervisor.js";
import { browserSurfer } from "./server/browserSurferEngine.js";
import { mineAndReverseEngineerCompetitor, getSavedCompetitorHooks } from "./server/competitorScraperEngine.js";
import { processDmConversation, getTrackedDmLeads } from "./server/dmConversationEngine.js";
import { 
  sendTelegramAlert, 
  notifyReelPublished, 
  getTelegramConfigStatus, 
  saveTelegramConfig, 
  detectTelegramChatId, 
  testTelegramAlertDetailed,
  startTelegramCommandListener,
  notifyLeadReceived
} from "./server/telegramBot.js";

dotenv.config();

// Critical Process Persistence Guard: Never let unhandled background promises or exceptions crash the 24x7 daemon
process.on("uncaughtException", (err: Error) => {
  console.error("[CRITICAL PROCESS GUARD] Uncaught Exception intercepted (server protected from crash):", err?.stack || err);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[CRITICAL PROCESS GUARD] Unhandled Promise Rejection intercepted (server protected from crash):", reason?.stack || reason);
});

const app = express();
const PORT = Number(process.env.PORT || 3000);
const execFileAsync = promisify(execFile);

const oauthStates = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Standard defensive HTTP security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Owner-only access gate. Public exceptions are limited to the owner login,
// Meta OAuth callback, and Meta webhook verification/ingestion.
app.use((req, res, next) => {
  if (ownerAuthRoutes(req, res)) return;
  ownerAuthMiddleware(req, res, next);
});

// Health check endpoint for uptime and deployment monitoring
app.get("/api/health", (_req, res) => {
  try {
    const account = db.prepare('SELECT username, account_id, is_connected FROM account_connections WHERE id = ?').get('instagram_primary') as any;
    const config = db.prepare('SELECT enabled, interval_minutes, current_stage, next_run, last_run FROM autonomous_config WHERE id = ?').get('default_config') as any;
    const recentReels = db.prepare('SELECT id, title, status, ig_media_id, created_at FROM reels ORDER BY created_at DESC LIMIT 3').all();
    const lastLog = db.prepare('SELECT timestamp, topic_researched, status FROM autonomous_logs ORDER BY timestamp DESC LIMIT 1').get() as any;

    res.json({
      status: "healthy",
      version: "1.0.1",
      uptimeSeconds: Math.floor(process.uptime()),
      pipeline: {
        instagram: {
          connected: Boolean(account?.is_connected),
          username: account?.username || null,
          accountId: account?.account_id ? `${String(account.account_id).slice(0, 5)}...` : null
        },
        autonomous: config || null,
        recentReels,
        lastLog: lastLog || null
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.json({
      status: "degraded",
      error: err?.message || String(err),
      uptimeSeconds: Math.floor(process.uptime())
    });
  }
});

// Finished MP4s need to be fetchable by Instagram/Meta, but the dashboard remains owner-only.
app.get("/media/reels/:filename", (req, res) => {
  const rawFilename = path.basename(String(req.params.filename || ""));
  const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, "");
  const token = String(req.query.token || "");
  if (!cleanFilename || cleanFilename.startsWith(".") || !verifyMediaSignature(cleanFilename, token)) {
    return res.status(403).send("Forbidden");
  }
  const baseDir = path.resolve(process.cwd(), "data", "media", "reels");
  const filePath = path.resolve(baseDir, cleanFilename);
  if (!filePath.startsWith(baseDir + path.sep)) {
    return res.status(400).send("Bad request");
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Media not found");
  }
  res.sendFile(filePath);
});

// Rendered Carousel slide JPGs need to be fetchable by Instagram/Meta
app.get("/media/posts/:filename", (req, res) => {
  const rawFilename = path.basename(String(req.params.filename || ""));
  const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, "");
  const token = String(req.query.token || "");
  if (!cleanFilename || cleanFilename.startsWith(".") || !verifyMediaSignature(cleanFilename, token)) {
    return res.status(403).send("Forbidden");
  }
  const baseDir = path.resolve(process.cwd(), "data", "media", "posts");
  const filePath = path.resolve(baseDir, cleanFilename);
  if (!filePath.startsWith(baseDir + path.sep)) {
    return res.status(400).send("Bad request");
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Media not found");
  }
  res.sendFile(filePath);
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
}

function hasNemotronKey(): boolean {
  return Boolean(process.env.NEMOTRON_API_KEY && process.env.NEMOTRON_API_KEY.length > 5);
}

function getNemotronModel(): string {
  const configured = String(process.env.NEMOTRON_MODEL || "nvidia/nemotron-3-super-120b-a12b");
  // OpenRouter model IDs may intentionally include :free. NVIDIA NIM does not.
  if (/openrouter\.ai/i.test(getNvidiaNimUrl())) {
    return configured;
  }
  return configured.replace(/:free$/i, "");
}

function getNvidiaNimUrl(): string {
  return String(process.env.NVIDIA_NIM_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
}

let searchQuotaCooldownUntil = 0;

const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash"
];

const GEMINI_RETRY_DELAYS_MS = [1000, 2000, 4000];
const NEMOTRON_RETRY_DELAYS_MS = [2000];

function isRetryableGeminiError(errMsg: string): boolean {
  return /429|408|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline/i.test(errMsg);
}

function isQuotaGeminiError(errMsg: string): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|Quota exceeded/i.test(errMsg);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateNemotronJson(prompt: string): Promise<any | null> {
  if (!hasNemotronKey()) return null;
  const model = getNemotronModel();
  const url = `${getNvidiaNimUrl()}/chat/completions`;

  for (let attempt = 0; attempt <= NEMOTRON_RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NEMOTRON_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are the text intelligence engine for SARLX.Ai. Return valid JSON only. Be specific, factual, concrete, and avoid generic AI marketing language."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 8000,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      const bodyText = await response.text();
      if (!response.ok) {
        const error = new Error(`Nemotron HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
        if (response.status === 429 && attempt < NEMOTRON_RETRY_DELAYS_MS.length) {
          const delay = NEMOTRON_RETRY_DELAYS_MS[attempt];
          console.info(`[Nemotron Engine] ${model} upstream rate-limited; retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw error;
      }

      const payload = JSON.parse(bodyText);
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) return null;

      const cleaned = String(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      return JSON.parse(cleaned);
    } catch (err: any) {
      const message = err?.name === "AbortError" ? "request timed out after 90s" : (err?.message || String(err));
      if (attempt < NEMOTRON_RETRY_DELAYS_MS.length && /429|408|500|502|503|504|rate.?limit|temporarily rate.?limited|upstream/i.test(message)) {
        const delay = NEMOTRON_RETRY_DELAYS_MS[attempt];
        console.info(`[Nemotron Engine] ${model} transient failure; retrying in ${delay}ms: ${message.slice(0, 180)}`);
        await sleep(delay);
        continue;
      }
      console.warn(`[Nemotron Engine] ${model} failed: ${message.slice(0, 300)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function generateGeminiJson(
  prompt: string,
  models = GEMINI_MODEL_FALLBACKS
): Promise<any | null> {
  if (!hasGeminiKey()) return null;
  for (const model of models) {
    for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json", temperature: 0.7 }
        });
        const text = response.text?.trim() || "";
        if (text) {
          const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          return JSON.parse(cleaned);
        }
        break;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (isRetryableGeminiError(errMsg) && attempt < GEMINI_RETRY_DELAYS_MS.length) {
          const delay = GEMINI_RETRY_DELAYS_MS[attempt];
          console.info(`[Gemini Engine] ${model} transient failure; retrying in ${delay}ms: ${errMsg.slice(0, 140)}`);
          await sleep(delay);
          continue;
        }
        if (isQuotaGeminiError(errMsg)) {
          console.info(`[Gemini Engine] ${model} quota/rate limit reached; moving to the next Gemini model.`);
        } else {
          console.info(`[Gemini Engine] Model ${model} fallback triggered: ${errMsg.slice(0, 140)}`);
        }
        break;
      }
    }
  }
  return null;
}

async function generateTextJson(prompt: string): Promise<any | null> {
  const nemotronResult = await generateNemotronJson(prompt);
  if (nemotronResult) {
    console.info(`[AI Text Engine] Nemotron ${getNemotronModel()} generated the content.`);
    return nemotronResult;
  }
  const geminiResult = await generateGeminiJson(prompt);
  if (geminiResult) {
    console.info("[AI Text Engine] Gemini generated the content after Nemotron fallback.");
    return geminiResult;
  }
  return null;
}

async function validateRenderedReel(videoPath: string): Promise<{
  valid: boolean;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  sizeBytes: number;
  error?: string;
}> {
  try {
    const stat = fs.statSync(videoPath);
    if (stat.size < 50 * 1024) {
      return {
        valid: false, duration: 0, width: 0, height: 0, hasAudio: false,
        sizeBytes: stat.size, error: "Rendered video is unexpectedly small."
      };
    }

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,width,height",
      "-of", "json",
      videoPath
    ]);

    const probe = JSON.parse(stdout || "{}");
    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const video = streams.find((stream: any) => stream.codec_type === "video");
    const hasAudio = streams.some((stream: any) => stream.codec_type === "audio");
    const duration = Number(probe.format?.duration || 0);
    const width = Number(video?.width || 0);
    const height = Number(video?.height || 0);

    if (!video) {
      return { valid: false, duration, width, height, hasAudio, sizeBytes: stat.size, error: "No video stream found." };
    }
    if (width !== 1080 || height !== 1920) {
      return {
        valid: false, duration, width, height, hasAudio, sizeBytes: stat.size,
        error: `Expected 1080x1920, got ${width}x${height}.`
      };
    }
    if (duration < 5 || duration > 90) {
      return {
        valid: false, duration, width, height, hasAudio, sizeBytes: stat.size,
        error: `Invalid Reel duration: ${duration.toFixed(2)}s.`
      };
    }
    if (!hasAudio) {
      return {
        valid: false, duration, width, height, hasAudio, sizeBytes: stat.size,
        error: "Rendered Reel has no audio stream."
      };
    }

    return { valid: true, duration, width, height, hasAudio, sizeBytes: stat.size };
  } catch (err: any) {
    return {
      valid: false,
      duration: 0,
      width: 0,
      height: 0,
      hasAudio: false,
      sizeBytes: 0,
      error: err?.message || String(err)
    };
  }
}

async function selectAutonomousSceneAssets(reel: any): Promise<{ scenes: any[]; musicPath?: string; voicePath?: string } | null> {
  const prepared = await ensureAutonomousVisualAssets(reel);
  if (!prepared.assets.length || prepared.assets.length < (Array.isArray(reel.scenes) ? reel.scenes.length : 0)) {
    return null;
  }

  // 1. Synthesize authentic neural voiceover FIRST and calculate exact duration for each scene!
  let masterVoicePath: string | undefined;
  const rawScenes = Array.isArray(reel.scenes) ? reel.scenes : [];
  const voiceSegments: string[] = [];
  const sceneDurations: number[] = [];

  for (let i = 0; i < rawScenes.length; i++) {
    const sc = rawScenes[i];
    // Prioritize rich voiceScript / voiceText over brief headlines
    const narrationText = String(sc?.voiceScript || sc?.voiceText || sc?.subline || sc?.headline || '').trim();
    if (narrationText) {
      try {
        const segPath = await generateSpeech(narrationText, undefined, { voice: CREATOR_VOICES.naturalCreatorMale });
        const audioDur = await getAudioDuration(segPath);
        // Add 0.5s breathing padding so speech never cuts off abruptly at the transition
        const sceneDur = Math.max(audioDur + 0.5, 6.0);
        voiceSegments.push(segPath);
        sceneDurations.push(sceneDur);
        console.log(`[Autonomous 24x7 Engine] Scene ${i + 1} voiceover: ${audioDur.toFixed(1)}s audio -> Scene duration calibrated to ${sceneDur.toFixed(1)}s.`);
      } catch (segErr) {
        console.warn(`[Autonomous 24x7 Engine] Voice synthesis failed for scene ${i + 1}:`, segErr);
        sceneDurations.push(Number(sc?.durationSeconds || 8.0));
      }
    } else {
      sceneDurations.push(Number(sc?.durationSeconds || 8.0));
    }
  }

  if (voiceSegments.length > 0) {
    const masterPath = path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id || Date.now()}.mp3`);
    masterVoicePath = await concatenateAudioTracks(voiceSegments, masterPath);
    console.log(`[Autonomous 24x7 Engine] Master voiceover ready: ${voiceSegments.length} scene(s), total spoken narration synchronized.`);
  }

  // 2. Assemble scenes with DYNAMICALLY CALIBRATED DURATIONS based on the TTS audio!
  const scenes = prepared.assets.map((asset: any, index: number) => {
    const scene = rawScenes[index] || {};
    const dynamicDuration = sceneDurations[index] || Number(scene.durationSeconds || 8.0);
    const isPortrait = (asset.width === 1080 && asset.height === 1920) || asset.source === "ffmpeg-autonomous-visual-producer";
    return {
      assetId: asset.id,
      duration: dynamicDuration,
      crop: "center",
      zoom: isPortrait ? 1 : Number(scene.pacingEffect === "zoom-in" ? 1.05 : 1),
      speed: 1,
      transition: "cut",
      text: scene.headline || scene.hookText || scene.secondaryText || ""
    };
  });

  // Calculate and update total duration on reel
  const totalReelDuration = scenes.reduce((sum: number, s: any) => sum + s.duration, 0);
  reel.duration = totalReelDuration;
  console.log(`[Autonomous 24x7 Engine] Reel duration dynamically calibrated to ${totalReelDuration.toFixed(1)}s based on full TTS narration.`);

  // Always use authentic, studio-produced royalty-free audio tracks (no robotic sine beeps)
  const musicAsset = await ensureAutonomousAudioAsset(reel);
  if (!musicAsset?.file_path) {
    throw new Error("Autonomous Reel requires an authentic studio music asset.");
  }

  console.log(`[Autonomous 24x7 Engine] Media producer ready: ${prepared.generated} generated visual asset(s), ${prepared.assets.length} scene asset(s), audio=${musicAsset.id}, voice=${masterVoicePath ? 'present' : 'none'}.`);

  return {
    scenes,
    musicPath: musicAsset.file_path,
    voicePath: masterVoicePath
  };
}
// ==========================================
// REUSABLE ASSET + REEL COMPOSER ENGINE
// ==========================================

app.get("/api/assets", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const tags = String(req.query.tags || "").split(",").map(v => v.trim()).filter(Boolean);
  res.json({ success: true, assets: listAssets({
    type: req.query.type ? String(req.query.type) as any : undefined,
    category: req.query.category ? String(req.query.category) : undefined,
    tags,
    limit
  }) });
});

app.get("/api/assets/:id", (req, res) => {
  const asset = getAsset(String(req.params.id));
  if (!asset) return res.status(404).json({ success: false, error: "Asset not found." });
  res.json({ success: true, asset });
});

app.delete("/api/assets/:id", async (req, res) => {
  try {
    const success = await deleteAsset(String(req.params.id));
    if (!success) return res.status(404).json({ success: false, error: "Asset not found." });
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to delete asset." });
  }
});

app.get("/api/assets/select", (req, res) => {
  const tags = String(req.query.tags || "").split(",").map(v => v.trim()).filter(Boolean);
  const excludeIds = String(req.query.excludeIds || "").split(",").map(v => v.trim()).filter(Boolean);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  res.json({ success: true, assets: selectAssets({
    type: String(req.query.type || "video") as any,
    category: req.query.category ? String(req.query.category) : undefined,
    tags,
    excludeIds,
    avoidRecentlyUsedDays: Number(req.query.avoidDays) || 3,
    limit
  }) });
});

app.post("/api/assets/register", async (req, res) => {
  const { type, sourcePath, category } = req.body || {};
  if (!type || !sourcePath || !category) {
    return res.status(400).json({ success: false, error: "type, sourcePath and category are required." });
  }
  try {
    const asset = await registerAsset({
      type: String(type) as any,
      sourcePath: String(sourcePath),
      category: String(category),
      tags: Array.isArray(req.body.tags) ? req.body.tags.map(String) : [],
      duration: req.body.duration == null ? null : Number(req.body.duration),
      width: req.body.width == null ? null : Number(req.body.width),
      height: req.body.height == null ? null : Number(req.body.height),
      source: req.body.source ? String(req.body.source) : "manual",
      prompt: req.body.prompt ? String(req.body.prompt) : null,
      mood: req.body.mood ? String(req.body.mood) : null,
      camera: req.body.camera ? String(req.body.camera) : null,
      metadata: req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
    });
    res.status(201).json({ success: true, asset });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || String(err) });
  }
});

app.post("/api/reels/compose", async (req, res) => {
  const { reelId, scenes, voicePath, musicPath } = req.body || {};
  if (!reelId || !Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ success: false, error: "reelId and scenes are required." });
  }
  try {
    const result = await composeReel({ reelId: String(reelId), scenes, voicePath, musicPath });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || String(err) });
  }
});

// ==========================================
// CLOUD VIDEO ENGINE
function requireVideoWorker(req: express.Request, res: express.Response): boolean {
  const token = String(req.headers["x-texvic-worker-token"] || "");
  if (!verifyVideoWorkerToken(token)) {
    res.status(401).json({ success: false, error: "Invalid video worker token." });
    return false;
  }
  return true;
}

app.get("/api/video/contract", (req, res) => {
  res.json({ success: true, contract: getVideoWorkerContract() });
});

app.get("/api/video/jobs", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  res.json({ success: true, jobs: listVideoJobs(limit) });
});

app.post("/api/video/jobs", (req, res) => {
  const { reelId, prompt, provider } = req.body || {};
  if (!reelId || !prompt) return res.status(400).json({ success: false, error: "reelId and prompt are required." });
  const reel = db.prepare("SELECT id FROM reels WHERE id = ?").get(String(reelId));
  if (!reel) return res.status(404).json({ success: false, error: "Reel not found." });
  const job = createVideoJob({ reelId: String(reelId), prompt: String(prompt), provider: provider ? String(provider) : undefined });
  res.status(201).json({ success: true, job });
});

app.get("/api/video-worker/claim", (req, res) => {
  if (!requireVideoWorker(req, res)) return;
  const job = claimNextVideoJob();
  if (!job) return res.status(204).send();
  res.json({ success: true, job });
});

app.post("/api/video-worker/jobs/:id/status", (req, res) => {
  if (!requireVideoWorker(req, res)) return;
  const { status, sourceUrl, error } = req.body || {};
  const allowed = new Set(["QUEUED", "GENERATING", "DOWNLOADING", "PROCESSING", "READY", "FAILED"]);
  if (!allowed.has(String(status))) return res.status(400).json({ success: false, error: "Invalid video job status." });
  const job = updateVideoJob(String(req.params.id), {
    status: String(status) as any,
    source_url: sourceUrl ? String(sourceUrl) : undefined,
    error: error ? String(error) : null
  });
  if (!job) return res.status(404).json({ success: false, error: "Video job not found." });
  res.json({ success: true, job });
});

app.post("/api/video-worker/jobs/:id/output", express.raw({ type: ["video/mp4", "application/octet-stream"], limit: "300mb" }), async (req, res) => {
  if (!requireVideoWorker(req, res)) return;
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (!body.length) return res.status(400).json({ success: false, error: "MP4 body is required." });
  try {
    const job = await saveVideoOutput(String(req.params.id), body, "mp4");
    if (!job) return res.status(404).json({ success: false, error: "Video job not found." });
    db.prepare("UPDATE reels SET video_url = ?, updated_at = ? WHERE id = ?").run(job.output_url, new Date().toISOString(), job.reel_id);
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || String(err) });
  }
});

// 1. REAL INSTAGRAM OAUTH & META GRAPH API
// ==========================================

function getRedirectUri(req: express.Request): string {
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl.startsWith("http")) {
    return `${appUrl.replace(/\/$/, "")}/auth/instagram/callback`;
  }
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${protocol}://${host}/auth/instagram/callback`;
}

// GET /api/auth/instagram/url - Constructs Meta OAuth Authorization URL
app.get("/api/auth/instagram/url", (req, res) => {
  const clientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: "INSTAGRAM_APP_ID is not configured. Set your Instagram Business Login App ID in the server environment."
    });
  }

  const redirectUri = getRedirectUri(req);
  const state = crypto.randomUUID();
  oauthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  const authUrl = getMetaOAuthUrl(clientId, redirectUri, state);
  res.json({ success: true, url: authUrl, redirectUri });
});

// GET /auth/instagram/callback - Popup OAuth callback handler with postMessage
app.get(["/auth/instagram/callback", "/auth/instagram/callback/"], async (req, res) => {
  const { code, error, error_description, state } = req.query;

  if (!error) {
    const stateValue = String(state || "");
    const expiresAt = oauthStates.get(stateValue);
    oauthStates.delete(stateValue);
    if (!expiresAt || expiresAt < Date.now()) {
      return res.status(400).send("Invalid or expired OAuth state. Please restart the Instagram connection flow.");
    }
  }

  if (error || !code) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: system-ui; background: #0b0f17; color: #fff; padding: 32px; text-align: center;">
          <h2 style="color: #ef4444;">Instagram Authentication Cancelled</h2>
          <p>${error_description || error || 'No authorization code returned from Meta.'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: '${error || "cancelled"}' }, '*');
              setTimeout(() => window.close(), 2500);
            }
          </script>
        </body>
      </html>
    `);
  }

  const clientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
  const clientSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';
  const redirectUri = getRedirectUri(req);

  const tokenResult = await exchangeCodeForLongLivedTokens(String(code), clientId, clientSecret, redirectUri);

  if (tokenResult.error || !tokenResult.longLivedAccessToken) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: system-ui; background: #0b0f17; color: #fff; padding: 32px; text-align: center;">
          <h2 style="color: #ef4444;">Token Exchange Failed</h2>
          <p>${tokenResult.error || 'Could not acquire long-lived access token from Meta.'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: '${tokenResult.error || "exchange_failed"}' }, '*');
              setTimeout(() => window.close(), 3000);
            }
          </script>
        </body>
      </html>
    `);
  }

  // Update SQLite database with real account credentials
  const updateAccount = db.prepare(`
    UPDATE account_connections 
    SET account_id = ?, username = ?, name = ?, profile_picture_url = ?, access_token = ?, is_connected = 1, updated_at = ?
    WHERE id = 'instagram_primary'
  `);

  updateAccount.run(
    tokenResult.instagramAccountId || '',
    tokenResult.instagramUsername ? `@${tokenResult.instagramUsername}` : '@instagram_creator',
    tokenResult.instagramName || 'Instagram Creator',
    tokenResult.profilePictureUrl || '',
    encryptSecret(tokenResult.longLivedAccessToken),
    new Date().toISOString()
  );

  // Enqueue immediate initial live insights sync job
  enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { initial: true });

  res.send(`
    <!DOCTYPE html>
    <html>
      <body style="font-family: system-ui; background: #0b0f17; color: #fff; padding: 32px; text-align: center;">
        <h2 style="color: #10b981;">Connected to Instagram!</h2>
        <p>Your Instagram account (${tokenResult.instagramUsername || 'Creator'}) is now connected to SARLX.Ai.</p>
        <p style="color: #94a3b8; font-size: 13px;">Closing this window...</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'OAUTH_AUTH_SUCCESS', 
              accountId: '${tokenResult.instagramAccountId || ""}',
              username: '${tokenResult.instagramUsername || ""}'
            }, '*');
            setTimeout(() => window.close(), 1000);
          } else {
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `);
});

// POST /api/auth/instagram/direct-token - Connect directly using Meta Graph API Token & Account ID
app.post("/api/auth/instagram/direct-token", async (req, res) => {
  const metaAccessToken = String(req.body.metaAccessToken || req.body.accessToken || '').trim();
  let instagramAccountId = String(req.body.instagramAccountId || req.body.accountId || '').trim();

  if (!metaAccessToken) {
    return res.status(400).json({
      success: false,
      error: "Meta Access Token is required."
    });
  }

  // Verify token and query live profile from Meta
  const profileRes = await getInstagramAccountProfile(instagramAccountId, metaAccessToken);

  if (!profileRes.success || !profileRes.data) {
    return res.status(400).json({
      success: false,
      error: `Meta Graph API validation failed: ${profileRes.error || 'Invalid credentials'}`
    });
  }

  const p = profileRes.data;
  if (!instagramAccountId) {
    instagramAccountId = p.id;
  }

  // Persist to SQLite
  const updateAccount = db.prepare(`
    UPDATE account_connections 
    SET account_id = ?, username = ?, name = ?, profile_picture_url = ?, biography = ?,
        followers_count = ?, follows_count = ?, media_count = ?, access_token = ?, 
        meta_app_id = NULL, meta_app_secret = NULL, is_connected = 1, updated_at = ?
    WHERE id = 'instagram_primary'
  `);

  updateAccount.run(
    instagramAccountId,
    p.username,
    p.name,
    p.profile_picture_url || '',
    p.biography || '',
    p.followers_count,
    p.follows_count,
    p.media_count,
    encryptSecret(metaAccessToken),
    new Date().toISOString()
  );

  // Sync autonomous engine publishing credentials
  const updateConfig = db.prepare(`
    UPDATE autonomous_config 
    SET updated_at = ?
    WHERE id = 'default_config'
  `);
  updateConfig.run(new Date().toISOString());

  // Enqueue live insights sync
  enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { initial: true });

  res.json({
    success: true,
    account: p,
    message: `Successfully connected ${p.username} via Meta Graph API.`
  });
});

// ==========================================
// MULTI-ACCOUNT & CONTENT DNA MANAGEMENT
// ==========================================

// GET /api/accounts - List all connected / managed accounts
app.get("/api/accounts", (req, res) => {
  const accounts = getAllAccounts().map(a => ({
    ...a,
    persona: a.persona_json ? JSON.parse(a.persona_json) : null
  }));
  const active = getActiveAccount();
  let safeActive = null;
  if (active) {
    const { access_token, ...rest } = active;
    safeActive = {
      ...rest,
      persona: active.persona_json ? JSON.parse(active.persona_json) : null
    };
  }
  res.json({
    success: true,
    accounts,
    activeAccountId: active?.id || 'instagram_primary',
    activeAccount: safeActive
  });
});

// POST /api/accounts/switch - Switch active account in workspace
app.post("/api/accounts/switch", (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ success: false, error: "accountId is required." });
  const active = switchActiveAccount(accountId);
  const state = getDatabaseState();
  let safeActive = null;
  if (active) {
    const { access_token, ...rest } = active;
    safeActive = {
      ...rest,
      persona: active.persona_json ? JSON.parse(active.persona_json) : null
    };
  }
  res.json({
    success: true,
    activeAccountId: active?.id,
    activeAccount: safeActive,
    store: state
  });
});

// POST /api/accounts/create - Add a new profile or connected Instagram account
app.post("/api/accounts/create", async (req, res) => {
  const { username, name, biography, niche, accessToken, accountId } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: "username is required." });
  const cleanUsername = String(username).replace(/^@/, '').trim();
  const id = `account_${cleanUsername.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO account_connections (
      id, platform, account_id, username, name, profile_picture_url, biography,
      followers_count, follows_count, media_count, access_token, is_connected, is_active, updated_at
    ) VALUES (?, 'instagram', ?, ?, ?, '', ?, 0, 0, 0, ?, ?, 1, ?)
  `).run(
    id,
    accountId || '',
    `@${cleanUsername}`,
    name || cleanUsername,
    biography || '',
    accessToken ? encryptSecret(accessToken) : '',
    Boolean(accessToken && accountId) ? 1 : 0,
    now
  );

  switchActiveAccount(id);

  // Automatically synthesize initial Content DNA if niche or bio provided
  try {
    await learnAccountPersona(id, { customDescription: niche || biography });
  } catch (err) {
    console.warn('[Account Create] Auto-learn Content DNA skipped:', err);
  }

  const state = getDatabaseState();
  res.json({ success: true, accountId: id, store: state });
});

// POST /api/accounts/:id/learn-persona - Reverse-engineer account Content DNA from Instagram
app.post("/api/accounts/:id/learn-persona", async (req, res) => {
  try {
    const { customDescription, sampleCaptions, referenceNiche } = req.body || {};
    const persona = await learnAccountPersona(req.params.id, { customDescription, sampleCaptions, referenceNiche });
    const state = getDatabaseState();
    res.json({ success: true, persona, store: state });
  } catch (err: any) {
    console.error("[Account DNA Learn Error]:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to learn account Content DNA." });
  }
});

// POST /api/accounts/:id/update-persona - Manually update or fine-tune account Content DNA
app.post("/api/accounts/:id/update-persona", (req, res) => {
  const { persona } = req.body || {};
  if (!persona) return res.status(400).json({ success: false, error: "persona object is required." });
  updateAccountPersona(req.params.id, persona);
  if (persona.brand || persona.handle) {
    db.prepare('UPDATE account_connections SET name = COALESCE(?, name), username = COALESCE(?, username), updated_at = ? WHERE id = ?')
      .run(persona.brand || null, persona.handle || null, new Date().toISOString(), req.params.id);
  }
  const state = getDatabaseState();
  res.json({ success: true, persona, store: state });
});

// DELETE /api/accounts/:id - Remove managed account
app.delete("/api/accounts/:id", (req, res) => {
  const id = req.params.id;
  const accounts = getAllAccounts();
  if (accounts.length <= 1) {
    return res.status(400).json({ success: false, error: "Cannot delete the only account in workspace." });
  }
  db.prepare('DELETE FROM account_connections WHERE id = ?').run(id);
  const remaining = getAllAccounts();
  if (remaining.length > 0 && !remaining.some(a => a.is_active)) {
    switchActiveAccount(remaining[0].id);
  }
  const state = getDatabaseState();
  res.json({ success: true, id, store: state });
});

// POST /api/auth/instagram/disconnect - Disconnect account and reset SQLite state
app.post("/api/auth/instagram/disconnect", (req, res) => {
  const active = getActiveAccount();
  const updateAccount = db.prepare(`
    UPDATE account_connections 
    SET account_id = '', username = '@texvic_ai', name = 'TEXVIC.Ai', profile_picture_url = '', 
        biography = '⚡ Autonomous Instagram growth & reach agent for TEXVIC.Ai',
        followers_count = 0, follows_count = 0, media_count = 0, access_token = '', 
        is_connected = 0, updated_at = ?
    WHERE id = ?
  `);
  updateAccount.run(new Date().toISOString(), active?.id || 'instagram_primary');

  res.json({ success: true, message: "Account disconnected successfully." });
});

// GET /api/account/status - Verify the stored Instagram connection against Meta
app.get("/api/account/status", async (req, res) => {
  const account = getActiveAccount();

  const disconnectedAccount = (status: 'disconnected' | 'verification_failed' = 'disconnected', error?: string) => ({
    success: true,
    isConnected: false,
    connectionStatus: status,
    error,
    account: {
      handle: '@texvic_ai',
      name: 'TEXVIC.Ai',
      avatar: '',
      followers: 0,
      followersChange: 0,
      following: 0,
      postsCount: 0,
      category: 'AI Growth Engine',
      bio: '⚡ Autonomous Instagram growth & reach agent for SARLX.Ai\n🎬 Real-time viral reels, carousels, and 24/7 engagement',
      isVerified: false
    }
  });

  if (!account?.is_connected || !account.access_token || !account.account_id) {
    return res.json(disconnectedAccount());
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(account.access_token);
  } catch {
    db.prepare(`
      UPDATE account_connections
      SET is_connected = 0, access_token = '', updated_at = ?
      WHERE id = 'instagram_primary'
    `).run(new Date().toISOString());
    return res.json(disconnectedAccount('verification_failed', 'Stored Instagram credentials could not be decrypted. Please reconnect Instagram.'));
  }

  // A database flag alone is not enough. Verify the token and account live with Meta.
  const liveProfile = await getInstagramAccountProfile(account.account_id, accessToken);

  if (liveProfile.success && liveProfile.data) {
    const p = liveProfile.data;
    const hasChanged = 
      account.username !== p.username ||
      account.name !== p.name ||
      account.followers_count !== p.followers_count ||
      account.follows_count !== p.follows_count ||
      account.media_count !== p.media_count ||
      account.is_connected !== 1 ||
      !account.updated_at ||
      (Date.now() - new Date(account.updated_at).getTime() > 10 * 60 * 1000);

    if (hasChanged) {
      db.prepare(`
        UPDATE account_connections
        SET account_id = ?, username = ?, name = ?, profile_picture_url = ?, biography = ?,
            followers_count = ?, follows_count = ?, media_count = ?, is_connected = 1, updated_at = ?
        WHERE id = 'instagram_primary'
      `).run(
        p.id,
        p.username,
        p.name,
        p.profile_picture_url || '',
        p.biography || '',
        p.followers_count,
        p.follows_count,
        p.media_count,
        new Date().toISOString()
      );
    }

    return res.json({
      success: true,
      isConnected: true,
      connectionStatus: 'connected',
      verifiedAt: new Date().toISOString(),
      account: {
        handle: p.username,
        name: p.name,
        avatar: p.profile_picture_url || '',
        followers: p.followers_count,
        followersChange: 0,
        following: p.follows_count,
        postsCount: p.media_count,
        category: 'Creator / Business',
        bio: p.biography || '',
        isVerified: p.followers_count > 10000
      }
    });
  }

  const authFailure = liveProfile.httpStatus === 401 ||
    liveProfile.httpStatus === 403 ||
    String(liveProfile.errorCode || '') === '190';

  if (authFailure) {
    db.prepare(`
      UPDATE account_connections
      SET is_connected = 0, access_token = '', updated_at = ?
      WHERE id = 'instagram_primary'
    `).run(new Date().toISOString());

    return res.json(disconnectedAccount(
      'disconnected',
      liveProfile.error || 'Instagram authorization is no longer valid. Please reconnect Instagram.'
    ));
  }

  return res.json(disconnectedAccount(
    'verification_failed',
    liveProfile.error || 'Instagram could not be verified right now. Try Sync Status again.'
  ));
});

// ==========================================
// 2. REAL WEBHOOK INGESTION (META INSTAGRAM)
// ==========================================

// GET /api/webhooks/instagram - Meta Webhook Verification Challenge
app.get("/api/webhooks/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : "";
  const challenge = req.query["hub.challenge"];

  const expectedToken = process.env.META_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error("[Meta Webhook] META_VERIFY_TOKEN is not configured in .env.");
    return res.status(500).send("Webhook verification token not configured on server.");
  }

  const tokenMatches = Boolean(
    token &&
    crypto.timingSafeEqual(
      crypto.createHash("sha256").update(token).digest(),
      crypto.createHash("sha256").update(expectedToken).digest()
    )
  );

  if (mode === "subscribe" && tokenMatches) {
    console.log("[Meta Webhook] Successfully verified webhook endpoint with Meta challenge.");
    return res.status(200).send(challenge);
  }

  console.warn("[Meta Webhook] Webhook challenge verification failed.");
  res.sendStatus(403);
});

// POST /api/webhooks/instagram - Real-time Instagram Webhook Event Ingestion
app.post("/api/webhooks/instagram", async (req, res) => {
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("[Meta Webhook] INSTAGRAM_APP_SECRET / META_APP_SECRET not configured. Rejecting unverified webhook.");
    return res.status(500).send("Webhook secret not configured on server.");
  }

  const signature = String(req.headers["x-hub-signature-256"] || "");
  if (!signature.startsWith("sha256=")) {
    console.warn("[Meta Webhook] Missing or malformed X-Hub-Signature-256 header.");
    return res.status(401).send("Missing or malformed signature header.");
  }

  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  const expectedSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      console.warn("[Meta Webhook] Signature verification failed.");
      return res.status(401).send("Invalid webhook signature.");
    }
  } catch {
    return res.status(401).send("Invalid webhook signature.");
  }

  const body = req.body;

  if (body.object === "instagram") {
    for (const entry of body.entry || []) {
      const entryId = entry.id;
      
      // Store raw webhook event into SQLite
      const insertEvent = db.prepare(`
        INSERT INTO webhook_events (id, event_type, entry_id, payload_json, processed, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `);
      insertEvent.run(`evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'instagram_change', entryId, JSON.stringify(entry), new Date().toISOString());

      // Check for incoming comments
      for (const change of entry.changes || []) {
        if (change.field === "comments") {
          const val = change.value;
          const commentId = val.id;
          const text = val.text || '';
          const authorId = val.from?.id;
          const authorUsername = val.from?.username ? `@${val.from.username}` : '@user';
          const mediaId = val.media?.id;

          const insertComment = db.prepare(`
            INSERT OR IGNORE INTO comments_inbox (
              id, ig_comment_id, ig_media_id, author_username, author_id, comment_text, timestamp, sentiment, reply_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'positive', 'pending', ?)
          `);
          insertComment.run(`comm-${commentId}`, commentId, mediaId, authorUsername, authorId, text, new Date().toISOString(), new Date().toISOString());

          // Trigger Auto-Responder rules if keywords matched (Instant Comment-to-DM Engine)
          const matchedTrigger = findMatchingLeadTrigger(text);

          if (matchedTrigger) {
            incrementLeadMagnetTrigger(matchedTrigger.id);
            const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
            const account = accountQuery.get('instagram_primary') as any;
            const replyMsg = matchedTrigger.public_reply_template || `⚡ Sent! Check your Instagram Direct Messages for the ${matchedTrigger.resource_name}!`;

            if (account?.access_token) {
              await replyToInstagramComment(commentId, replyMsg, decryptSecret(account.access_token));
            }

            db.prepare(`
              UPDATE comments_inbox 
              SET reply_status = 'replied', reply_text = ?, automated_dm_sent = 1, dm_keyword_triggered = ?
              WHERE ig_comment_id = ?
            `).run(replyMsg, matchedTrigger.keyword, commentId);

            // Dispatch / record direct message lead in CRM
            const cleanAuthor = authorUsername.replace(/^@/, '');
            const leadUserId = authorId || `user-${cleanAuthor}`;
            await processDmConversation(leadUserId, cleanAuthor, matchedTrigger.message_template);

            // Notify Telegram Sentinel
            notifyLeadReceived({
              username: authorUsername,
              triggerWord: matchedTrigger.keyword,
              commentText: text,
              dmReplyText: matchedTrigger.message_template
            }).catch(() => {});

            console.log(`[Instant Comment-to-DM] Auto-replied to comment ${commentId} triggered by keyword "${matchedTrigger.keyword}" for @${cleanAuthor}.`);
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  }

  res.sendStatus(404);
});

// POST /api/instagram/sync-comments - Pull latest comments on published reels
app.post("/api/instagram/sync-comments", async (req, res) => {
  const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
  const account = accountQuery.get('instagram_primary') as any;

  if (!account?.access_token) {
    return res.status(400).json({ success: false, error: "Instagram account not connected" });
  }

  const publishedReels = db.prepare(`SELECT ig_media_id FROM reels WHERE ig_media_id IS NOT NULL ORDER BY created_at DESC LIMIT 5`).all() as any[];

  let syncedCount = 0;
  for (const r of publishedReels) {
    const commentsRes = await fetchLiveInstagramComments(r.ig_media_id, decryptSecret(account.access_token));
    if (commentsRes.success && commentsRes.comments) {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO comments_inbox (
          id, ig_comment_id, ig_media_id, author_username, comment_text, timestamp, sentiment, reply_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'positive', 'pending', ?)
      `);
      for (const c of commentsRes.comments) {
        insert.run(`comm-${c.id}`, c.id, r.ig_media_id, c.username, c.text, c.timestamp, new Date().toISOString());
        syncedCount++;
      }
    }
  }

  const allComments = db.prepare(`SELECT * FROM comments_inbox ORDER BY timestamp DESC LIMIT 50`).all();
  res.json({ success: true, syncedCount, comments: allComments });
});

// POST /api/instagram/reply-comment - Reply directly via Meta Graph API
app.post("/api/instagram/reply-comment", async (req, res) => {
  const { commentId, replyText } = req.body;
  const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
  const account = accountQuery.get('instagram_primary') as any;

  if (!account?.access_token) {
    return res.status(400).json({ success: false, error: "Instagram account not connected." });
  }

  const replyRes = await replyToInstagramComment(commentId, replyText, decryptSecret(account.access_token));
  if (!replyRes.success) {
    return res.status(500).json({ success: false, error: replyRes.error });
  }

  db.prepare(`
    UPDATE comments_inbox 
    SET reply_status = 'replied', reply_text = ?
    WHERE ig_comment_id = ?
  `).run(replyText, commentId);

  res.json({ success: true, replyId: replyRes.replyId });
});

// ==========================================
// 3. REAL PUBLISHING & REELS VAULT
// ==========================================

// Note: POST /api/reels/publish-now is defined below with full publishReelInternal pipeline integration.


// ==========================================
// 4. REAL INSIGHTS INGESTION
// ==========================================

// POST /api/instagram/sync-insights - Live Ingestion from Meta Graph API
app.post("/api/instagram/sync-insights", async (req, res) => {
  const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
  const account = accountQuery.get('instagram_primary') as any;

  if (!account?.is_connected || !account?.access_token || !account?.account_id) {
    return res.status(400).json({
      success: false,
      error: "Instagram account not connected. Connect account to ingest real insights."
    });
  }

  const insightsRes = await fetchLiveInstagramInsights(account.account_id, decryptSecret(account.access_token));

  if (!insightsRes.success) {
    return res.status(500).json({ success: false, error: insightsRes.error });
  }

  const m = insightsRes.accountMetrics || { impressions: 0, reach: 0, profileViews: 0 };

  // Store snapshot in SQLite
  db.prepare(`
    INSERT INTO insights_snapshots (
      id, timestamp, impressions, reach, profile_views, raw_metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `snap-${Date.now()}`,
    new Date().toISOString(),
    m.impressions,
    m.reach,
    m.profileViews,
    JSON.stringify(insightsRes)
  );

  // Update individual reels with live metrics
  if (insightsRes.recentMediaInsights) {
    const updateReel = db.prepare(`
      UPDATE reels 
      SET reach = ?, views = ?, likes = ?, comments_count = ?, shares = ?, updated_at = ?
      WHERE ig_media_id = ?
    `);
    for (const med of insightsRes.recentMediaInsights) {
      updateReel.run(med.reach, med.plays, med.likes, med.comments, med.shares, new Date().toISOString(), med.mediaId);
    }
  }

  // Update strategy feedback
  const feedback = computeStrategyFeedback();

  res.json({
    success: true,
    metrics: m,
    mediaInsights: insightsRes.recentMediaInsights,
    strategyFeedback: feedback
  });
});

// ==========================================
// 5. DATABASE STATE & WORKSPACE API
// ==========================================

// Helper to assemble full application state from SQLite
function getDatabaseState() {
  const account = getActiveAccount() || {
    id: 'instagram_primary',
    is_connected: 0,
    username: '@SARLX.Ai',
    name: 'SARLX.Ai',
    followers_count: 0,
    follows_count: 0,
    media_count: 0
  };

  const accountPersona = account.persona_json ? JSON.parse(account.persona_json) : null;

  const rawReels = db.prepare('SELECT * FROM reels ORDER BY created_at DESC').all() as any[];
  const prunedReelIds: string[] = [];
  const reels = rawReels.filter(r => {
    if (r.video_url && r.video_url.includes('/media/reels/') && r.status !== 'published') {
      const match = r.video_url.match(/\/media\/reels\/([^?#]+)/);
      const filename = match ? match[1] : path.basename(r.video_url);
      const filePath = path.join(process.cwd(), "data", "media", "reels", filename);
      if (!fs.existsSync(filePath)) {
        prunedReelIds.push(r.id);
        return false;
      }
    }
    return true;
  }).map(r => ({
    id: r.id,
    title: r.title,
    niche: r.niche,
    duration: r.duration,
    audio: r.audio_json ? JSON.parse(r.audio_json) : null,
    scenes: r.scenes_json ? JSON.parse(r.scenes_json) : [],
    caption: r.caption,
    hashtags: r.hashtags_json ? JSON.parse(r.hashtags_json) : [],
    hookScore: r.hook_score,
    retentionEstimate: r.retention_estimate,
    status: r.status,
    videoTemplateId: r.video_template_id,
    videoUrl: r.video_url || undefined,
    instagramPostId: r.ig_media_id || r.ig_container_id || undefined,
    permalink: r.permalink,
    publishTimestamp: r.publish_timestamp,
    views: r.views,
    likes: r.likes,
    commentsCount: r.comments_count,
    shares: r.shares,
    reach: r.reach,
    createdAt: r.created_at
  }));

  if (prunedReelIds.length > 0) {
    try {
      const pl = prunedReelIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM reels WHERE id IN (${pl})`).run(...prunedReelIds);
      console.log(`[Reels] Auto-pruned ${prunedReelIds.length} missing reel(s) from DB.`);
    } catch {}
  }

  const comments = (db.prepare('SELECT * FROM comments_inbox ORDER BY timestamp DESC LIMIT 50').all() as any[]).map(c => ({
    id: c.id,
    author: c.author_username,
    authorHandle: c.author_username,
    text: c.comment_text,
    timestamp: c.timestamp,
    sentiment: c.sentiment,
    replyStatus: c.reply_status,
    replyText: c.reply_text,
    automatedDmSent: Boolean(c.automated_dm_sent),
    reelTitle: 'Instagram Reel'
  }));

  const snapshots = db.prepare('SELECT * FROM insights_snapshots ORDER BY timestamp DESC LIMIT 7').all() as any[];
  const latestSnap = snapshots[0] || { impressions: 0, reach: 0, profile_views: 0 };

  const configRow = (db.prepare('SELECT * FROM autonomous_config WHERE id = ?').get('default_config') as any) || {};
  const logs = (db.prepare('SELECT * FROM autonomous_logs ORDER BY timestamp DESC LIMIT 50').all() as any[]).map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    topicResearched: l.topic_researched,
    webSources: l.web_sources_json ? JSON.parse(l.web_sources_json) : [],
    ideaHook: l.idea_hook,
    reelTitle: l.topic_researched,
    reelId: l.reel_id,
    instagramPostId: l.ig_media_id || 'pending',
    captionPreview: l.idea_hook ? l.idea_hook.slice(0, 80) : '',
    status: l.status,
    reachGained: l.reach_gained,
    viewsGained: l.views_gained
  }));

  const rawPosts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all() as any[];
  const prunedPostIds: string[] = [];
  const posts = rawPosts.filter(p => {
    if (p.slides_json && p.status !== 'published') {
      try {
        const slides = JSON.parse(p.slides_json);
        const hasRenderedImage = slides.some((s: any) => s.imageUrl && s.imageUrl.includes('/media/posts/'));
        if (hasRenderedImage) {
          const firstRendered = slides.find((s: any) => s.imageUrl && s.imageUrl.includes('/media/posts/'));
          const match = firstRendered.imageUrl.match(/\/media\/posts\/([^?#]+)/);
          const filename = match ? match[1] : path.basename(firstRendered.imageUrl);
          const filePath = path.join(process.cwd(), "data", "media", "posts", filename);
          if (!fs.existsSync(filePath)) {
            prunedPostIds.push(p.id);
            return false;
          }
        }
      } catch {}
    }
    return true;
  }).map(p => ({
    id: p.id,
    title: p.title,
    niche: p.niche,
    format: p.format,
    slides: p.slides_json ? JSON.parse(p.slides_json) : [],
    caption: p.caption,
    hashtags: p.hashtags_json ? JSON.parse(p.hashtags_json) : [],
    engagementScore: p.engagement_score,
    status: p.status,
    scheduledTime: p.scheduled_time || undefined,
    scheduledPlatforms: p.scheduled_platforms_json ? JSON.parse(p.scheduled_platforms_json) : ['instagram'],
    instagramPostId: p.ig_media_id || undefined,
    permalink: p.permalink || undefined,
    publishTimestamp: p.publish_timestamp || undefined,
    createdAt: p.created_at
  }));

  if (prunedPostIds.length > 0) {
    try {
      const pl = prunedPostIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM posts WHERE id IN (${pl})`).run(...prunedPostIds);
      console.log(`[Posts] Auto-pruned ${prunedPostIds.length} missing post(s) from DB.`);
    } catch {}
  }

  const strategyFeedback = configRow.strategy_feedback_json ? JSON.parse(configRow.strategy_feedback_json) : computeStrategyFeedback();

  return {
    reels,
    posts,
    comments,
    accounts: getAllAccounts().map(a => ({
      ...a,
      persona: a.persona_json ? JSON.parse(a.persona_json) : null
    })),
    activeAccountId: account.id || 'instagram_primary',
    activePersona: accountPersona,
    autonomousMode: true,
    strategyFeedback,
    autonomous24x7: {
      enabled: Boolean(configRow.enabled),
      intervalMinutes: configRow.interval_minutes || 180,
      formatPreference: configRow.format_preference || 'reels_only',
      lastRun: configRow.last_run,
      nextRun: configRow.next_run,
      targetNiche: configRow.target_niche || accountPersona?.niche || "Must-Know AI Tools & Daily Productivity",
      currentStage: configRow.current_stage || "idle",
      instagramPublishing: {
        enabled: Boolean(account.is_connected),
        method: "graph_api",
        instagramAccountId: account.account_id || "",
        metaAccessToken: "",
        lastPublishedPostId: reels.find(r => r.status === 'published')?.instagramPostId || null
      },
      logs
    },
    analytics: {
      profile: {
        handle: account.username || '@SARLX.Ai',
        name: account.name || 'SARLX.Ai',
        avatar: account.profile_picture_url || '',
        followers: account.followers_count || 0,
        followersChange: 0,
        following: account.follows_count || 0,
        postsCount: account.media_count || reels.filter(r => r.status === 'published').length,
        category: 'AI Growth Engine',
        bio: account.biography || '⚡ Autonomous Instagram growth & reach agent for SARLX.Ai\n🎬 Real-time viral reels, carousels, and 24/7 engagement',
        isVerified: (account.followers_count || 0) > 10000
      },
      metrics: {
        impressions: latestSnap.impressions || 0,
        impressionsChange: 0,
        reach: latestSnap.reach || 0,
        reachChange: 0,
        profileViews: latestSnap.profile_views || 0,
        profileViewsChange: 0,
        totalReelPlays: reels.reduce((acc, r) => acc + (r.views || 0), 0),
        reelPlaysChange: 0,
        avgWatchTimeSeconds: Number(latestSnap.avg_watch_time || 0),
        avgWatchTimeBenchmark: 0,
        loopCompletionRate: Number(latestSnap.loop_completion_rate || 0),
        engagementRate: account.followers_count > 0
          ? Number(((reels.reduce((acc, r) => acc + (r.likes || 0) + (r.commentsCount || 0), 0) / account.followers_count) * 100).toFixed(2))
          : 0
      },
      historicalImpressions: snapshots.length > 0 ? snapshots.map((s, idx) => ({
        date: `Day ${idx + 1}`,
        impressions: s.impressions || 0,
        reelViews: s.total_reel_plays || 0,
        postImpressions: s.impressions || 0
      })) : [
        { date: 'Day 1', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 2', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 3', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 4', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 5', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 6', impressions: 0, reelViews: 0, postImpressions: 0 },
        { date: 'Day 7', impressions: 0, reelViews: 0, postImpressions: 0 }
      ],
      retentionCurve: [
        { second: 0, percentage: 0 },
        { second: 1, percentage: 0 },
        { second: 2, percentage: 0 },
        { second: 3, percentage: 0 },
        { second: 5, percentage: 0 },
        { second: 7, percentage: 0 },
        { second: 8, percentage: 0 }
      ],
      bestPostingSlots: [
        { day: "Monday", time: "18:30", boostPercentage: "Algorithm Slot", isScheduled: false },
        { day: "Wednesday", time: "12:15", boostPercentage: "Algorithm Slot", isScheduled: false },
        { day: "Thursday", time: "19:00", boostPercentage: "Algorithm Slot", isScheduled: false },
        { day: "Friday", time: "17:45", boostPercentage: "Algorithm Slot", isScheduled: false },
        { day: "Sunday", time: "20:00", boostPercentage: "Algorithm Slot", isScheduled: false }
      ]
    }
  };
}

// GET /api/state
app.get("/api/state", (req, res) => {
  const state = getDatabaseState();
  res.json({ success: true, ...state });
});

// GET /api/reels
app.get("/api/reels", (req, res) => {
  const state = getDatabaseState();
  res.json({ success: true, reels: state.reels });
});

// POST /api/reels - Save or update reel in SQLite
// POST /api/agent/generate-reel - Generate an actual Veo 3.1 video for a Reel concept
app.post("/api/agent/generate-reel", async (req, res) => {
  const { niche, topic, duration, audioMood } = req.body || {};
  if (!topic) return res.status(400).json({ success: false, error: "A Reel topic is required." });

  try {
    const reelId = `reel-gemini-${Date.now()}`;
    const requestedDuration = Math.max(4, Math.min(8, Number(duration || 8)));

    const generated = await generateTextJson(
      `Create a production-ready Instagram Reel content package for the topic "${topic}" in the niche "${niche || 'general'}".
Return JSON with title, caption, hashtags, hookScore, retentionEstimate and exactly 3 scenes.
Each scene needs order, durationSeconds, hookText, secondaryText, visualTheme and pacingEffect.
Make the hook concrete and specific. Avoid fake statistics and generic motivational filler.
Use 6-10 relevant hashtags.`
    );

    if (!generated) {
      return res.status(503).json({
        success: false,
        error: "AI text generation is temporarily unavailable. Neither Nemotron nor Gemini could produce the content."
      });
    }

    const reel = {
      id: reelId,
      title: generated.title || topic,
      niche: niche || "General",
      duration: requestedDuration,
      audio: { mood: audioMood || "energetic cinematic" },
      scenes: Array.isArray(generated.scenes) ? generated.scenes : [],
      caption: generated.caption || "",
      hashtags: Array.isArray(generated.hashtags) ? generated.hashtags : [],
      hookScore: Number(generated.hookScore || 92),
      retentionEstimate: Number(generated.retentionEstimate || 85),
      videoUrl: null,
      status: "draft",
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      engine: "TextIntelligence",
      mediaStatus: "content_ready",
      videoStatus: "waiting_for_video_provider",
      reel
    });
  } catch (err) {
    console.error("[Content Engine] Generation failed:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/agent/generate-post - Generate high-converting Instagram Carousel post
app.post("/api/agent/generate-post", async (req, res) => {
  const { niche, topic, format } = req.body || {};
  if (!topic) return res.status(400).json({ success: false, error: "A topic is required." });

  try {
    const prompt = `You are SARLX.Ai, an elite Instagram growth architect and content designer.
Create a high-converting, bookmarkable 4-slide Instagram Carousel for the topic "${topic}" in the niche "${niche || 'general'}".
Return JSON with:
{
  "title": "Punchy title (max 6 words)",
  "engagementScore": 94,
  "caption": "Full high-converting Instagram caption with line breaks, value breakdown, and save CTA",
  "hashtags": ["#SARLXAi", "#tech", "#growth", "#instagramtips"],
  "slides": [
    {
      "slideNumber": 1,
      "headline": "COVER HEADLINE (PUNCHY, UPPERCASE)",
      "bodyText": "Context or curiosity-inducing premise",
      "takeaway": "Swipe to unlock the framework →",
      "theme": "dark"
    },
    {
      "slideNumber": 2,
      "headline": "THE CORE MISTAKE OR BOTTLENECK",
      "bodyText": "Why standard methods fail and the real reason behind it",
      "takeaway": "Actionable diagnostic insight",
      "theme": "indigo"
    },
    {
      "slideNumber": 3,
      "headline": "THE 3-STEP SOLUTION / BLUEPRINT",
      "bodyText": "Step 1: Focus metric. Step 2: Implement protocol. Step 3: Verify outcome.",
      "takeaway": "Instant implementation rule",
      "theme": "slate"
    },
    {
      "slideNumber": 4,
      "headline": "SAVE FOR YOUR NEXT SESSION",
      "bodyText": "Tap the bookmark icon to revisit this when executing your strategy.",
      "takeaway": "Bookmark & Tag a Creator 📌",
      "theme": "emerald"
    }
  ]
}
Each slide theme should be chosen from: 'dark', 'indigo', 'slate', 'emerald', 'amber'.`;

    const generated = await generateTextJson(prompt);
    if (!generated || !Array.isArray(generated.slides) || generated.slides.length < 2) {
      return res.status(503).json({ success: false, error: "AI text generation is temporarily unavailable." });
    }

    const post = {
      id: `post-gen-${Date.now()}`,
      title: generated.title || topic,
      niche: niche || "General",
      format: format || "carousel",
      slides: generated.slides,
      caption: generated.caption || "",
      hashtags: Array.isArray(generated.hashtags) ? generated.hashtags : ["#SARLXAi", "#growth"],
      engagementScore: Number(generated.engagementScore || 94),
      status: "draft",
      createdAt: new Date().toISOString()
    };

    res.json({ success: true, post });
  } catch (err: any) {
    console.error("[Carousel Post Engine] Generation failed:", err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post("/api/reels", (req, res) => {
  const { reel } = req.body;
  if (!reel || !reel.id) {
    return res.status(400).json({ success: false, error: "Invalid reel payload" });
  }

  const existing = db.prepare('SELECT id FROM reels WHERE id = ?').get(reel.id);
  if (existing) {
    db.prepare(`
      UPDATE reels 
      SET title = ?, niche = ?, duration = ?, audio_json = ?, scenes_json = ?, caption = ?, 
          hashtags_json = ?, hook_score = ?, retention_estimate = ?, status = ?, 
          video_template_id = ?, video_url = ?, updated_at = ?
      WHERE id = ?
    `).run(
      reel.title,
      reel.niche || 'Tech',
      reel.duration || 8,
      JSON.stringify(reel.audio || null),
      JSON.stringify(reel.scenes || []),
      reel.caption || '',
      JSON.stringify(reel.hashtags || []),
      reel.hookScore || 90,
      reel.retentionEstimate || 80,
      reel.status || 'draft',
      reel.videoTemplateId || 'template-fast-hook',
      reel.videoUrl || null,
      new Date().toISOString(),
      reel.id
    );
  } else {
    db.prepare(`
      INSERT INTO reels (
        id, title, niche, duration, audio_json, scenes_json, caption, hashtags_json,
        hook_score, retention_estimate, status, video_template_id, video_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reel.id,
      reel.title,
      reel.niche || 'Tech',
      reel.duration || 8,
      JSON.stringify(reel.audio || null),
      JSON.stringify(reel.scenes || []),
      reel.caption || '',
      JSON.stringify(reel.hashtags || []),
      reel.hookScore || 90,
      reel.retentionEstimate || 80,
      reel.status || 'draft',
      reel.videoTemplateId || 'template-fast-hook',
      reel.videoUrl || null,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  // If the reel was saved with status 'scheduled', enqueue background publish job
  if (reel.status === 'scheduled') {
    let runAt = new Date(Date.now() + 60000); // 1 minute from now default
    if (reel.scheduledTime) {
      const raw = String(reel.scheduledTime).trim();
      const direct = new Date(raw);
      // Check if it is a full parseable ISO/datetime timestamp (e.g. 2026-10-07T... or unix time)
      if (!isNaN(direct.getTime()) && !/^\d{1,2}:\d{2}(\s*(am|pm))?$/i.test(raw)) {
        runAt = direct;
      } else {
        const lower = raw.toLowerCase();
        const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          if (lower.includes('pm') && hours < 12) hours += 12;
          if (lower.includes('am') && hours === 12) hours = 0;
          const target = new Date();
          target.setHours(hours, minutes, 0, 0);
          if (lower.includes('tomorrow') || target.getTime() <= Date.now()) {
            target.setDate(target.getDate() + 1);
          }
          runAt = target;
        }
      }
    }

    const existingJob = db.prepare(`
      SELECT id FROM background_jobs 
      WHERE job_type = 'PUBLISH_SCHEDULED_REEL' 
        AND json_extract(payload_json, '$.reelId') = ? 
        AND status IN ('pending', 'processing')
    `).get(reel.id) as any;

    if (!existingJob) {
      const jobId = enqueueJob('PUBLISH_SCHEDULED_REEL', { reelId: reel.id }, runAt);
      console.log(`[Schedule Pipeline] Enqueued scheduled publish job ${jobId} for reel "${reel.title}" to run at ${runAt.toISOString()}`);
    }

    // Pre-render video in background if not already rendered
    if (!reel.videoUrl) {
      renderReelVideo(reel).catch(err => {
        console.warn(`[Schedule Pipeline] Pre-rendering reel ${reel.id} deferred:`, err?.message || String(err));
      });
    }
  }

  res.json({ success: true, reel });
});

// DELETE /api/reels/:id
app.delete("/api/reels/:id", (req, res) => {
  const { id } = req.params;
  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(id) as any;
  if (reel?.video_url) {
    try {
      const match = reel.video_url.match(/\/media\/reels\/([^?#]+)/);
      const filename = match ? match[1] : path.basename(reel.video_url);
      const filePath = path.join(process.cwd(), "data", "media", "reels", filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn(`[Delete Reel] Could not remove video file:`, e);
    }
  }
  db.prepare('DELETE FROM reels WHERE id = ?').run(id);
  db.prepare(`
    DELETE FROM background_jobs 
    WHERE job_type = 'PUBLISH_SCHEDULED_REEL' 
      AND json_extract(payload_json, '$.reelId') = ? 
      AND status IN ('pending', 'processing')
  `).run(id);
  res.json({ success: true, id });
});
// Instant First Comment Engagement Kickstart:
// Breaks the cold-start 0-comment freeze by immediately posting an author discussion
// starter and keyword CTA (e.g. 'ARCHIVE' / 'STORY') directly on the published Instagram media ID.
async function seedInstantFirstComment(
  mediaId: string,
  topicOrTitle: string,
  format: 'reel' | 'carousel',
  account: any,
  pollContext?: { question?: string; optionA?: string; optionB?: string }
): Promise<string | null> {
  if (!mediaId || !account?.access_token) return null;
  try {
    const persona = getActivePersona();
    let commentMessage = format === 'carousel'
      ? `Save this file for your investigation 📌 Comment 'ARCHIVE' below for the full declassified document file 📜 What is your theory on this? 👇`
      : pollContext?.question && pollContext?.optionA && pollContext?.optionB
      ? `📊 COMMUNITY POLL: ${pollContext.question}\n[A] ${pollContext.optionA}\n[B] ${pollContext.optionB}\n\n👇 Drop [A] or [B] below! What's your theory? 📜`
      : `📊 COMMUNITY POLL: What do you believe actually occurred?\n[A] Official recorded explanation\n[B] Classified information was concealed\n\n👇 Drop [A] or [B] below! What's your theory? 📜`;

    if (hasGeminiKey()) {
      try {
        const ctaPrompt = format === 'reel'
          ? `You are ${persona.brand} (${persona.handle}), an elite documentary archive channel dedicated to "${persona.niche}".
Write ONE high-converting COMMUNITY POLL comment to pin as the first comment on our new Instagram Reel about: "${String(topicOrTitle || 'Untold World Mystery').slice(0, 100)}".
${pollContext?.question ? `Topic dilemma context: Question: "${pollContext.question}". Option A: "${pollContext.optionA}". Option B: "${pollContext.optionB}".` : ''}

Format rules:
1. Start with: 📊 COMMUNITY POLL: [Intriguing 1-line question related to the mystery]?
2. Next line: [A] [First perspective/theory]
3. Next line: [B] [Second opposing perspective/theory]
4. Final line: 👇 Drop [A] or [B] below! (Add a compelling call-to-action e.g. "Drop [A] or [B] below • Comment your theory for the unredacted files 📜")
5. Max 35 words. Strictly NO hashtags. Strictly NO mentions of AI, code, or bots.
6. Return ONLY the raw formatted comment text directly.`
          : `You are ${persona.brand} (${persona.handle}), an elite documentary archive channel dedicated to "${persona.niche}".
Write ONE high-curiosity, engaging author comment to pin as the first comment on our new Instagram carousel about: "${String(topicOrTitle || 'Untold World Mystery').slice(0, 100)}".
Rules:
1. Curiosity discussion hook or keyword prompt (e.g. "Comment 'ARCHIVE' below for the declassified documents 📜" or "Did they cover this up, or is there an explanation? Drop your theory 👇").
2. Ask everyday viewers, history buffs, and mystery enthusiasts an intriguing, thought-provoking question.
3. Max 25 words. Strictly NO hashtags. Strictly NO AI, tech tool, or coding mentions.
4. Return ONLY the raw comment string directly.`;

        const res = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: ctaPrompt,
          config: { temperature: 0.7 }
        });
        const text = res.text?.trim()?.replace(/^["']|["']$/g, '');
        if (text && text.length > 8 && text.length < 280 && !/tool|software|code|framework|prompt/i.test(text)) {
          commentMessage = text;
        }
      } catch {}
    }

    console.log(`[Growth Kickstart] Seeding instant first comment on media ${mediaId}: "${commentMessage}"`);
    const commentRes = await postCommentToMedia(mediaId, commentMessage, decryptSecret(account.access_token));
    if (commentRes.success) {
      console.log(`[Growth Kickstart] ✅ First comment posted successfully on Instagram (Comment ID: ${commentRes.commentId})`);
      return commentRes.commentId || null;
    } else {
      console.warn(`[Growth Kickstart] First comment attempt on Instagram: ${commentRes.error || 'Failed'}`);
    }
  } catch (err: any) {
    console.warn(`[Growth Kickstart] Error posting initial comment: ${err?.message || err}`);
  }
  return null;
}

// Internal helper for publishing a reel to Instagram directly
async function publishReelInternal(reel: any, accountParam?: any) {
  const account = accountParam || (db.prepare('SELECT account_id, access_token, is_connected FROM account_connections WHERE id = ?').get('instagram_primary') as any);
  if (!account?.is_connected || !account?.access_token || !account?.account_id) {
    throw new Error("Instagram account not connected. Please connect your Meta Instagram Account in Settings before publishing.");
  }

  let videoUrl = reel.video_url;
  if (videoUrl) {
    const match = videoUrl.match(/\/media\/reels\/([^?]+)/);
    if (match) {
      const diskPath = path.join(process.cwd(), 'data', 'media', 'reels', decodeURIComponent(match[1]));
      if (!fs.existsSync(diskPath)) {
        console.log(`[Reel Publish] Cached video was deleted from disk (${match[1]}). Re-rendering...`);
        videoUrl = null;
      }
    }
  }
  if (!videoUrl) {
    console.log(`[Reel Publish] Rendering video on-the-fly for reel "${reel.title}" (${reel.id})...`);
    videoUrl = await renderReelVideo(reel);
  } else {
    videoUrl = normalizeVideoUrl(videoUrl);
  }

  const reelAudio = (() => {
    try { return JSON.parse(reel.audio_json || '{}'); } catch { return {}; }
  })();
  let hashtags: string[] = [];
  try {
    hashtags = JSON.parse(reel.hashtags_json || '[]');
  } catch {}
  const hashtagStr = Array.isArray(hashtags) ? hashtags.join(' ') : '';
  const fullCaption = `${reel.caption || reel.title}${hashtagStr ? `\n\n${hashtagStr}` : ''}`;

  console.log(`[Reel Publish] Publishing Reel to Instagram (Account: ${account.account_id})...`);
  const pubResult = await publishReelToInstagram(
    account.account_id,
    decryptSecret(account.access_token),
    {
      videoUrl,
      caption: fullCaption,
      audioName: reelAudio?.title ? String(reelAudio.title) : undefined
    }
  );

  if (!pubResult.success) {
    db.prepare(`UPDATE reels SET status = 'failed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), reel.id);
    throw new Error(pubResult.error || "Failed to publish Reel to Instagram");
  }

  const publishedAt = new Date().toISOString();
  db.prepare(`
    UPDATE reels
    SET status = 'published', ig_media_id = ?, ig_container_id = ?, permalink = ?, publish_timestamp = ?, updated_at = ?
    WHERE id = ?
  `).run(
    pubResult.mediaId || null,
    pubResult.containerId || null,
    pubResult.permalink || null,
    publishedAt,
    publishedAt,
    reel.id
  );

  enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { reelId: reel.id, mediaId: pubResult.mediaId || null });
  if (pubResult.mediaId) {
    enqueueJob('SYNC_MEDIA_COMMENTS', { mediaId: pubResult.mediaId });
    let pollContext: { question?: string; optionA?: string; optionB?: string } | undefined;
    try {
      const parsedScenes = JSON.parse(reel.scenes_json || '[]');
      const sceneWithPoll = parsedScenes.find((s: any) => s.interactiveWidget?.question || s.interactiveWidget?.type === 'poll');
      if (sceneWithPoll?.interactiveWidget) {
        pollContext = {
          question: sceneWithPoll.interactiveWidget.question,
          optionA: sceneWithPoll.interactiveWidget.optionA,
          optionB: sceneWithPoll.interactiveWidget.optionB
        };
      }
    } catch {}
    seedInstantFirstComment(pubResult.mediaId, reel.title || reel.caption || 'AI Reel', 'reel', account, pollContext).catch(() => {});
  }
  enqueueJob('ANALYTICS_STRATEGY_FEEDBACK', { reelId: reel.id });

  console.log(`[Reel Publish] Successfully published Reel to Instagram! Media ID: ${pubResult.mediaId}`);

  notifyReelPublished({
    title: reel.title,
    niche: reel.niche,
    permalink: pubResult.permalink,
    mediaId: pubResult.mediaId
  }).catch(() => {});

  return {
    success: true,
    mediaId: pubResult.mediaId,
    permalink: pubResult.permalink,
    containerId: pubResult.containerId
  };
}

// Internal helper for publishing an Instagram carousel post
async function publishCarouselInternal(post: any, accountParam?: any) {
  const account = accountParam || (db.prepare('SELECT account_id, access_token, is_connected FROM account_connections WHERE id = ?').get('instagram_primary') as any);
  if (!account?.is_connected || !account?.access_token || !account?.account_id) {
    throw new Error("Instagram account not connected. Please connect your Meta Instagram Account in Settings before publishing.");
  }

  let slides: any[] = [];
  try {
    slides = typeof post.slides_json === 'string' ? JSON.parse(post.slides_json || '[]') : (post.slides || []);
  } catch {}

  console.log(`[Carousel Publish] Rendering ${slides.length} slides for post "${post.title}" (${post.id})...`);
  const renderedSlides = await renderCarouselPostSlides({
    id: post.id,
    title: post.title,
    slides
  });

  if (renderedSlides.length < 2) {
    throw new Error("Instagram carousels require at least 2 slides.");
  }

  const imageUrls = renderedSlides.map(s => s.url);
  let hashtags: string[] = [];
  try {
    hashtags = typeof post.hashtags_json === 'string' ? JSON.parse(post.hashtags_json || '[]') : (post.hashtags || []);
  } catch {}
  const hashtagStr = Array.isArray(hashtags) ? hashtags.join(' ') : '';
  const fullCaption = `${post.caption || post.title}${hashtagStr ? `\n\n${hashtagStr}` : ''}`;

  console.log(`[Carousel Publish] Publishing to Instagram (Account: ${account.account_id})...`);
  const pubResult = await publishCarouselToInstagram(
    account.account_id,
    decryptSecret(account.access_token),
    {
      imageUrls,
      caption: fullCaption
    }
  );

  if (!pubResult.success) {
    db.prepare(`UPDATE posts SET status = 'failed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), post.id);
    throw new Error(pubResult.error || "Failed to publish carousel to Instagram");
  }

  const publishedAt = new Date().toISOString();
  db.prepare(`
    UPDATE posts
    SET status = 'published', ig_media_id = ?, permalink = ?, publish_timestamp = ?, updated_at = ?
    WHERE id = ?
  `).run(pubResult.mediaId || null, pubResult.permalink || null, publishedAt, publishedAt, post.id);

  enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { mediaId: pubResult.mediaId || null });
  if (pubResult.mediaId) {
    enqueueJob('SYNC_MEDIA_COMMENTS', { mediaId: pubResult.mediaId });
    seedInstantFirstComment(pubResult.mediaId, post.title || post.caption || 'AI Carousel', 'carousel', account).catch(() => {});
  }

  console.log(`[Carousel Publish] Successfully published carousel to Instagram! Media ID: ${pubResult.mediaId}`);

  return {
    success: true,
    mediaId: pubResult.mediaId,
    permalink: pubResult.permalink
  };
}

// POST /api/carousel/convert-to-reel - 1-Click Autonomous Conversion of Carousel into Kinetic 9:16 Reel
app.post("/api/carousel/convert-to-reel", async (req, res) => {
  try {
    const { postId } = req.body || {};
    if (!postId) {
      return res.status(400).json({ success: false, error: "Missing postId parameter" });
    }

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as any;
    if (!post) {
      return res.status(404).json({ success: false, error: `Carousel post "${postId}" not found.` });
    }

    let slides: any[] = [];
    try {
      slides = typeof post.slides_json === 'string' ? JSON.parse(post.slides_json || '[]') : (post.slides || []);
    } catch {
      slides = [];
    }

    if (!Array.isArray(slides) || !slides.length) {
      return res.status(400).json({ success: false, error: "Selected post does not contain any carousel slides." });
    }

    // Ensure slide graphics are rendered on disk
    console.log(`[Carousel-to-Reel] Rendering ${slides.length} slide graphics for post "${post.title}"...`);
    const renderedSlides = await renderCarouselPostSlides({
      id: post.id,
      title: post.title,
      slides
    });

    const persona = getActivePersona();
    const rawScenes = slides.map((slide: any, idx: number) => {
      const rendered = renderedSlides[idx];
      const headline = String(slide.headline || `Key Insight #${idx + 1}`).trim();
      const bodyText = String(slide.bodyText || '').trim();
      const takeaway = String(slide.takeaway || '').trim();
      const voiceScript = `${headline}. ${bodyText || takeaway || ''}`.trim();

      return {
        sceneNumber: idx + 1,
        headline,
        subline: bodyText,
        highlight: takeaway,
        voiceScript,
        visualTheme: slide.theme || 'cinematic',
        visualTemplate: 'split-screen',
        sourceImagePath: rendered?.filePath || null,
        durationSeconds: 5
      };
    });

    const newReelId = `reel-carousel-${Date.now()}`;
    const now = new Date().toISOString();
    let hashtags: string[] = [];
    try {
      hashtags = typeof post.hashtags_json === 'string' ? JSON.parse(post.hashtags_json || '[]') : (post.hashtags || []);
    } catch {
      hashtags = ['#carousel', '#blueprint', '#architecture', '#design', '#cad'];
    }

    const newReel = {
      id: newReelId,
      title: `${post.title} (Kinetic Reel)`,
      niche: post.niche || persona.niche || 'CAD & Architecture',
      caption: `${post.caption || post.title}\n\nConverted from our viral multi-slide carousel.`,
      hashtags,
      status: 'rendering',
      scenes: rawScenes,
      audio: {
        mood: 'High Energy & Driving',
        bpm: 128
      }
    };

    // Insert into reels table
    db.prepare(`
      INSERT INTO reels (
        id, title, niche, caption, hashtags_json, status, scenes_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'rendering', ?, ?, ?)
    `).run(
      newReelId,
      newReel.title,
      newReel.niche,
      newReel.caption,
      JSON.stringify(hashtags),
      JSON.stringify(rawScenes),
      now,
      now
    );

    // Trigger video rendering pipeline
    console.log(`[Carousel-to-Reel] Initiating kinetic video composite for "${newReel.title}"...`);
    const videoUrl = await renderReelVideo(newReel);
    const finalReel = db.prepare('SELECT * FROM reels WHERE id = ?').get(newReelId) as any;

    res.json({
      success: true,
      reelId: newReelId,
      videoUrl,
      reel: {
        ...finalReel,
        hashtags: JSON.parse(finalReel.hashtags_json || '[]'),
        scenes: JSON.parse(finalReel.scenes_json || '[]')
      },
      message: `Successfully converted carousel into 9:16 kinetic reel!`
    });
  } catch (err: any) {
    console.error('[Carousel-to-Reel] Error:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/reels/publish-now - Render and publish Instagram Reel immediately
app.post("/api/reels/publish-now", async (req, res) => {
  const { reelId } = req.body;
  if (!reelId) return res.status(400).json({ success: false, error: "reelId is required." });

  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelId) as any;
  if (!reel) return res.status(404).json({ success: false, error: "Reel not found." });

  try {
    const result = await publishReelInternal(reel);
    res.json({
      success: true,
      mediaId: result.mediaId,
      permalink: result.permalink,
      message: `Reel published directly to Instagram! Media ID: ${result.mediaId}`
    });
  } catch (err: any) {
    console.error("[Reel Publish] Error:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "Failed to publish Reel to Instagram."
    });
  }
});

// POST /api/posts - Save or update carousel post in SQLite
app.post("/api/posts", (req, res) => {
  const { post } = req.body || {};
  if (!post || !post.id) return res.status(400).json({ success: false, error: "post payload with id required." });

  const existing = db.prepare('SELECT id FROM posts WHERE id = ?').get(post.id);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`
      UPDATE posts
      SET title = ?, niche = ?, format = ?, slides_json = ?, caption = ?, hashtags_json = ?,
          engagement_score = ?, status = ?, scheduled_time = ?, scheduled_platforms_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      post.title, post.niche || 'AI', post.format || 'carousel',
      JSON.stringify(post.slides || []), post.caption || '', JSON.stringify(post.hashtags || []),
      post.engagementScore || 90, post.status || 'draft',
      post.scheduledTime || null, JSON.stringify(post.scheduledPlatforms || ['instagram']),
      now, post.id
    );
  } else {
    db.prepare(`
      INSERT INTO posts (
        id, title, niche, format, slides_json, caption, hashtags_json,
        engagement_score, status, scheduled_time, scheduled_platforms_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      post.id, post.title, post.niche || 'AI', post.format || 'carousel',
      JSON.stringify(post.slides || []), post.caption || '', JSON.stringify(post.hashtags || []),
      post.engagementScore || 90, post.status || 'draft',
      post.scheduledTime || null, JSON.stringify(post.scheduledPlatforms || ['instagram']),
      now, now
    );
  }
  res.json({ success: true, post });
});

// DELETE /api/posts/:id
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (post?.slides_json) {
    try {
      const slides = JSON.parse(post.slides_json);
      for (const s of slides) {
        if (s.imageUrl) {
          const match = s.imageUrl.match(/\/media\/posts\/([^?#]+)/);
          const filename = match ? match[1] : path.basename(s.imageUrl);
          const filePath = path.join(process.cwd(), "data", "media", "posts", filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (e) {
      console.warn(`[Delete Post] Could not remove slide files:`, e);
    }
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  res.json({ success: true, id });
});

// POST /api/posts/publish-now - Render and publish Instagram Carousel
app.post("/api/posts/publish-now", async (req, res) => {
  const { postId } = req.body;
  if (!postId) return res.status(400).json({ success: false, error: "postId is required." });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as any;
  if (!post) return res.status(404).json({ success: false, error: "Post not found." });

  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  if (!account?.is_connected || !account?.access_token || !account?.account_id) {
    return res.status(400).json({
      success: false,
      error: "Instagram account not connected. Please connect your Meta Instagram Account in Settings before publishing."
    });
  }

  try {
    const result = await publishCarouselInternal(post, account);
    res.json({
      success: true,
      mediaId: result.mediaId,
      permalink: result.permalink,
      message: `Carousel published directly to Instagram! Media ID: ${result.mediaId}`
    });
  } catch (err: any) {
    console.error("[Carousel Publish] Error:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "Failed to publish carousel to Instagram."
    });
  }
});

// POST /api/comments - Add or update comment in SQLite
app.post("/api/comments", (req, res) => {
  const { comment } = req.body || {};
  if (!comment || !comment.id) return res.status(400).json({ success: false, error: "comment payload required." });

  const existing = db.prepare('SELECT id FROM comments_inbox WHERE id = ?').get(comment.id);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`
      UPDATE comments_inbox
      SET reply_status = ?, reply_text = ?, automated_dm_sent = ?
      WHERE id = ?
    `).run(
      comment.replyStatus || 'pending',
      comment.replyText || null,
      comment.automatedDmSent ? 1 : 0,
      comment.id
    );
  } else {
    db.prepare(`
      INSERT INTO comments_inbox (
        id, ig_comment_id, ig_media_id, author_username, comment_text,
        timestamp, sentiment, reply_status, reply_text, automated_dm_sent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comment.id,
      comment.id,
      comment.ig_media_id || null,
      comment.authorHandle || comment.author || '@user',
      comment.text || '',
      comment.timestamp || now,
      comment.sentiment || 'positive',
      comment.replyStatus || 'pending',
      comment.replyText || null,
      comment.automatedDmSent ? 1 : 0,
      now
    );
  }
  res.json({ success: true, comment });
});

// POST /api/comments/sync - Pull real live comments from Instagram via Meta Graph API
app.post("/api/comments/sync", async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account?.is_connected || !account?.access_token || !account?.account_id) {
      return res.status(400).json({ success: false, error: "Instagram account not connected." });
    }

    const token = decryptSecret(account.access_token);
    const mediaRes = await fetch(`https://graph.instagram.com/v21.0/${account.account_id}/media?fields=id,caption,media_type,comments_count&limit=30&access_token=${token}`);
    const mediaData = await mediaRes.json();

    let syncedCount = 0;
    if (mediaData.data && Array.isArray(mediaData.data)) {
      for (const m of mediaData.data) {
        if (Number(m.comments_count || 0) > 0) {
          try {
            const commentsRes = await fetch(`https://graph.instagram.com/v21.0/${m.id}/comments?fields=id,text,username,timestamp,like_count&access_token=${token}`);
            const commentsData = await commentsRes.json();
            if (commentsData.data && Array.isArray(commentsData.data)) {
              for (const c of commentsData.data) {
                const insertStmt = db.prepare(`
                  INSERT OR IGNORE INTO comments_inbox (
                    id, ig_comment_id, ig_media_id, author_username, comment_text,
                    timestamp, sentiment, reply_status, reply_text, automated_dm_sent, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, 'positive', 'pending', null, 0, ?)
                `);
                const info = insertStmt.run(
                  `comm-${c.id}`,
                  c.id,
                  m.id,
                  `@${c.username || 'user'}`,
                  c.text || '',
                  c.timestamp || new Date().toISOString(),
                  new Date().toISOString()
                );
                if (Number(info.changes || 0) > 0) syncedCount++;
              }
            }
          } catch (cErr) {
            console.warn(`[Comments Sync] Error fetching comments for media ${m.id}:`, cErr);
          }
        }
      }
    }

    const state = getDatabaseState();
    res.json({
      success: true,
      syncedCount,
      comments: state.comments,
      message: syncedCount > 0 ? `Synced ${syncedCount} real comment(s) from Instagram!` : "Comments inbox is in sync with live Instagram feed."
    });
  } catch (err: any) {
    console.error("[Comments Sync] Error:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to sync comments." });
  }
});

// --- Autonomous Agent Swarm (Interaction & Engagement) Endpoints ---

// GET /api/agents - List all deployed agents and their statuses
app.get("/api/agents", (req, res) => {
  try {
    const agents = listAgents();
    const manager = getManagerAuditSummary();
    res.json({ success: true, agents, totalDeployed: agents.length, manager });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/agents/manager - Summary of manager supervision and compliance
app.get("/api/agents/manager", (req, res) => {
  try {
    const managerSummary = getManagerAuditSummary();
    res.json({ success: true, ...managerSummary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agents/:id/toggle - Toggle single agent active/paused
app.post("/api/agents/:id/toggle", (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body || {};
    const agent = toggleAgent(id, active);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agents/toggle-all - Toggle all agents active/paused
app.post("/api/agents/toggle-all", (req, res) => {
  try {
    const { active } = req.body || {};
    const agents = toggleAllAgents(Boolean(active));
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agents/:id/config - Update agent settings (limits, hashtags)
app.post("/api/agents/:id/config", (req, res) => {
  try {
    const { id } = req.params;
    const agent = updateAgentConfig(id, req.body || {});
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/agents/activity - List recent agent activity logs
app.get("/api/agents/activity", (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit || 40));
    const agentId = req.query.agentId ? String(req.query.agentId) : undefined;
    const logs = getActivityLogs(limit, agentId);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agents/run-cycle - Manually trigger an immediate interaction cycle across active agents
app.post("/api/agents/run-cycle", async (req, res) => {
  try {
    const result = await executeSwarmCycle();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agents - Create a new worker agent
app.post("/api/agents", (req, res) => {
  try {
    const { name, role, description, avatarColor, targetHashtags, dailyLimit, config } = req.body || {};
    if (!name || !role) {
      return res.status(400).json({ success: false, error: "Agent name and role are required." });
    }
    const agent = createAgent({ name, role, description, avatarColor, targetHashtags, dailyLimit, config });
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// DELETE /api/agents/:id - Delete an agent from the swarm
app.delete("/api/agents/:id", (req, res) => {
  try {
    const { id } = req.params;
    const result = deleteAgent(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// PUT /api/agents/:id/mission - Assign a mission directive to an agent
app.put("/api/agents/:id/mission", (req, res) => {
  try {
    const { id } = req.params;
    const { missionDirective } = req.body || {};
    if (!missionDirective) {
      return res.status(400).json({ success: false, error: "Mission directive is required." });
    }
    const agent = assignMissionToAgent(id, missionDirective);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/sentinel/directive - Execute manual directive via Sentinel Orchestrator
app.post("/api/sentinel/directive", async (req, res) => {
  try {
    const { directive } = req.body || {};
    if (!directive || typeof directive !== 'string') {
      return res.status(400).json({ success: false, error: "Directive text is required." });
    }
    console.log(`[Sentinel Orchestrator] Executing manual directive: "${directive}"`);
    const result = await processSentinelDirective(directive);
    const updatedAgents = listAgents();
    res.json({ success: true, result, agents: updatedAgents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/sentinel/grow - Trigger autonomous growth orchestration cycle
app.post("/api/sentinel/grow", async (req, res) => {
  try {
    const result = await runSentinelGrowthStrategy();
    const agents = listAgents();
    res.json({ success: true, ...result, agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// --- Browser Surfing Agent Endpoints ---

// GET /api/browser/status - Get browser status and stats
app.get("/api/browser/status", (req, res) => {
  try {
    const status = browserSurfer.getStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/check - Verify live Instagram web session
app.post("/api/browser/check", async (req, res) => {
  try {
    const result = await browserSurfer.checkSession();
    const status = browserSurfer.getStatus();
    res.json({ success: true, ...result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/login - Open visible Chrome window for 1-time Instagram login
app.post("/api/browser/login", async (req, res) => {
  try {
    const result = await browserSurfer.launchHeadedLogin();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/login-credentials - Log in using account username & password
app.post("/api/browser/login-credentials", async (req, res) => {
  try {
    const { username, password, twoFactorCode } = req.body || {};
    if (!username || (!password && !twoFactorCode)) {
      return res.status(400).json({ success: false, error: "Username and password (or 2FA verification code) are required." });
    }
    const result = await browserSurfer.loginWithCredentials(username, password, twoFactorCode);
    const status = browserSurfer.getStatus();
    res.json({ ...result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/cookies - Import session cookies directly (or single sessionid string)
app.post("/api/browser/cookies", async (req, res) => {
  try {
    const { cookies, sessionId } = req.body || {};
    const cookieData = sessionId || cookies;
    if (!cookieData) {
      return res.status(400).json({ success: false, error: "sessionId string or cookies array is required." });
    }
    const result = await browserSurfer.importSessionCookies(cookieData);
    const status = browserSurfer.getStatus();
    res.json({ ...result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/surf - Trigger autonomous reel surfing & engagement
app.post("/api/browser/surf", async (req, res) => {
  try {
    const { targetUrl, niche } = req.body || {};
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'https:' || !/^(www\.)?instagram\.com$/i.test(parsed.hostname)) {
          return res.status(400).json({ success: false, error: "Only official https://instagram.com URLs are permitted." });
        }
      } catch {
        return res.status(400).json({ success: false, error: "Invalid targetUrl format." });
      }
    }
    const result = await browserSurfer.surfAndEngageReel(targetUrl, niche);
    const status = browserSurfer.getStatus();
    res.json({ success: true, result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/human-session - Trigger natural multi-reel surfing session (custom or randomized by Sentinel)
app.post("/api/browser/human-session", async (req, res) => {
  try {
    const { reelsCount } = req.body || {};
    // If reelsCount is provided, use it. If not, browserSurfer randomizes between 20-45 reels.
    const result = await browserSurfer.surfHumanSession({ reelsCount: reelsCount ? Number(reelsCount) : undefined });
    const status = browserSurfer.getStatus();
    res.json({ success: true, result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/sessions/toggle - Toggle Sentinel autonomous 24x7 periodic sessions
app.post("/api/browser/sessions/toggle", async (req, res) => {
  try {
    const current = browserSurfer.getStatus();
    if (current.autonomousSessionsEnabled) {
      browserSurfer.stopAutonomousSessions();
    } else {
      browserSurfer.startAutonomousSessions();
    }
    const status = browserSurfer.getStatus();
    res.json({ success: true, enabled: status.autonomousSessionsEnabled, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/sessions/start - Start Sentinel autonomous 24x7 periodic sessions
app.post("/api/browser/sessions/start", async (req, res) => {
  try {
    const { config } = req.body || {};
    browserSurfer.startAutonomousSessions(config);
    const status = browserSurfer.getStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/sessions/stop - Stop Sentinel autonomous periodic sessions
app.post("/api/browser/sessions/stop", async (_req, res) => {
  try {
    browserSurfer.stopAutonomousSessions();
    const status = browserSurfer.getStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/follow - Follow target creator profile
app.post("/api/browser/follow", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ success: false, error: "Username is required." });
    const result = await browserSurfer.followCreator(username);
    const status = browserSurfer.getStatus();
    res.json({ success: true, result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/dms - Check and reply to incoming DMs
app.post("/api/browser/dms", async (req, res) => {
  try {
    const result = await browserSurfer.checkAndReplyDMs();
    const status = browserSurfer.getStatus();
    res.json({ success: true, result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/stories - Surf Stories & drop natural reactions
app.post("/api/browser/stories", async (req, res) => {
  try {
    const { username } = req.body || {};
    const result = await browserSurfer.surfStoriesAndReact(username);
    const status = browserSurfer.getStatus();
    res.json({ success: true, result, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/browser/interact - Direct remote interaction (click, type, key, scroll) from live stream
app.post("/api/browser/interact", async (req, res) => {
  try {
    const { action, params } = req.body || {};
    if (!action) return res.status(400).json({ success: false, error: "Action is required (click, type, key, scroll)." });
    const result = await browserSurfer.interactDirectly(action, params);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/competitor/mine - Reverse-engineer competitor viral reels & hooks
app.post("/api/competitor/mine", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ success: false, error: "Competitor username is required." });
    const result = await mineAndReverseEngineerCompetitor(username);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/competitor/hooks - Get mined viral hook templates
app.get("/api/competitor/hooks", (_req, res) => {
  try {
    const hooks = getSavedCompetitorHooks();
    res.json({ success: true, hooks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/leads/dms - Get multi-turn DM conversations and qualified leads
app.get("/api/leads/dms", (_req, res) => {
  try {
    const leads = getTrackedDmLeads();
    res.json({ success: true, leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/leads/dms/update - Update lead status or email
app.post("/api/leads/dms/update", (req, res) => {
  try {
    const { id, status, leadEmail } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "Lead ID is required" });
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE dm_conversations SET
        status = COALESCE(?, status),
        lead_email = COALESCE(?, lead_email),
        updated_at = ?
      WHERE id = ?
    `).run(status || null, leadEmail || null, now, id);
    res.json({ success: true, message: "Lead updated successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/triggers/keywords - List all keyword lead magnet triggers
app.get("/api/triggers/keywords", (_req, res) => {
  try {
    const triggers = listLeadMagnetTriggers();
    res.json({ success: true, triggers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/triggers/keywords - Create or update a keyword lead magnet trigger
app.post("/api/triggers/keywords", (req, res) => {
  try {
    const { id, keyword, resource_name, resource_url, message_template, public_reply_template, is_active } = req.body || {};
    if (!keyword) {
      return res.status(400).json({ success: false, error: "Keyword trigger is required" });
    }
    const saved = saveLeadMagnetTrigger({
      id,
      keyword,
      resource_name,
      resource_url,
      message_template,
      public_reply_template,
      is_active: is_active !== false ? 1 : 0
    });
    res.json({ success: true, trigger: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// DELETE /api/triggers/keywords/:id - Remove a keyword trigger
app.delete("/api/triggers/keywords/:id", (req, res) => {
  try {
    const { id } = req.params;
    const ok = deleteLeadMagnetTrigger(id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/triggers/simulate - Test and simulate Comment-to-DM trigger execution
app.post("/api/triggers/simulate", async (req, res) => {
  try {
    const { text, username, mediaId } = req.body || {};
    const commentText = String(text || 'Can you share the CAD blueprint?');
    const author = String(username || 'alex_designer').replace(/^@/, '');
    const authorUsername = `@${author}`;
    const commentId = `sim-${Date.now()}`;
    const mId = mediaId || 'sim-reel-1';

    const trigger = findMatchingLeadTrigger(commentText);
    if (!trigger) {
      return res.json({ 
        success: false, 
        matched: false, 
        message: `No active lead magnet keyword trigger matched "${commentText}". Active triggers: ${listLeadMagnetTriggers().filter(t => t.is_active).map(t => t.keyword).join(', ')}` 
      });
    }

    incrementLeadMagnetTrigger(trigger.id);
    const replyMsg = trigger.public_reply_template || `⚡ Sent! Check your Instagram Direct Messages for the ${trigger.resource_name}!`;

    // Record simulated comment in inbox
    db.prepare(`
      INSERT OR REPLACE INTO comments_inbox (
        id, ig_comment_id, ig_media_id, author_username, comment_text, timestamp, sentiment, reply_status, reply_text, automated_dm_sent, dm_keyword_triggered, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'positive', 'replied', ?, 1, ?, ?)
    `).run(`comm-${commentId}`, commentId, mId, authorUsername, commentText, new Date().toISOString(), replyMsg, trigger.keyword, new Date().toISOString());

    // Dispatch DM conversation lead
    const dmResult = await processDmConversation(`sim-user-${author}`, author, trigger.message_template);

    // Send Telegram alert
    notifyLeadReceived({
      username: authorUsername,
      triggerWord: trigger.keyword,
      commentText,
      dmReplyText: trigger.message_template
    }).catch(() => {});

    res.json({
      success: true,
      matched: true,
      trigger,
      publicReply: replyMsg,
      dmSent: trigger.message_template,
      leadScore: dmResult.leadScore,
      crmStatus: dmResult.status
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/telegram/status - Get Telegram Sentinel configuration state
app.get("/api/telegram/status", (_req, res) => {
  res.json({ success: true, ...getTelegramConfigStatus() });
});

// POST /api/telegram/config - Save and link Telegram Sentinel Bot Token & Chat ID
app.post("/api/telegram/config", (req, res) => {
  const { token, chatId } = req.body || {};
  if (!token || !chatId) {
    return res.status(400).json({ success: false, error: "Both Telegram Bot Token and Chat ID are required." });
  }
  const result = saveTelegramConfig(String(token), String(chatId));
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.message });
  }
  res.json({ success: true, message: result.message });
});

// POST /api/telegram/detect - Automatically discover owner Chat ID via Telegram getUpdates
app.post("/api/telegram/detect", async (req, res) => {
  const { token } = req.body || {};
  const activeToken = token || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!activeToken) {
    return res.status(400).json({ success: false, error: "Please provide a Telegram Bot Token to detect chat updates." });
  }
  const result = await detectTelegramChatId(String(activeToken));
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  res.json(result);
});

// POST /api/telegram/test - Verify Telegram Sentinel Bot connection
app.post("/api/telegram/test", async (_req, res) => {
  const result = await testTelegramAlertDetailed();
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  res.json({ success: true, message: result.message });
});

// GET /api/browser/screenshot/:filename - Serve live browser screenshots with zero-caching
app.get("/api/browser/screenshot/:filename", (req, res) => {
  try {
    const rawFilename = path.basename(req.params.filename || "");
    const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const baseDir = path.resolve(process.cwd(), "data", "media", "browser_screenshots");
    const filePath = path.join(baseDir, cleanFilename);

    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
      return res.status(403).send("Forbidden");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Screenshot not found");
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).send("Error serving screenshot");
  }
});

// GET /api/browser/live-stream - Continuous MJPEG live video broadcast at 30+ FPS from Chromium compositor
app.get("/api/browser/live-stream", (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // Ensure live browser page is active & screencasting
  browserSurfer.ensureLiveStream().catch(() => {});

  // Send initial frame immediately if available
  const initialFrame = browserSurfer.getLatestFrame();
  if (initialFrame) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${initialFrame.length}\r\n\r\n`);
    res.write(initialFrame);
    res.write('\r\n');
  }

  let lastSentTime = Date.now();
  const onFrame = (frameBuffer: Buffer) => {
    if (res.writableEnded) return;
    lastSentTime = Date.now();
    try {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameBuffer.length}\r\n\r\n`);
      res.write(frameBuffer);
      res.write('\r\n');
    } catch {}
  };

  browserSurfer.on('screencast_frame', onFrame);

  // 30 FPS fallback heartbeat (~33ms) so video stream stays butter-smooth even during static pauses
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    // Only send heartbeat if no frame came in recently
    if (Date.now() - lastSentTime >= 33) {
      const frame = browserSurfer.getLatestFrame();
      if (frame) {
        lastSentTime = Date.now();
        try {
          res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
          res.write(frame);
          res.write('\r\n');
        } catch {}
      }
    }
  }, 33);

  req.on('close', () => {
    clearInterval(heartbeat);
    browserSurfer.off('screencast_frame', onFrame);
  });
});

// POST /api/browser/start-stream - Ensure live reels feed stream is initialized
app.post("/api/browser/start-stream", async (req, res) => {
  try {
    const page = await browserSurfer.ensureLiveStream();
    res.json({ success: true, url: page.url() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/agent/growth-strategy - Generate live algorithm insights from metrics
app.post("/api/agent/growth-strategy", async (req, res) => {
  const { metrics, profile } = req.body || {};
  const prompt = `You are the lead AI Social Media Growth Strategist for ${THEME_PAGE_PROFILE.handle} (${THEME_PAGE_PROFILE.brand}) in "${THEME_PAGE_PROFILE.niche}".
Current metrics:
- Impressions: ${metrics?.impressions || 0}
- Reach: ${metrics?.reach || 0}
- Followers: ${profile?.followers || 0}
- Total Reel Plays: ${metrics?.totalReelPlays || 0}
- Pillars: ${THEME_PAGE_PROFILE.pillars.join(", ")}

Generate 3 high-impact, actionable strategy insights to maximize algorithm reach, explore page distribution, and audience retention.
Return JSON ONLY:
{
  "insights": [
    {
      "id": "strat-1",
      "type": "posting_window",
      "title": "Short punchy window title",
      "description": "Concrete analytical reason and recommendation.",
      "impact": "critical",
      "metricTarget": "+35K Projected Impressions",
      "actionLabel": "Schedule Peak Reel",
      "suggestedActionType": "reschedule"
    },
    {
      "id": "strat-2",
      "type": "audio_trend",
      "title": "Audio Velocity Alert",
      "description": "Specific rhythmic recommendation matching 128-142 BPM drop.",
      "impact": "high",
      "metricTarget": "Reach +42%",
      "actionLabel": "Generate Reel with this Track",
      "suggestedActionType": "create_reel"
    },
    {
      "id": "strat-3",
      "type": "opportunity",
      "title": "Turn Comments Into Conversions",
      "description": "Specific community engagement tactic.",
      "impact": "high",
      "metricTarget": "Engagement +50%",
      "actionLabel": "Enable Auto-Reply Mode",
      "suggestedActionType": "enable_auto_reply"
    }
  ]
}`;

  try {
    const aiResult = await generateTextJson(prompt);
    if (aiResult?.insights && Array.isArray(aiResult.insights) && aiResult.insights.length > 0) {
      return res.json({ success: true, insights: aiResult.insights });
    }
  } catch (err: any) {
    console.warn("[Growth Strategy API] Error generating strategy:", err?.message || String(err));
  }

  res.json({
    success: true,
    insights: [
      {
        id: `strat-${Date.now()}-1`,
        type: 'posting_window',
        title: 'High-Velocity Window: Thursday 19:00 UTC',
        description: 'Audience activity peaks in the evening. Scheduling a high-retention 8s Reel captures maximum Explore distribution.',
        impact: 'critical',
        metricTarget: '+45K Projected Impressions',
        actionLabel: 'Schedule Reel to Thursday 19:00',
        suggestedActionType: 'reschedule'
      },
      {
        id: `strat-${Date.now()}-2`,
        type: 'audio_trend',
        title: 'Original Audio Velocity Alert: 132 BPM Bass Drive',
        description: 'Original high-tempo electronic beats with drops at 2.2s accelerate watch completion by +38%.',
        impact: 'high',
        metricTarget: 'Reach +38%',
        actionLabel: 'Generate Reel with this Track',
        suggestedActionType: 'create_reel'
      },
      {
        id: `strat-${Date.now()}-3`,
        type: 'opportunity',
        title: 'Turn Comments Into DM Blueprint Leads',
        description: 'Replying to comments containing keywords like "AGENT" within minutes dramatically increases retention signals.',
        impact: 'high',
        metricTarget: 'Community Engagement +60%',
        actionLabel: 'Enable Auto-Reply Mode',
        suggestedActionType: 'enable_auto_reply'
      }
    ]
  });
});

// POST /api/agent/auto-reply - Generate contextual response for a comment
app.post("/api/agent/auto-reply", async (req, res) => {
  const { commentText, postTitle, authorHandle } = req.body || {};
  if (!commentText) return res.status(400).json({ success: false, error: "commentText is required." });

  const prompt = `You are SARLX.Ai, an intelligent, helpful AI growth agent responding to an Instagram comment on our theme page.
Post: "${postTitle || 'AI Technology & Autonomous Systems'}"
Comment from ${authorHandle || 'viewer'}: "${commentText}"

Generate a smart, authentic, helpful reply.
Keep it concise (1-2 sentences max).
Do not pretend to be human.
Be enthusiastic, technically grounded, and encourage building.
Return JSON ONLY:
{
  "replyText": "Concise authentic reply",
  "intent": "question",
  "shouldReply": true
}`;

  try {
    const aiResult = await generateTextJson(prompt);
    if (aiResult?.replyText) {
      return res.json({ success: true, result: aiResult });
    }
  } catch (err: any) {
    console.warn("[Auto-Reply API] Error generating AI reply:", err?.message || String(err));
  }

  res.json({
    success: true,
    result: {
      replyText: `⚡ Thanks for engaging, ${authorHandle || 'builder'}! Full autonomous workflows are live. Let's build!`,
      intent: 'positive',
      shouldReply: true
    }
  });
});

// POST /api/agent/generate-post - Generate high-density carousel post
app.post("/api/agent/generate-post", async (req, res) => {
  const { topic, niche, format } = req.body || {};
  const prompt = `You are SARLX.Ai, an elite Instagram Carousel Creator for ${THEME_PAGE_PROFILE.handle} in "${niche || THEME_PAGE_PROFILE.niche}".
Create an educational high-density multi-slide Instagram Carousel on: "${topic || 'Autonomous AI Architectures'}".
Must contain 5 informative slides with actionable value.
Return JSON ONLY:
{
  "title": "Compelling Title",
  "caption": "Full high-converting Instagram caption with line breaks and call to action",
  "hashtags": ["#ai", "#agents", "#tech", "#developers", "#build"],
  "engagementScore": 95,
  "slides": [
    {
      "slideNumber": 1,
      "headline": "Bold Hook Headline",
      "bodyText": "Curiosity gap explanation",
      "takeaway": "Swipe to unlock the framework →",
      "theme": "dark"
    },
    {
      "slideNumber": 2,
      "headline": "Step 1: The Core Mechanism",
      "bodyText": "Concrete technical explanation",
      "takeaway": "Key takeaway for developers",
      "theme": "indigo"
    },
    {
      "slideNumber": 3,
      "headline": "Step 2: Practical Implementation",
      "bodyText": "Real-world utility and implementation",
      "takeaway": "Why this changes the workflow",
      "theme": "purple"
    },
    {
      "slideNumber": 4,
      "headline": "Step 3: Avoiding Common Traps",
      "bodyText": "Critical pitfall to avoid",
      "takeaway": "Efficiency unlocked",
      "theme": "pink"
    },
    {
      "slideNumber": 5,
      "headline": "Conclusion & Next Steps",
      "bodyText": "Actionable summary and CTA",
      "takeaway": "Save this post for later 📌",
      "theme": "dark"
    }
  ]
}`;

  try {
    const aiResult = await generateTextJson(prompt);
    if (aiResult?.title && Array.isArray(aiResult.slides) && aiResult.slides.length > 0) {
      return res.json({ success: true, post: { id: `post-${Date.now()}`, ...aiResult, format: format || 'carousel', status: 'draft', createdAt: new Date().toISOString() } });
    }
  } catch (err: any) {
    console.warn("[Generate Post API] Error:", err?.message || String(err));
  }

  res.json({
    success: true,
    post: {
      id: `post-${Date.now()}`,
      title: topic ? `How to 5x Your ${topic}` : "The 2026 Autonomous AI Architecture",
      caption: `Swipe through for the complete high-density breakdown on ${topic || 'AI breakthrough'}.\n\nMost developers spend weeks on workflows that can be automated in minutes.\n\nSave this post so you have the blueprint ready! 📌`,
      hashtags: ["#ai", "#machinelearning", "#buildinpublic", "#developers", "#sarlxai"],
      engagementScore: 94,
      format: format || 'carousel',
      status: 'draft',
      createdAt: new Date().toISOString(),
      slides: [
        { slideNumber: 1, headline: `How to 5x Your ${topic || 'AI Output'}`, bodyText: "The exact framework top engineering teams use in 2026.", takeaway: "Swipe to unlock the framework →", theme: "dark" },
        { slideNumber: 2, headline: "Principle 1: Autonomous Pipelines", bodyText: "Replace manual steps with self-verifying agent loops.", takeaway: "Zero manual intervention.", theme: "indigo" },
        { slideNumber: 3, headline: "Principle 2: Grounded Real-Time Data", bodyText: "Never hallucinate stats; ground all content in verified data.", takeaway: "Accuracy builds retention.", theme: "purple" },
        { slideNumber: 4, headline: "Principle 3: Instant Feedback Loops", bodyText: "Let performance metrics dictate your next content cycle.", takeaway: "Continuous self-improvement.", theme: "pink" },
        { slideNumber: 5, headline: "Ready to Automate?", bodyText: "Comment 'GROWTH' for the full architecture blueprint.", takeaway: "Save this post 📌", theme: "dark" }
      ]
    }
  });
});

// GET /api/comments
app.get("/api/comments", (req, res) => {
  const state = getDatabaseState();
  res.json({ success: true, comments: state.comments });
});

// GET /api/analytics
app.get("/api/analytics", (req, res) => {
  const state = getDatabaseState();
  res.json({ success: true, analytics: state.analytics });
});

// POST /api/reset - Reset metrics & clean database tables
app.post("/api/reset", (req, res) => {
  db.prepare(`DELETE FROM reels`).run();
  db.prepare(`DELETE FROM comments_inbox`).run();
  db.prepare(`DELETE FROM insights_snapshots`).run();
  db.prepare(`DELETE FROM autonomous_logs`).run();
  db.prepare(`DELETE FROM background_jobs`).run();
  
  db.prepare(`
    UPDATE account_connections 
    SET account_id = '', username = '@SARLX.Ai', name = 'SARLX.Ai', profile_picture_url = '',
        biography = '⚡ Autonomous Instagram growth & reach agent for SARLX.Ai',
        followers_count = 0, follows_count = 0, media_count = 0, access_token = '', 
        is_connected = 0, updated_at = ?
    WHERE id = 'instagram_primary'
  `).run(new Date().toISOString());

  const state = getDatabaseState();
  res.json({ success: true, store: state });
});

// ==========================================
// 6. 24x7 AUTONOMOUS AGENT WITH STRATEGY FEEDBACK LOOP
// ==========================================

const AUTONOMOUS_AUDIO_TRACKS = [
  {
    id: "sarlx-original-cyber-pulse",
    title: "SARLX Original — Cyber Pulse",
    artist: "SARLX.Ai",
    bpm: 142,
    category: "Original Electronic",
    duration: 30,
    mood: "High Energy & Driving",
    dropTimestamp: 2.2,
    synthPreset: "cyber-synth"
  },
  {
    id: "sarlx-original-bass-drive",
    title: "SARLX Original — Bass Drive",
    artist: "SARLX.Ai",
    bpm: 128,
    category: "Original Trap / Bass",
    duration: 30,
    mood: "Hyped / Dramatic Cut",
    dropTimestamp: 1.8,
    synthPreset: "trap-bass"
  },
  {
    id: "sarlx-original-neon-groove",
    title: "SARLX Original — Neon Groove",
    artist: "SARLX.Ai",
    bpm: 124,
    category: "Original Deep House",
    duration: 30,
    mood: "Luxury / Smooth Rhythm",
    dropTimestamp: 3.2,
    synthPreset: "deep-house"
  }
];

function normalizeContentText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const CONTENT_STOPWORDS = new Set([
  "about", "after", "again", "also", "been", "being", "could", "does", "doesnt",
  "from", "have", "into", "just", "more", "most", "only", "over", "really",
  "should", "some", "than", "that", "their", "them", "then", "there", "these",
  "they", "this", "through", "very", "what", "when", "where", "which", "while",
  "with", "your", "you", "chatting", "chat", "stop", "using", "time", "run",
  "local", "locally", "ai", "artificial", "intelligence"
]);

function contentWordSet(value: unknown): Set<string> {
  return new Set(
    normalizeContentText(value)
      .split(/\s+/)
      .filter(word => word.length >= 4 && !CONTENT_STOPWORDS.has(word))
  );
}

function contentSimilarity(a: unknown, b: unknown): number {
  const left = contentWordSet(a);
  const right = contentWordSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection++;
  return intersection / Math.max(1, Math.min(left.size, right.size));
}

const GENERIC_HOOK_PATTERNS = [
  /\bai is changing the world\b/i,
  /\bthe future of ai\b/i,
  /\bthis changes everything\b/i,
  /\byou won.?t believe/i,
  /\bhere.?s why ai/i,
  /\bai just got (smarter|better|crazy)\b/i,
  /\bstart giving (your )?ai a job\b/i
];

function autonomousIdeaQualityIssue(topicInfo: { topic: string; ideaHook: string }, recentTopics: string[]): string | null {
  const topic = String(topicInfo.topic || '').trim();
  const hook = String(topicInfo.ideaHook || '').trim();
  if (topic.length < 10) return 'topic is too vague or short';
  if (hook.length < 6 || hook.length > 250) return 'hook length is invalid';
  if (GENERIC_HOOK_PATTERNS.some(pattern => pattern.test(hook))) return 'hook uses a generic or overused AI pattern';

  const topicWords = contentWordSet(topic);
  const hookWords = contentWordSet(hook);
  const sharedWords = [...topicWords].filter(word => hookWords.has(word));
  const sharedSpecificWords = sharedWords.filter(word => /\d/.test(word) || word.length >= 5);
  if (sharedWords.length < 1 && sharedSpecificWords.length < 1) {
    return 'hook does not contain enough specific subject language from the researched topic';
  }

  if (recentTopics.some(previous => contentSimilarity(topic, previous) >= 0.62)) {
    return 'topic is too similar to a recently published/researched topic';
  }

  if ([/ai is changing/i, /future of ai/i, /ai agents? (are|will be)/i, /productivity with ai/i, /how ai is transforming/i]
    .some(pattern => pattern.test(topic))) {
    return 'topic is a generic AI theme rather than a concrete subject';
  }

  return null;
}

function getRecentAutonomousTopics(limit = 20): string[] {
  const rows = db.prepare(
    'SELECT topic_researched FROM autonomous_logs WHERE topic_researched IS NOT NULL AND topic_researched != \'\' ORDER BY timestamp DESC LIMIT ?'
  ).all(limit) as any[];
  return rows.map(row => String(row.topic_researched || '').trim()).filter(Boolean);
}

function getRecentAutonomousNiches(limit = 10): string[] {
  try {
    const rows = db.prepare(
      `SELECT details_json FROM autonomous_logs WHERE details_json IS NOT NULL AND details_json != '' ORDER BY timestamp DESC LIMIT ?`
    ).all(limit) as any[];
    const niches: string[] = [];
    for (const row of rows) {
      try {
        const details = JSON.parse(row.details_json);
        if (details?.vertical?.niche) niches.push(details.vertical.niche);
        else if (details?.niche) niches.push(details.niche);
      } catch {}
    }
    return niches;
  } catch {
    return [];
  }
}

async function researchTopicFromInternet(niche: string, avoidTopics: string[] = [], vertical?: ContentVertical): Promise<{ topic: string; ideaHook: string; webSources: string[] }> {
  if (!hasGeminiKey()) {
    throw new Error("Gemini research is unavailable because GEMINI_API_KEY is not configured.");
  }

  const persona = getActivePersona();
  const brandHandle = persona.handle || THEME_PAGE_PROFILE.handle;
  const brandName = persona.brand || THEME_PAGE_PROFILE.brand;

  const prompt = `You are the autonomous content researcher for ${brandHandle} (${brandName}).
${buildThemeResearchContext(vertical)}

You are an elite investigative researcher for ${brandName}.
Identify ONE specific, fascinating real-world event, mystery, secret infrastructure, or historical moment for high-engagement Instagram content in the "${vertical ? vertical.niche : niche}" focus vertical.
Focus on these vertical pillars:
${vertical ? vertical.pillars.map(p => `• ${p}`).join("\n") : "• Untold true heists, forbidden places, declassified secrets, and deep earth mysteries"}

Do NOT return generic themes such as "History is fascinating", "Nature is mysterious", or vague motivational claims.
PREFER: Specific real-world events, declassified incidents, crazy heists, forbidden places, deep ocean/earth mysteries, or lost ancient artifacts with real documented records (e.g. Bangladesh Bank cyber heist via broken printer, the Greenbrier congressional bunker under a luxury hotel, why planes can't fly over Tibet, Kola Superdeep Borehole sounds, Point Nemo spacecraft graveyard, Antikythera mechanism gears, Roman self-healing concrete).
Your hook MUST name or clearly reference the specific event, location, person, or shocking detail. Never begin with generic patterns such as "Did you know", "In this video", or "Imagine if".
Avoid repeating any recently used topics:
${avoidTopics.length ? avoidTopics.map(topic => "- " + topic).join("\n") : "- none provided"}
The content must reveal ONE tangible, mind-blowing true story or phenomenon clearly in compelling, cinematic storytelling language.
Create a hook that creates intense curiosity for everyday viewers and history/mystery lovers.
Return ONLY valid JSON:
{
  "topic": "Specific named subject + concrete angle",
  "ideaHook": "A sharp 3-second pattern interrupt tied directly to that subject",
  "webSources": ["Specific publication/platform/source label", "Second source label if available"]
}`;

  // First attempt: Gemini + Google Search grounding for genuinely current research.
  if (Date.now() > searchQuotaCooldownUntil) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Search the live web and ${prompt}`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      });

      const text = response.text?.trim() || "";
      if (text) {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.topic && parsed.ideaHook) {
          return {
            topic: parsed.topic,
            ideaHook: parsed.ideaHook,
            webSources: Array.isArray(parsed.webSources) && parsed.webSources.length > 0
              ? parsed.webSources
              : ["Google Search Grounding", "Live Web"]
          };
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isQuota = /429|RESOURCE_EXHAUSTED|quota|Quota exceeded/i.test(errMsg);
      if (isQuota) {
        searchQuotaCooldownUntil = Date.now() + 60000;
        console.info("[Autonomous 24x7 Engine] Google Search grounding quota reached; falling back to plain Gemini research.");
      } else {
        console.info(`[Autonomous 24x7 Engine] Gemini web research failed; falling back to plain Gemini research: ${errMsg.slice(0, 140)}`);
      }
    }
  }

  // Second attempt: Nemotron text intelligence. It synthesizes the research prompt
  // without claiming live browsing or inventing unverifiable URLs.
  const nemotronResult = await generateNemotronJson(`${prompt}
You do not have live web browsing in this request. Do not invent specific URLs or claim that you verified a source. Prefer a concrete named subject, recent product/model/research development, or clearly identifiable AI behavior. If a source cannot be verified, use source labels such as "Nemotron trend synthesis" and "Current AI ecosystem".`);

  if (nemotronResult?.topic && nemotronResult?.ideaHook) {
    searchQuotaCooldownUntil = 0;
    console.info("[Autonomous 24x7 Engine] Nemotron supplied the research candidate after Gemini Search grounding was unavailable.");
    return {
      topic: nemotronResult.topic,
      ideaHook: nemotronResult.ideaHook,
      webSources: Array.isArray(nemotronResult.webSources) && nemotronResult.webSources.length > 0
        ? nemotronResult.webSources
        : ["Nemotron trend synthesis", "Current AI ecosystem"]
    };
  }

  const geminiResult = await generateGeminiJson(prompt);
  if (geminiResult?.topic && geminiResult?.ideaHook) {
    searchQuotaCooldownUntil = 0;
    return {
      topic: geminiResult.topic,
      ideaHook: geminiResult.ideaHook,
      webSources: Array.isArray(geminiResult.webSources) && geminiResult.webSources.length > 0
        ? geminiResult.webSources
        : ["Gemini trend synthesis", "Current AI ecosystem"]
    };
  }

  throw new Error("Text research is unavailable. Nemotron and Gemini research attempts failed.");
}

async function generateAutonomousReelWithStrategy(
  topicInfo: { topic: string; ideaHook: string; webSources: string[] }, 
  niche: string,
  strategy: StrategyFeedback,
  vertical?: ContentVertical
) {
  const audio = AUTONOMOUS_AUDIO_TRACKS[Math.floor(Math.random() * AUTONOMOUS_AUDIO_TRACKS.length)];
  // High-retention Instagram Reel target pacing: ~25s - 35s total duration.
  // Full conversational paragraph voice script per scene dynamically calibrated to TTS speech length!
  const duration = 28;
  const s1Duration = 9.0;
  const s2Duration = 10.5;
  const s3Duration = 8.5;

  let reelData: any = null;
  const persona = getActivePersona();
  const brandName = persona.brand || 'The Untold Archive';
  const brandHandle = persona.handle || '@theuntoldarch';
  const brandTag = brandHandle.replace(/^@/, '#');

  if (hasGeminiKey()) {
    try {
      const prompt = `You are the Lead Creative Director and Viral Strategist for ${brandName} (${brandHandle}), producing world-class viral short-form documentary Reels that convert viewers into loyal followers and generate high explore-page distribution.
ANALYTICS STRATEGY FEEDBACK INJECTION:
- Top performing hook pattern in database: "${strategy.topHookPattern}"
- Target optimal pacing: "${strategy.optimalPacing}"
- High retention audio tempo: "${strategy.highRetentionAudioTempo}"
- Recommended keywords: ${strategy.recommendedNicheKeywords.join(", ")}

Generate a high-velocity, exciting, viral 3-scene 9:16 documentary Reel for ${brandName} (${brandHandle}).
Focus Vertical: ${vertical ? `${vertical.niche} [${vertical.badge}]` : niche}
Visual Aesthetic: ${vertical ? vertical.visualAesthetic : "Cinematic 35mm documentary photography, authentic historical records, atmospheric 8k drone cinematography, dramatic lighting"}

VIRAL RETENTION & CURIOSITY RULES (DOCUMENTARY CINEMA STANDARD):
1. HIGH-TENSION CURIOSITY HOOK (FIRST 0.5s - 2.5s):
   - Never start with pleasantries, slow academic setups, or generic questions.
   - Jump straight into high-stakes historical, geographical, or declassified curiosity loops:
     * Unbelievable Fact: "In 2016, a bank teller noticed a single spelling mistake on a $1 billion wire transfer..."
     * Forbidden Geography: "Commercial flights are banned from flying over this exact mountain range—and here's why."
     * Classified Incident: "For 30 years, thousands of guests stayed at this luxury hotel with no idea a nuclear bunker was under the ballroom."
     * Unsolved Enigma: "Divers pulled a rusted 2,000-year-old gear from a shipwreck—and realized ancient Greeks built a computer."

2. SEAMLESS AUDIO LOOP MECHANIC (CRITICAL FOR >100% WATCH TIME):
   - The final sentence of Scene 3's narration MUST naturally bridge and flow into Scene 1's opening hook when the video replays on Instagram!
   - Example bridge at end of Scene 3: "...which explains the terrifying secret behind why..." -> Loops back into Scene 1: "Commercial flights are completely banned from flying over..."
   - When the Reel loops, viewers continue watching seamlessly, tricking the algorithm into ranking the Reel as viral with 120%+ retention.

3. 3-TIER KINETIC TYPOGRAPHY STRUCTURE (EACH SCENE):
   - "headline": Short, punchy, uppercase pattern interrupt (2-4 words maximum, e.g. "THE $1B MISTAKE", "FORBIDDEN AIRSPACE", "SECRET VAULT").
   - "highlight": Shocking detail, number, or outcome in ALL CAPS (3-5 words, e.g. "A BROKEN PRINTER", "NUCLEAR BLAST DOORS", "2000-YEAR OLD COMPUTER").
   - "subline": Clear, intriguing explanation in simple English (8-14 words).

4. INTERACTIVE VIRAL NARRATION & PARTICIPATION RULES:
   - Each scene MUST include a "voiceScript" containing a full, engaging, conversational paragraph (~25-45 words per scene).
   - Tone: Deeply intriguing, authoritative investigative storyteller (like Vox, Magnates Media, or Lemmino).
   - Scene 1 voiceScript (~8-10s): High-tension mystery dilemma that hooks the viewer immediately and introduces two opposing explanations.
   - Scene 2 voiceScript (~10-12s): The forensic evidence or anomaly breakdown + explicit 0.5s pause challenge directive: "Pause at 0:04 to examine line 3 of the leaked record—notice the unredacted coordinate..."
   - Scene 3 voiceScript (~8-10s): Polarizing Dual-Choice Cross-Examination: "Whose story do you actually believe? Option A or Option B? Comment A or B right now, and our automated archive bot will DM you the declassified proof!" + seamless audio loop bridge phrase into Scene 1.

5. INTERACTIVE VISUAL DIRECTION & WIDGET ARCHETYPES:
   - Scene 1: "full-bleed-cinematic" (high-impact 4K cinematic hook).
   - Scene 2: "pause-challenge" (includes interactiveWidget with type "pause-challenge", pauseTarget e.g. "0:04", and anomalyClue).
   - Scene 3: "satellite-telemetry" (investigative evidence telemetry layout; interactive poll is posted automatically in the pinned first comment).

6. VIRAL INSTAGRAM SEO CAPTION & INTERACTIVE VOTING FUNNEL:
   - Line 1: High search-intent query for Instagram SEO.
   - Middle: 3-4 ultra-practical bullet points summarizing the timeline and evidence.
   - Interactive Community Poll Cue: "🗳️ Vote below: Drop [A] or [B] in the comments — our automated Sentinel will instantly DM you the declassified dossier backing your choice! 👇"
   - Save & Share Multiplier: "📌 Save this archive file so you don't lose it | 🚀 Share with someone who loves mysteries"
   - Follower Nudge: "Follow ${brandHandle} for daily declassified dossiers & historical mysteries 📜"
   - Hashtags: Exactly 5-7 low/mid-tier niche tags (10k-300k volume). Include "${brandTag}".

Theme-page context:
${buildThemeResearchContext(vertical)}

Topic: ${topicInfo.topic}
Hook Concept: ${topicInfo.ideaHook}
Target Duration: 28s (3 scenes, ~8s-11s each calibrated to natural voice speech)
Audio Track: ${audio.title} (${audio.bpm} BPM, drop at ${audio.dropTimestamp}s)

Respond in JSON:
{
  "title": "Short punchy title (max 5 words)",
  "verticalBadge": "${vertical?.badge || '• UNTOLD ARCHIVE •'}",
  "triggerKeyword": "A",
  "hookScore": 99,
  "retentionEstimate": 96,
  "caption": "Full SEO-optimized Instagram caption following the rules above with line breaks, bullets, voting cue [A vs B], Save & Share cue, and follow nudge",
  "hashtags": ["${brandTag}", "#untoldhistory", "#worldmysteries", "#declassified", "#historicalfacts", "#ancienthistory"],
  "scenes": [
    {
      "order": 1,
      "durationSeconds": ${s1Duration},
      "headline": "PUNCHY 2-4 WORD HOOK",
      "highlight": "SHOCKING DILEMMA PREMISE",
      "subline": "Clear and exciting context in simple English (max 12 words)",
      "voiceScript": "Full natural conversational narration script (~30-40 words) hooking the viewer with two competing possibilities.",
      "bRollKeywords": ["specific stock video query 1", "specific stock video query 2"],
      "archivalQuery": "Specific historical entity, photo, or document query for Wikimedia Commons",
      "visualFormat": "full-bleed-cinematic",
      "imagePrompt": "A photorealistic 8K description of a tangible photographic camera shot depicting scene 1. NO text, letters, or logos.",
      "visualTheme": "subject-specific editorial visual",
      "accentColor": "#fbbf24",
      "pacingEffect": "flash-cut"
    },
    {
      "order": 2,
      "durationSeconds": ${s2Duration},
      "headline": "THE UNTOLD EVIDENCE",
      "highlight": "UNREDACTED ANOMALY FOUND",
      "subline": "Pause at 0:04 to inspect line 3 of the leaked document (max 14 words)",
      "voiceScript": "Full natural conversational narration script (~35-45 words) breaking down the evidence and instructing viewers to pause at 0:04 to catch the anomaly.",
      "bRollKeywords": ["specific stock video query 1", "specific stock video query 2"],
      "archivalQuery": "Specific declassified record or photo query for Wikimedia Commons",
      "visualFormat": "pause-challenge",
      "interactiveWidget": {
        "type": "pause-challenge",
        "pauseTarget": "0:04",
        "anomalyClue": "CLASSIFIED TELEGRAM: // RECORD 09-B // ZERO RADAR ECHO"
      },
      "imagePrompt": "A photorealistic 8K description of a tangible photographic camera shot depicting scene 2. NO text, letters, or logos.",
      "visualTheme": "subject-specific mechanism",
      "accentColor": "#f87171",
      "pacingEffect": "zoom-in"
    },
    {
      "order": 3,
      "durationSeconds": ${s3Duration},
      "headline": "WHO DO YOU BELIEVE?",
      "highlight": "OFFICIAL STORY VS WHISTLEBLOWER",
      "subline": "Comment A or B to cast your vote below (max 14 words)",
      "voiceScript": "Full natural conversational narration script (~25-35 words) urging viewers to choose between Option A and Option B, telling them our automated bot will DM the proof, and ending with a seamless loop bridge phrase into scene 1.",
      "bRollKeywords": ["specific stock video query 1", "specific stock video query 2"],
      "archivalQuery": "Specific geographic map or aerial query",
      "visualFormat": "satellite-telemetry",
      "interactiveWidget": {
        "type": "poll",
        "question": "WHO WAS REALLY AT FAULT?",
        "optionA": "OFFICIAL COVER STORY",
        "optionB": "SECRET WHISTLEBLOWER",
        "percentA": 64,
        "percentB": 36
      },
      "imagePrompt": "A photorealistic 8K description of a tangible photographic camera shot depicting scene 3. NO text, letters, or logos.",
      "visualTheme": "subject-specific conclusion",
      "accentColor": "#38bdf8",
      "pacingEffect": "pulse"
    }
  ]
}`;
      const aiResult = await generateTextJson(prompt);
      if (aiResult && aiResult.title && Array.isArray(aiResult.scenes) && aiResult.scenes.length > 0) {
        reelData = aiResult;
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      console.info("[Autonomous 24x7 Engine] Gemini content generation failed; no non-Gemini fallback will be used.");
    }
  }
  if (!reelData) {
    throw new Error("AI text generation is unavailable. Nemotron and Gemini providers both failed.");
  }

  const normalizedScenes = (reelData.scenes || []).map((s: any, idx: number) => {
    const headline = String(s.headline || s.hookText || `INSIGHT ${idx + 1}`).trim();
    const highlight = String(s.highlight || '').trim();
    const subline = String(s.subline || s.secondaryText || '').trim();
    const voiceScript = String(s.voiceScript || s.voiceText || `${headline}. ${highlight}. ${subline}`).trim();
    const visualFormat = s.visualFormat || (idx === 0 ? 'full-bleed-cinematic' : idx === 1 ? 'classified-dossier' : 'satellite-telemetry');
    return {
      ...s,
      headline,
      highlight,
      subline,
      voiceScript,
      voiceText: voiceScript,
      hookText: headline,
      secondaryText: highlight ? `${highlight} — ${subline}` : subline,
      bRollKeywords: Array.isArray(s.bRollKeywords) ? s.bRollKeywords : [],
      archivalQuery: String(s.archivalQuery || '').trim(),
      visualFormat
    };
  });

  return {
    id: `reel-auto-${Date.now()}`,
    title: reelData.title,
    verticalBadge: reelData.verticalBadge || vertical?.badge || '• FRONTIER INTEL •',
    niche: niche || (vertical ? vertical.niche : "Tech & AI"),
    duration: duration,
    audio: audio,
    scenes: normalizedScenes,
    caption: reelData.caption,
    hashtags: reelData.hashtags || ["#SARLXAi", "#reels", "#growth"],
    hookScore: reelData.hookScore || 95,
    retentionEstimate: reelData.retentionEstimate || 88,
    createdAt: new Date().toISOString(),
    status: 'draft',
    scheduledPlatforms: ['instagram'],
    videoTemplateId: 'template-fast-hook',
    views: 0,
    likes: 0,
    commentsCount: 0,
    shares: 0,
    reach: 0
  };
}

async function generateAutonomousCarouselWithStrategy(
  topicInfo: { topic: string; ideaHook: string; webSources: string[] },
  niche: string,
  strategy: StrategyFeedback,
  vertical?: ContentVertical
) {
  let carouselData: any = null;
  const persona = getActivePersona();
  const brandName = persona.brand || 'TEXVIC.Ai';
  const brandHandle = persona.handle || '@texvic_ai';
  const brandTag = brandHandle.replace(/^@/, '#');

  if (hasGeminiKey()) {
    try {
      const prompt = `You are the Lead Visual Strategist for ${brandName} (${brandHandle}), creating viral, accessible AI carousels that drive bookmarks, shares, and new followers.
ANALYTICS STRATEGY FEEDBACK INJECTION:
- Top performing hook pattern in database: "${strategy.topHookPattern}"
- Recommended keywords: ${strategy.recommendedNicheKeywords.join(", ")}

Generate a high-converting, bookmarkable 5-slide Instagram Carousel for normal users and tech enthusiasts.
Focus Vertical: ${vertical ? `${vertical.niche} [${vertical.badge}]` : niche}
Topic: ${topicInfo.topic}
Hook Concept: ${topicInfo.ideaHook}

VIRAL CAROUSEL DESIGN RULES (ACCESSIBLE TO NORMAL VIEWERS & CREATORS):
1. SLIDE 1 (COVER / PATTERN INTERRUPT):
   - Bold uppercase headline (max 5 words, e.g. "5 AI TOOLS YOU NEED", "OPENAI JUST CHANGED EVERYTHING", "DEEPSEEK R1 VS CLAUDE", "AI BREAKTHROUGHS THIS WEEK").
   - Subtitle: Clear, exciting hook explaining what happened or what tools will be revealed.
   - Takeaway: "Swipe to see what changed →"
   - Theme: "dark"
2. SLIDE 2 (THE BREAKTHROUGH / THE FIRST BIG TOOL):
   - Headline: What just launched or Tool #1 / Major Discovery.
   - BodyText: Crystal clear explanation of what it does and why it's insane, written in normal English.
   - Takeaway: Key takeaway or tool name.
   - Theme: "indigo"
3. SLIDE 3 (HOW IT WORKS / TOP PICKS & USE CASES):
   - Headline: Next major capability, Tool #2 & #3, or practical demonstration.
   - BodyText: Actionable breakdown of how normal creators, students, or professionals can use it today.
   - Takeaway: Pro tip for daily use.
   - Theme: "slate"
4. SLIDE 4 (CRAZY BENCHMARK OR MIND-BLOWING ADVANCEMENT):
   - Headline: Jaw-dropping comparison or crazy real-world result.
   - BodyText: Real-world example (e.g. saves 10 hours/week, 90% cheaper, does the work of an entire team).
   - Takeaway: What this means for the future.
   - Theme: "amber"
5. SLIDE 5 (VERDICT & SAVE CTA):
   - Headline: Final verdict & discussion prompt.
   - BodyText: Ask which tool or update they are most excited to try.
   - Takeaway: "Bookmark to save for later 📌"
   - Theme: "emerald"

VIRAL INSTAGRAM SEO CAPTION & MICRO-HASHTAG RULES:
- Line 1: Must be a high-search-intent headline with the topic (e.g. "Save these free AI tools before your next project 📌" or "The ultimate cheat sheet for Claude 3.7 Sonnet:").
- Middle: Quick overview of what each slide covers with clean bullet points.
- Bottom: Dual Save & Comment CTA: "📌 Bookmark this post so you don't lose it | Drop 'TOOLS' below for links 👇"
- Hashtags: Exactly 5-7 low/mid-tier niche tags (10k-300k volume). NO mega-saturated tags like #ai, #tech, #innovation. Use: #aitoolsforcreators, #newaitools, #carousels, #aiupdates, #productivityhacks, #generativeai, #sarlxai.

Respond in JSON:
{
  "title": "Short punchy title (max 6 words)",
  "engagementScore": 96,
  "caption": "Full SEO-optimized Instagram caption following the rules above with line breaks, bullets, and Save CTA",
  "hashtags": ["#SARLXAi", "#aitoolsforcreators", "#newaitools", "#carousels", "#aiupdates", "#productivityhacks"],
  "slides": [
    {
      "slideNumber": 1,
      "headline": "COVER HEADLINE",
      "bodyText": "Crisp exciting setup",
      "takeaway": "Swipe to see what changed →",
      "theme": "dark"
    },
    {
      "slideNumber": 2,
      "headline": "THE BIG UPDATE",
      "bodyText": "Clear explanation of what just happened or tool breakdown",
      "takeaway": "Key takeaway",
      "theme": "indigo"
    },
    {
      "slideNumber": 3,
      "headline": "PRACTICAL HACKS",
      "bodyText": "Step 1, 2, 3 how normal users can take advantage today",
      "takeaway": "Pro tip",
      "theme": "slate"
    },
    {
      "slideNumber": 4,
      "headline": "THE CRAZY ADVANCEMENT",
      "bodyText": "Real-world impact and jaw-dropping comparison",
      "takeaway": "Mind-blowing stat",
      "theme": "amber"
    },
    {
      "slideNumber": 5,
      "headline": "THE FINAL VERDICT",
      "bodyText": "Which of these updates are you most excited to try? Drop a comment below!",
      "takeaway": "Bookmark to save for later 📌",
      "theme": "emerald"
    }
  ]
}`;
      const aiResult = await generateTextJson(prompt);
      if (aiResult && aiResult.title && Array.isArray(aiResult.slides) && aiResult.slides.length >= 2) {
        carouselData = aiResult;
      }
    } catch (e: any) {
      console.info("[Autonomous 24x7 Engine] Gemini carousel generation failed:", e?.message || e);
    }
  }

  if (!carouselData) {
    throw new Error("AI text generation is unavailable. Could not generate carousel.");
  }

  return {
    id: `post-auto-${Date.now()}`,
    title: carouselData.title,
    niche: niche || (vertical ? vertical.niche : "Tech & AI"),
    format: "carousel",
    slides: carouselData.slides,
    caption: carouselData.caption,
    hashtags: carouselData.hashtags || ["#SARLXAi", "#tech", "#growth"],
    engagementScore: Number(carouselData.engagementScore || 94),
    status: "draft",
    createdAt: new Date().toISOString()
  };
}

let isCycleRunning = false;

// Check internet connectivity helper (Meta Graph endpoint probe)
async function checkInternetConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://graph.instagram.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function runAutonomous24x7Cycle(): Promise<{ success: boolean; reel?: any; carousel?: any; log?: any; error?: string }> {
  if (isCycleRunning) {
    return { success: false, error: "An autonomous cycle is already in progress." };
  }
  isCycleRunning = true;

  try {
    const configQuery = db.prepare('SELECT * FROM autonomous_config WHERE id = ?');
    const configRow = configQuery.get('default_config') as any;
    const isCustomNiche = configRow?.target_niche && configRow.target_niche !== 'AI Tech & Breakthroughs' && configRow.target_niche !== THEME_PAGE_PROFILE.niche;

    // Dynamically rotate through high-performing content verticals, prioritizing target_niche if set
    const recentNiches = getRecentAutonomousNiches(5);
    let activeVertical = selectDynamicVertical(recentNiches);
    if (configRow?.target_niche) {
      const matched = CONTENT_VERTICALS.find(v => v.niche.toLowerCase() === configRow.target_niche.toLowerCase());
      if (matched) {
        activeVertical = matched;
      }
    }
    const niche = isCustomNiche ? configRow.target_niche : activeVertical.niche;

    // Stage 1: Research from internet
    db.prepare(`UPDATE autonomous_config SET current_stage = 'researching_web', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 1/4: Researching vertical "${activeVertical.niche}" [${activeVertical.badge}]...`);
    const recentTopics = getRecentAutonomousTopics(20);
    let topicInfo: { topic: string; ideaHook: string; webSources: string[] } | null = null;
    let lastQualityIssue = 'unknown quality issue';

    for (let attempt = 1; attempt <= 3; attempt++) {
      const candidate = await researchTopicFromInternet(niche, recentTopics, activeVertical);
      const qualityIssue = autonomousIdeaQualityIssue(candidate, recentTopics);
      if (!qualityIssue) {
        topicInfo = candidate;
        break;
      }
      lastQualityIssue = qualityIssue;
      recentTopics.push(candidate.topic);
      console.warn(`[Autonomous 24x7 Engine] Rejected research candidate (attempt ${attempt}/3): ${qualityIssue}. Topic="${candidate.topic.slice(0, 120)}"`);
    }

    if (!topicInfo) {
      throw new Error(`No sufficiently specific/fresh autonomous topic was generated after 3 attempts: ${lastQualityIssue}`);
    }

    // Stage 2: Ideating hook
    db.prepare(`UPDATE autonomous_config SET current_stage = 'ideating_hook', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 2/4: Formulating 3-second pattern interrupt hook: "${topicInfo.ideaHook.slice(0, 60)}..."`);

    // Compute live strategy feedback to guide generation
    const strategy = computeStrategyFeedback();

    // Determine content format:
    // Cold-Start Priority Controller:
    // When an account has < 250 followers, Meta's algorithm distributes Carousels only to existing followers (resulting in 0 reach).
    // Reels are the only format algorithmically recommended to non-followers on the Reels tab ('For You' feed).
    // Therefore, in cold-start mode we enforce an 80-85% Reels priority (4 Reels : 1 Carousel ratio).
    const accountRow = db.prepare('SELECT followers_count FROM account_connections WHERE id = ?').get('instagram_primary') as any;
    const followersCount = Number(accountRow?.followers_count || 0);

    // Format selection controller:
    // User mandate: Focus on Reels only. Do NOT post carousels for now.
    const formatPreference = String(configRow?.format_preference || 'reels_only').toLowerCase();
    let targetFormat: 'reel' | 'carousel' = 'reel';

    if (formatPreference === 'carousels_only') {
      console.warn(`[Autonomous 24x7 Engine] format_preference is carousels_only, but Reels-Only focus is active. Enforcing REEL.`);
    }
    targetFormat = 'reel';
    console.log(`[Autonomous 24x7 Engine] Format mode: REELS ONLY (active mandate). Producing moving HD Reel.`);

    console.log(`[Autonomous 24x7 Engine] Chosen publication format: ${targetFormat.toUpperCase()}`);

    // ========================================================
    // FORMAT: CAROUSEL POST
    // ========================================================
    if ((targetFormat as string) === 'carousel') {
      db.prepare(`UPDATE autonomous_config SET current_stage = 'generating_carousel', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
      console.log(`[Autonomous 24x7 Engine] Step 3/5: Synthesizing multi-slide carousel framework with strategy feedback...`);

      const carousel = await generateAutonomousCarouselWithStrategy(topicInfo, niche, strategy, activeVertical);

      // Save into posts table
      db.prepare(`
        INSERT INTO posts (
          id, title, niche, format, slides_json, caption, hashtags_json,
          engagement_score, status, scheduled_time, scheduled_platforms_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'carousel', ?, ?, ?, ?, 'rendering', null, '["instagram"]', ?, ?)
      `).run(
        carousel.id,
        carousel.title,
        carousel.niche,
        JSON.stringify(carousel.slides),
        carousel.caption,
        JSON.stringify(carousel.hashtags),
        carousel.engagementScore,
        new Date().toISOString(),
        new Date().toISOString()
      );

      db.prepare(`UPDATE autonomous_config SET current_stage = 'rendering_carousel_slides', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
      console.log(`[Autonomous 24x7 Engine] Step 4/5: Rendering ${carousel.slides.length} slides for carousel "${carousel.title}"...`);

      const renderedSlides = await renderCarouselPostSlides({
        id: carousel.id,
        title: carousel.title,
        slides: carousel.slides
      });

      if (renderedSlides.length < 2) {
        throw new Error("Rendered carousel has fewer than 2 slides.");
      }

      const imageUrls = renderedSlides.map(s => s.url);
      const hashtagStr = Array.isArray(carousel.hashtags) ? carousel.hashtags.join(' ') : '';
      const fullCaption = `${carousel.caption || carousel.title}${hashtagStr ? `\n\n${hashtagStr}` : ''}`;

      // Check Instagram account connected
      const account = db.prepare('SELECT account_id, access_token, is_connected FROM account_connections WHERE id = ?').get('instagram_primary') as any;
      if (!account?.is_connected || !account?.account_id || !account?.access_token) {
        db.prepare(`UPDATE posts SET status = 'saved', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), carousel.id);
        throw new Error("Instagram is not connected. Carousel saved as draft.");
      }

      db.prepare(`UPDATE autonomous_config SET current_stage = 'publishing', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
      console.log(`[Autonomous 24x7 Engine] Step 5/5: Publishing Carousel to Instagram (Account: ${account.account_id})...`);

      const pubResult = await publishCarouselToInstagram(
        account.account_id,
        decryptSecret(account.access_token),
        {
          imageUrls,
          caption: fullCaption
        }
      );

      if (!pubResult.success) {
        db.prepare(`UPDATE posts SET status = 'failed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), carousel.id);
        throw new Error(pubResult.error || "Carousel publication to Instagram failed.");
      }

      const publishedAt = new Date().toISOString();
      db.prepare(`
        UPDATE posts
        SET status = 'published', ig_media_id = ?, permalink = ?, publish_timestamp = ?, updated_at = ?
        WHERE id = ?
      `).run(
        pubResult.mediaId || null,
        pubResult.permalink || null,
        publishedAt,
        publishedAt,
        carousel.id
      );

      const logId = `log-${Date.now()}`;
      db.prepare(`
        INSERT INTO autonomous_logs (
          id, timestamp, topic_researched, web_sources_json, idea_hook, reel_id, ig_media_id, status, reach_gained, views_gained, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', 0, 0, ?)
      `).run(
        logId,
        publishedAt,
        topicInfo.topic,
        JSON.stringify(topicInfo.webSources),
        topicInfo.ideaHook,
        carousel.id,
        pubResult.mediaId || null,
        JSON.stringify({
          format: 'carousel',
          publishedAt,
          permalink: pubResult.permalink || null,
          mediaId: pubResult.mediaId || null,
          slidesCount: carousel.slides.length
        })
      );

      const intervalMinutes = Math.max(15, Number((db.prepare('SELECT interval_minutes FROM autonomous_config WHERE id = ?').get('default_config') as any)?.interval_minutes || 180));
      const nextRun = new Date(Date.now() + intervalMinutes * 60000).toISOString();

      db.prepare(`UPDATE autonomous_config SET last_run = ?, next_run = ?, current_stage = 'idle', updated_at = ? WHERE id = 'default_config'`)
        .run(publishedAt, nextRun, publishedAt);

      enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { mediaId: pubResult.mediaId || null });
      if (pubResult.mediaId) {
        enqueueJob('SYNC_MEDIA_COMMENTS', { mediaId: pubResult.mediaId });
        seedInstantFirstComment(pubResult.mediaId, topicInfo.topic, 'carousel', account).catch(() => {});
      }

      console.log(`[Autonomous 24x7 Engine] ✅ Carousel successfully published! Media ID: ${pubResult.mediaId}, permalink: ${pubResult.permalink}`);

      return {
        success: true,
        carousel,
        log: {
          id: logId,
          timestamp: publishedAt,
          topicResearched: topicInfo.topic,
          status: 'published',
          mediaId: pubResult.mediaId,
          permalink: pubResult.permalink
        }
      };
    }

    // ========================================================
    // FORMAT: REEL (VIDEO)
    // ========================================================
    // Stage 3: Generating template & reel
    db.prepare(`UPDATE autonomous_config SET current_stage = 'generating_template', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 3/4: Synthesizing scenes & beat-matched audio with strategy feedback...`);
    let reel: any = null;
    let lastReelQualityIssue = 'unknown generated-content quality issue';

    for (let attempt = 1; attempt <= 2; attempt++) {
      const candidateReel = await generateAutonomousReelWithStrategy(topicInfo, niche, strategy, activeVertical);
      const firstScene = candidateReel?.scenes?.[0];
      const firstSceneHook = `${firstScene?.headline || ''} ${firstScene?.highlight || ''} ${firstScene?.subline || firstScene?.hookText || ''}`.trim();
      const reelQualityIssue = autonomousIdeaQualityIssue(
        { topic: topicInfo.topic, ideaHook: firstSceneHook },
        []
      );

      if (!reelQualityIssue) {
        reel = candidateReel;
        break;
      }

      lastReelQualityIssue = reelQualityIssue;
      console.warn(`[Autonomous 24x7 Engine] Rejected generated Reel hook (attempt ${attempt}/2): ${reelQualityIssue}. Hook="${firstSceneHook.slice(0, 120)}"`);
    }

    if (!reel) {
      throw new Error(`AI-generated Reel content failed the quality gate after 2 attempts: ${lastReelQualityIssue}`);
    }

    // Stage 4: Persist, render, validate, publish, and record the autonomous Reel.
    db.prepare(`UPDATE autonomous_config SET current_stage = 'rendering_video', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 4/8: Rendering Reel from the Asset Library...`);

    const reelStatus = 'video_rendering';
    db.prepare(`
      INSERT INTO reels (
        id, title, niche, duration, audio_json, scenes_json, caption, hashtags_json,
        hook_score, retention_estimate, status, video_template_id, video_url, ig_media_id, permalink,
        publish_timestamp, views, likes, comments_count, shares, reach, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)
    `).run(
      reel.id,
      reel.title,
      reel.niche,
      reel.duration,
      JSON.stringify(reel.audio),
      JSON.stringify(reel.scenes),
      reel.caption,
      JSON.stringify(reel.hashtags),
      reel.hookScore,
      reel.retentionEstimate,
      reelStatus,
      reel.videoTemplateId,
      null,
      null,
      null,
      null,
      new Date().toISOString(),
      new Date().toISOString()
    );

    const videoPrompt = [
      `Create an original 9:16 short-form Reel for the SARLX.Ai theme page.`,
      `Topic: ${topicInfo.topic}`,
      `Hook: ${topicInfo.ideaHook}`,
      `Visual direction: cinematic futuristic technology, premium typography space, fast hook, clear payoff.`,
      `Scenes: ${JSON.stringify(reel.scenes)}`,
      `Audio mood: ${reel.audio.mood || "energetic cinematic"}.`,
      `Do not include captions, logos, UI, watermarks, or copyrighted music; TEXVIC handles overlays and publishing.`
    ].join("\n");
    const videoJob = createVideoJob({ reelId: reel.id, prompt: videoPrompt });

    const localAssets = await selectAutonomousSceneAssets(reel);
    let rendered = false;
    let videoUrl: string | null = null;
    let validation: any = null;

    if (localAssets) {
      try {
        const composed = await composeReel({
          reelId: reel.id,
          scenes: localAssets.scenes,
          voicePath: localAssets.voicePath,
          musicPath: localAssets.musicPath,
          width: 1080,
          height: 1920,
          fps: 30
        });

        validation = await validateRenderedReel(composed.outputPath);
        if (!validation.valid) {
          throw new Error(`Video validation failed: ${validation.error || "invalid MP4"}`);
        }

        const videoBody = fs.readFileSync(composed.outputPath);
        const savedJob = await saveVideoOutput(videoJob.id, videoBody, "mp4");
        if (!savedJob?.output_url) {
          throw new Error("Rendered video could not be published to the signed media store.");
        }

        videoUrl = savedJob.output_url;
        rendered = true;

        db.prepare(`
          UPDATE reels
          SET status = 'video_ready', video_url = ?, duration = ?, scenes_json = ?, updated_at = ?
          WHERE id = ?
        `).run(videoUrl, reel.duration, JSON.stringify(localAssets.scenes), new Date().toISOString(), reel.id);

        db.prepare(`UPDATE autonomous_config SET current_stage = 'video_ready', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
        console.log(`[Autonomous 24x7 Engine] Step 5/8: Video rendered and validated (${validation.width}x${validation.height}, ${validation.duration.toFixed(1)}s).`);
      } catch (err: any) {
        const message = err?.message || String(err);
        updateVideoJob(videoJob.id, { status: 'FAILED', error: message });
        db.prepare(`UPDATE reels SET status = 'video_failed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), reel.id);
        db.prepare(`UPDATE autonomous_config SET current_stage = 'video_failed', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
        console.warn(`[Autonomous 24x7 Engine] Local render failed; video worker remains available for retry: ${message}`);
      }
    }

    const logId = `log-${Date.now()}`;
    db.prepare(`
      INSERT INTO autonomous_logs (
        id, timestamp, topic_researched, web_sources_json, idea_hook, reel_id, ig_media_id, status, reach_gained, views_gained, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      logId,
      new Date().toISOString(),
      topicInfo.topic,
      JSON.stringify(topicInfo.webSources),
      topicInfo.ideaHook,
      reel.id,
      null,
      rendered ? 'video_ready' : 'video_queued',
      JSON.stringify({
        format: 'reel',
        videoJobId: videoJob.id,
        vertical: {
          id: activeVertical.id,
          niche: activeVertical.niche,
          badge: activeVertical.badge
        },
        validation,
        renderedLocally: rendered,
        publishStatus: rendered ? 'queued' : 'waiting_for_video_worker'
      })
    );

    if (!rendered) {
      db.prepare(`UPDATE autonomous_config SET last_run = ?, next_run = ?, current_stage = 'video_queued', updated_at = ? WHERE id = 'default_config'`)
        .run(
          new Date().toISOString(),
          new Date(Date.now() + (configRow?.interval_minutes || 180) * 60000).toISOString(),
          new Date().toISOString()
        );
      return {
        success: true,
        reel,
        error: 'Reel content is ready, but local rendering needs a video worker or usable Asset Library footage.',
        log: {
          id: logId,
          timestamp: new Date().toISOString(),
          topicResearched: topicInfo.topic,
          webSources: topicInfo.webSources,
          ideaHook: topicInfo.ideaHook,
          reelTitle: reel.title,
          reelId: reel.id,
          instagramPostId: 'pending_video',
          status: 'video_queued',
          videoJobId: videoJob.id
        }
      };
    }

    // Step 6/8: Validate publish prerequisites.
    db.prepare(`UPDATE autonomous_config SET current_stage = 'validating_publish', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 6/8: Validating Instagram publishing prerequisites...`);

    const account = db.prepare('SELECT account_id, access_token, is_connected FROM account_connections WHERE id = ?').get('instagram_primary') as any;
    if (!account?.is_connected || !account?.account_id || !account?.access_token) {
      db.prepare(`UPDATE reels SET status = 'video_ready', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), reel.id);
      db.prepare(`UPDATE autonomous_config SET last_run = ?, next_run = ?, current_stage = 'waiting_for_instagram', updated_at = ? WHERE id = 'default_config'`)
        .run(
          new Date().toISOString(),
          new Date(Date.now() + (configRow?.interval_minutes || 180) * 60000).toISOString(),
          new Date().toISOString()
        );
      console.log(`[Autonomous 24x7 Engine] Step 7/8: Instagram is not connected; Reel remains video-ready for automatic publication after connection.`);
      return {
        success: true,
        reel,
        error: 'Instagram is not connected. Video is ready and will publish after the account is connected.',
        log: { id: logId, reelId: reel.id, status: 'video_ready', videoJobId: videoJob.id }
      };
    }

    // Step 7/8: Publish Reel directly and synchronously to Meta Instagram
    db.prepare(`UPDATE autonomous_config SET current_stage = 'publishing', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
    console.log(`[Autonomous 24x7 Engine] Step 7/8: Publishing Reel directly to Instagram (Account: ${account.account_id})...`);

    const pubResult = await publishReelInternal({
      ...reel,
      video_url: videoUrl
    }, account);

    const publishedAt = new Date().toISOString();
    db.prepare(`
      UPDATE autonomous_logs
      SET ig_media_id = ?, status = 'published', details_json = ?
      WHERE id = ?
    `).run(
      pubResult.mediaId || null,
      JSON.stringify({
        format: 'reel',
        videoJobId: videoJob.id,
        publishedAt,
        permalink: pubResult.permalink || null,
        mediaId: pubResult.mediaId || null,
        vertical: {
          id: activeVertical.id,
          niche: activeVertical.niche,
          badge: activeVertical.badge
        }
      }),
      logId
    );

    const intervalMinutes = Math.max(15, Number((db.prepare('SELECT interval_minutes FROM autonomous_config WHERE id = ?').get('default_config') as any)?.interval_minutes || 180));
    const nextRun = new Date(Date.now() + intervalMinutes * 60000).toISOString();

    db.prepare(`UPDATE autonomous_config SET last_run = ?, next_run = ?, current_stage = 'idle', updated_at = ? WHERE id = 'default_config'`)
      .run(publishedAt, nextRun, publishedAt);

    computeStrategyFeedback();

    enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { reelId: reel.id, mediaId: pubResult.mediaId || null });
    if (pubResult.mediaId) {
      enqueueJob('SYNC_MEDIA_COMMENTS', { mediaId: pubResult.mediaId });
    }

    console.log(`[Autonomous 24x7 Engine] ✅ Reel successfully published to Instagram! Media ID: ${pubResult.mediaId}, permalink: ${pubResult.permalink}`);

    return {
      success: true,
      reel: {
        ...reel,
        status: 'published',
        videoUrl,
        instagramPostId: pubResult.mediaId,
        permalink: pubResult.permalink,
        publishTimestamp: publishedAt
      },
      log: {
        id: logId,
        timestamp: publishedAt,
        topicResearched: topicInfo.topic,
        status: 'published',
        mediaId: pubResult.mediaId,
        permalink: pubResult.permalink
      }
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error("[Autonomous 24x7 Engine] Cycle execution error:", message);

    const isRateLimit = /request limit reached|rate limit|too many requests|OAuthException.*code.*4/i.test(message);
    const isNetworkError = !isRateLimit && /fetch failed|etimedout|enotfound|econnrefused|network error|offline|eai_again/i.test(message);
    const retryMinutes = isRateLimit
      ? 45
      : isNetworkError
        ? 5
        : Math.max(15, Number((db.prepare('SELECT interval_minutes FROM autonomous_config WHERE id = ?').get('default_config') as any)?.interval_minutes || 180));
    const retryAt = new Date(Date.now() + retryMinutes * 60000).toISOString();
    const stage = isRateLimit ? 'rate_limited' : isNetworkError ? 'network_offline' : 'idle';

    db.prepare(`UPDATE autonomous_config SET last_run = ?, next_run = ?, current_stage = ?, updated_at = ? WHERE id = 'default_config'`)
      .run(new Date().toISOString(), retryAt, stage, new Date().toISOString());

    if (isRateLimit) {
      console.warn(`[Autonomous 24x7 Engine] ⏳ Meta API rate limit active (${message}). Backing off for ${retryMinutes}m to protect account quota.`);
    } else if (isNetworkError) {
      console.warn(`[Autonomous 24x7 Engine] Internet disconnect detected (${message}). Scheduled retry in ${retryMinutes}m as soon as connection stabilizes.`);
    }

    return { success: false, error: message };
  } finally {
    isCycleRunning = false;
  }
}

// Background Daemon for 24x7 Autonomous Engine
let autonomousDaemonTimer: NodeJS.Timeout | null = null;

function initAutonomousDaemon() {
  if (autonomousDaemonTimer) {
    clearInterval(autonomousDaemonTimer);
  }

  const configRow = db.prepare('SELECT * FROM autonomous_config WHERE id = ?').get('default_config') as any;
  const reelCount = Number((db.prepare('SELECT COUNT(*) as count FROM reels').get() as any)?.count || 0);
  if (configRow?.enabled && reelCount === 0) {
    db.prepare(`UPDATE autonomous_config SET next_run = ?, current_stage = 'bootstrapping', updated_at = ? WHERE id = 'default_config'`)
      .run(new Date().toISOString(), new Date().toISOString());
    console.log("[Autonomous 24x7 Daemon] No reels found. Scheduling the first content cycle immediately.");
  }

  console.log("[Autonomous 24x7 Daemon] Initialized SQLite background worker (checking every 30s)...");
  autonomousDaemonTimer = setInterval(async () => {
    try {
      const configRow = db.prepare('SELECT * FROM autonomous_config WHERE id = ?').get('default_config') as any;
      if (!configRow || !configRow.enabled) {
        return;
      }

      // Check internet connectivity
      const online = await checkInternetConnectivity();
      if (!online) {
        if (configRow.current_stage !== 'network_offline') {
          db.prepare(`UPDATE autonomous_config SET current_stage = 'network_offline', updated_at = ? WHERE id = 'default_config'`).run(new Date().toISOString());
          console.warn("[Autonomous 24x7 Daemon] ⚠️ Internet disconnected. Pausing autonomous creation until connectivity returns...");
        }
        return;
      }

      // Online! If previously offline, recover immediately so posts don't stop
      if (configRow.current_stage === 'network_offline') {
        console.log("[Autonomous 24x7 Daemon] 🌐 Internet connectivity restored! Recovering missed publication immediately...");
        db.prepare(`UPDATE autonomous_config SET current_stage = 'idle', next_run = ?, updated_at = ? WHERE id = 'default_config'`)
          .run(new Date().toISOString(), new Date().toISOString());
      }

      // Check for any stalled unpublished reel (from prior failure or disconnect)
      const stalledReel = db.prepare(`
        SELECT * FROM reels 
        WHERE status IN ('publish_queued', 'video_ready', 'scheduled') 
          AND ig_media_id IS NULL
        ORDER BY created_at ASC LIMIT 1
      `).get() as any;

      if (stalledReel && !isCycleRunning) {
        console.log(`[Autonomous 24x7 Daemon] Found pending reel "${stalledReel.title}" (${stalledReel.id}). Publishing immediately to ensure posts don't stop...`);
        try {
          await publishReelInternal(stalledReel);
        } catch (pubErr: any) {
          console.warn(`[Autonomous 24x7 Daemon] Retrying stalled reel failed, marking as failed:`, pubErr?.message || pubErr);
          db.prepare(`UPDATE reels SET status = 'failed', updated_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), stalledReel.id);
        }
        return;
      }

      // Check for any stalled unpublished carousel post (only if format allows carousels)
      const activeFormatPref = String(configRow?.format_preference || 'reels_only').toLowerCase();
      if (activeFormatPref !== 'reels_only') {
        const stalledPost = db.prepare(`
          SELECT * FROM posts 
          WHERE status IN ('publish_queued', 'scheduled') 
            AND ig_media_id IS NULL
          ORDER BY created_at ASC LIMIT 1
        `).get() as any;

        if (stalledPost && !isCycleRunning) {
          console.log(`[Autonomous 24x7 Daemon] Found pending carousel post "${stalledPost.title}" (${stalledPost.id}). Publishing immediately...`);
          try {
            await publishCarouselInternal(stalledPost);
          } catch (pubErr: any) {
            console.warn(`[Autonomous 24x7 Daemon] Retrying stalled post failed, marking as failed:`, pubErr?.message || pubErr);
            db.prepare(`UPDATE posts SET status = 'failed', updated_at = ? WHERE id = ?`)
              .run(new Date().toISOString(), stalledPost.id);
          }
          return;
        }
      }

      const now = Date.now();
      const nextRunTime = configRow.next_run ? new Date(configRow.next_run).getTime() : 0;
      const staleLockTime = new Date(now - 5 * 60 * 1000).toISOString();
      const activeStages = [
        'starting_cycle',
        'researching_web',
        'ideating_hook',
        'generating_template',
        'generating_carousel',
        'rendering_video',
        'rendering_carousel_slides',
        'video_ready',
        'validating_publish',
        'publishing'
      ];

      if (now >= nextRunTime && !isCycleRunning) {
        const lockResult = db.prepare(`
          UPDATE autonomous_config
          SET current_stage = 'starting_cycle', updated_at = ?
          WHERE id = 'default_config'
            AND enabled = 1
            AND next_run IS NOT NULL
            AND next_run <= ?
            AND (
              current_stage IS NULL
              OR current_stage NOT IN (${activeStages.map(() => '?').join(', ')})
              OR updated_at < ?
            )
        `).run(new Date(now).toISOString(), new Date(now).toISOString(), ...activeStages, staleLockTime);

        if (Number(lockResult.changes || 0) !== 1) {
          return;
        }

        console.log("[Autonomous 24x7 Daemon] Scheduled time arrived! Starting automatic content creation cycle...");
        await runAutonomous24x7Cycle();
      }
    } catch (err) {
      console.warn("[Autonomous 24x7 Daemon] Tick error:", err);
    }
  }, 30000);
}

// 24x7 Autonomous Engine Endpoints
app.get("/api/autonomous/status", (req, res) => {
  const state = getDatabaseState();
  res.json({
    success: true,
    config: state.autonomous24x7,
    strategyFeedback: state.strategyFeedback,
    isCycleRunning
  });
});

app.post("/api/autonomous/toggle", (req, res) => {
  const { enabled } = req.body;
  const configRow = db.prepare('SELECT * FROM autonomous_config WHERE id = ?').get('default_config') as any;
  const intervalMins = configRow?.interval_minutes || 180;
  const nextRun = enabled ? new Date(Date.now() + intervalMins * 60000).toISOString() : null;

  db.prepare(`
    UPDATE autonomous_config 
    SET enabled = ?, next_run = ?, updated_at = ? 
    WHERE id = 'default_config'
  `).run(enabled ? 1 : 0, nextRun, new Date().toISOString());

  const state = getDatabaseState();
  res.json({ success: true, config: state.autonomous24x7 });
});

app.post("/api/autonomous/config", (req, res) => {
  const { intervalMinutes, targetNiche, formatPreference } = req.body;

  if (typeof intervalMinutes === "number" && intervalMinutes > 0) {
    const nextRun = new Date(Date.now() + intervalMinutes * 60000).toISOString();
    db.prepare(`UPDATE autonomous_config SET interval_minutes = ?, next_run = ?, updated_at = ? WHERE id = 'default_config'`).run(intervalMinutes, nextRun, new Date().toISOString());
  }

  if (targetNiche) {
    db.prepare(`UPDATE autonomous_config SET target_niche = ?, updated_at = ? WHERE id = 'default_config'`).run(targetNiche, new Date().toISOString());
  }

  if (formatPreference) {
    db.prepare(`UPDATE autonomous_config SET format_preference = ?, updated_at = ? WHERE id = 'default_config'`).run(formatPreference, new Date().toISOString());
  }

  const state = getDatabaseState();
  res.json({ success: true, config: state.autonomous24x7 });
});

app.post("/api/autonomous/trigger-cycle", async (req, res) => {
  const result = await runAutonomous24x7Cycle();
  const state = getDatabaseState();
  res.json({
    ...result,
    analytics: state.analytics,
    config: state.autonomous24x7
  });
});

app.get("/api/tunnel/status", (req, res) => {
  res.json(getTunnelStatus());
});

app.post("/api/tunnel/restart", async (req, res) => {
  await restartTunnel();
  res.json(getTunnelStatus());
});

// Vite Middleware for development & Static Serving for production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/*.db',
            '**/*.db-*',
            '**/*.sqlite*',
            '**/*.log',
            '**/scratch/**',
            '**/.git/**'
          ]
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  startAuthMaintenance();

  // Start background job queue worker
  startJobWorker();

  // Start 24x7 autonomous background reel agent daemon
  initAutonomousDaemon();

  // Start Two-Way Telegram Sentinel Bot Command Listener
  startTelegramCommandListener();

  // Start Autonomous Self-Healing Cloudflare Tunnel Supervisor
  startTunnelSupervisor().catch(err => {
    console.error("[Tunnel Supervisor] Error during tunnel startup:", err);
  });

  // Start 24x7 Agent Surfer Autonomous Sessions with 8-Hour Human Circadian Sleep Scheduling
  browserSurfer.startAutonomousSessions();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Instagram AI Growth Agent Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
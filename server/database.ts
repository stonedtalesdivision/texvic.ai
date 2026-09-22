import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { encryptSecret } from './tokenVault.js';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'sarlx_growth.db');
const db = new DatabaseSync(DB_PATH);

// Configure WAL mode for concurrency and performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

// Initialize Production Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS account_connections (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    account_id TEXT,
    username TEXT,
    name TEXT,
    profile_picture_url TEXT,
    biography TEXT,
    followers_count INTEGER DEFAULT 0,
    follows_count INTEGER DEFAULT 0,
    media_count INTEGER DEFAULT 0,
    access_token TEXT,
    token_expires_at INTEGER,
    is_connected INTEGER DEFAULT 0,
    meta_app_id TEXT,
    meta_app_secret TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reels (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    niche TEXT NOT NULL,
    duration REAL NOT NULL,
    audio_json TEXT,
    scenes_json TEXT,
    caption TEXT,
    hashtags_json TEXT,
    hook_score INTEGER DEFAULT 0,
    retention_estimate INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    video_template_id TEXT,
    video_url TEXT,
    ig_container_id TEXT,
    ig_media_id TEXT,
    permalink TEXT,
    publish_timestamp TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments_inbox (
    id TEXT PRIMARY KEY,
    ig_comment_id TEXT UNIQUE,
    ig_media_id TEXT,
    author_username TEXT,
    author_id TEXT,
    comment_text TEXT,
    timestamp TEXT,
    sentiment TEXT,
    reply_status TEXT,
    reply_text TEXT,
    automated_dm_sent INTEGER DEFAULT 0,
    dm_keyword_triggered TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS insights_snapshots (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    profile_views INTEGER DEFAULT 0,
    total_reel_plays INTEGER DEFAULT 0,
    avg_watch_time REAL DEFAULT 0,
    loop_completion_rate REAL DEFAULT 0,
    engagement_rate REAL DEFAULT 0,
    raw_metrics_json TEXT
  );

  CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    executed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS autonomous_config (
    id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    interval_minutes INTEGER DEFAULT 180,
    target_niche TEXT DEFAULT 'AI Tech & Breakthroughs',
    current_stage TEXT DEFAULT 'idle',
    last_run TEXT,
    next_run TEXT,
    strategy_feedback_json TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS autonomous_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    topic_researched TEXT,
    web_sources_json TEXT,
    idea_hook TEXT,
    reel_id TEXT,
    ig_media_id TEXT,
    status TEXT,
    reach_gained INTEGER DEFAULT 0,
    views_gained INTEGER DEFAULT 0,
    details_json TEXT
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entry_id TEXT,
    payload_json TEXT NOT NULL,
    processed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// Seed default autonomous config if not present
const configStmt = db.prepare('SELECT id FROM autonomous_config WHERE id = ?');
const existingConfig = configStmt.get('default_config');

if (!existingConfig) {
  const insertConfig = db.prepare(`
    INSERT INTO autonomous_config (
      id, enabled, interval_minutes, target_niche, current_stage, 
      last_run, next_run, strategy_feedback_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertConfig.run(
    'default_config',
    1,
    180,
    'AI Tech & Breakthroughs',
    'idle',
    null,
    new Date(Date.now() + 180 * 60000).toISOString(),
    JSON.stringify({
      topHookPattern: "3-Second Bold Contrarian Interruption",
      optimalPacing: "Fast Flash-Cut at 1.8s - 2.4s intervals",
      highRetentionAudioTempo: "128-138 BPM Deep House Drop at 3.2s",
      bestPostingHourUtc: 19,
      recommendedNicheKeywords: ["Autonomous AI", "On-Device LLM", "Agent Architecture", "Zero Cloud Cost"],
      lastAnalyzedAt: new Date().toISOString()
    }),
    new Date().toISOString()
  );
}

// Seed empty default account connection if not present
const accountStmt = db.prepare('SELECT id FROM account_connections WHERE id = ?');
const existingAccount = accountStmt.get('instagram_primary');
if (!existingAccount) {
  const insertAccount = db.prepare(`
    INSERT INTO account_connections (
      id, platform, account_id, username, name, profile_picture_url, biography,
      followers_count, follows_count, media_count, access_token, token_expires_at,
      is_connected, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAccount.run(
    'instagram_primary',
    'instagram',
    process.env.INSTAGRAM_ACCOUNT_ID || '',
    '',
    '',
    '',
    '',
    0,
    0,
    0,
    process.env.META_ACCESS_TOKEN ? encryptSecret(process.env.META_ACCESS_TOKEN) : '',
    null,
    process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID ? 1 : 0,
    new Date().toISOString()
  );
}

export { db };

// Forward-compatible migrations for existing installations.
const reelColumns = db.prepare('PRAGMA table_info(reels)').all() as any[];
if (!reelColumns.some((c: any) => c.name === 'video_url')) {
  db.exec('ALTER TABLE reels ADD COLUMN video_url TEXT');
}

// App secrets are server configuration, never per-account data.
// Keep the legacy column for backward-compatible databases, but the application no longer writes to it.

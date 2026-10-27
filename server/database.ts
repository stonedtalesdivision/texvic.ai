import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { encryptSecret, decryptSecret } from './tokenVault.js';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'sarlx_growth.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS account_connections (
    id TEXT PRIMARY KEY, platform TEXT NOT NULL, account_id TEXT, username TEXT, name TEXT,
    profile_picture_url TEXT, biography TEXT, followers_count INTEGER DEFAULT 0,
    follows_count INTEGER DEFAULT 0, media_count INTEGER DEFAULT 0, access_token TEXT,
    token_expires_at INTEGER, is_connected INTEGER DEFAULT 0, meta_app_id TEXT,
    meta_app_secret TEXT, updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reels (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, niche TEXT NOT NULL, duration REAL NOT NULL,
    audio_json TEXT, scenes_json TEXT, caption TEXT, hashtags_json TEXT,
    hook_score INTEGER DEFAULT 0, retention_estimate INTEGER DEFAULT 0, status TEXT NOT NULL,
    video_template_id TEXT, video_url TEXT, ig_container_id TEXT, ig_media_id TEXT,
    permalink TEXT, publish_timestamp TEXT, views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, reach INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments_inbox (
    id TEXT PRIMARY KEY, ig_comment_id TEXT UNIQUE, ig_media_id TEXT, author_username TEXT,
    author_id TEXT, comment_text TEXT, timestamp TEXT, sentiment TEXT, reply_status TEXT,
    reply_text TEXT, automated_dm_sent INTEGER DEFAULT 0, dm_keyword_triggered TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, niche TEXT, format TEXT NOT NULL DEFAULT 'carousel',
    slides_json TEXT NOT NULL DEFAULT '[]', caption TEXT, hashtags_json TEXT DEFAULT '[]',
    engagement_score INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft',
    scheduled_time TEXT, scheduled_platforms_json TEXT DEFAULT '[]',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS insights_snapshots (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0, profile_views INTEGER DEFAULT 0, total_reel_plays INTEGER DEFAULT 0,
    avg_watch_time REAL DEFAULT 0, loop_completion_rate REAL DEFAULT 0,
    engagement_rate REAL DEFAULT 0, raw_metrics_json TEXT
  );

  CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY, job_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    run_at TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER DEFAULT 0,
    last_error TEXT, executed_at TEXT, created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_jobs (
    id TEXT PRIMARY KEY,
    reel_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    source_url TEXT,
    output_url TEXT,
    output_path TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    category TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    duration REAL,
    width INTEGER,
    height INTEGER,
    source TEXT NOT NULL,
    prompt TEXT,
    mood TEXT,
    camera TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS asset_usage (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    reel_id TEXT NOT NULL,
    scene_number INTEGER NOT NULL,
    transform_json TEXT NOT NULL DEFAULT '{}',
    used_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS autonomous_config (
    id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, interval_minutes INTEGER DEFAULT 180,
    target_niche TEXT DEFAULT 'AI Tech & Breakthroughs', current_stage TEXT DEFAULT 'idle',
    last_run TEXT, next_run TEXT, strategy_feedback_json TEXT, format_preference TEXT DEFAULT 'reels_only',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS autonomous_logs (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, topic_researched TEXT,
    web_sources_json TEXT, idea_hook TEXT, reel_id TEXT, ig_media_id TEXT,
    status TEXT, reach_gained INTEGER DEFAULT 0, views_gained INTEGER DEFAULT 0,
    details_json TEXT
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entry_id TEXT,
    payload_json TEXT NOT NULL, processed INTEGER DEFAULT 0, created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interaction_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    avatar_color TEXT,
    target_hashtags_json TEXT NOT NULL DEFAULT '[]',
    daily_limit INTEGER NOT NULL DEFAULT 30,
    actions_today INTEGER NOT NULL DEFAULT 0,
    total_actions INTEGER NOT NULL DEFAULT 0,
    last_active_at TEXT,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_activity_logs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_media_id TEXT,
    target_media_url TEXT,
    target_author TEXT,
    target_caption TEXT,
    payload_text TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    manager_verdict TEXT DEFAULT 'approved',
    compliance_score INTEGER DEFAULT 100,
    manager_notes TEXT,
    reviewed_by TEXT DEFAULT 'agent_sentinel',
    details_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS competitor_hooks (
    id TEXT PRIMARY KEY,
    competitor_username TEXT NOT NULL,
    reel_url TEXT,
    views_text TEXT,
    original_caption TEXT,
    extracted_hook TEXT,
    psychological_trigger TEXT,
    synthesized_ideas_json TEXT DEFAULT '[]',
    usage_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT,
    thread_id TEXT,
    last_message_text TEXT,
    last_direction TEXT DEFAULT 'inbound',
    status TEXT DEFAULT 'open',
    lead_score INTEGER DEFAULT 0,
    lead_email TEXT,
    messages_json TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lead_magnet_triggers (
    id TEXT PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    resource_name TEXT NOT NULL,
    resource_url TEXT NOT NULL,
    message_template TEXT NOT NULL,
    public_reply_template TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    trigger_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// Ensure columns exist if table was already created in an earlier migration
try { db.exec(`ALTER TABLE agent_activity_logs ADD COLUMN manager_verdict TEXT DEFAULT 'approved'`); } catch {}
try { db.exec(`ALTER TABLE agent_activity_logs ADD COLUMN compliance_score INTEGER DEFAULT 100`); } catch {}
try { db.exec(`ALTER TABLE agent_activity_logs ADD COLUMN manager_notes TEXT`); } catch {}
try { db.exec(`ALTER TABLE agent_activity_logs ADD COLUMN reviewed_by TEXT DEFAULT 'agent_sentinel'`); } catch {}
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_media_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE posts ADD COLUMN permalink TEXT`); } catch {}
try { db.exec(`ALTER TABLE posts ADD COLUMN publish_timestamp TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN scheduled_time TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_video_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_permalink TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_status TEXT DEFAULT 'idle'`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_account_video_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_account_permalink TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN fb_account_status TEXT DEFAULT 'idle'`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN platforms_published_json TEXT DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN research_dossier_json TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN audit_json TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN cover_url TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN cover_path TEXT`); } catch {}
try { db.exec(`ALTER TABLE reels ADD COLUMN syndication_json TEXT DEFAULT '{}'`); } catch {}

// Seed Default Lead Magnet Keyword Triggers
try {
  const insertTrigger = db.prepare(`
    INSERT OR IGNORE INTO lead_magnet_triggers (
      id, keyword, resource_name, resource_url, message_template, public_reply_template, is_active, trigger_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
  `);
  const now = new Date().toISOString();
    insertTrigger.run(
      'trig-cad',
      'CAD',
      'AutoCAD & Revit Pro Blueprint Pack',
      'https://texvic.ai/blueprints',
      'Hey there! 📐 Here is your direct access link to the AutoCAD & Revit Pro Blueprint Pack: https://texvic.ai/blueprints\n\nAre you using this for architecture, engineering, or 3D modeling?',
      '📐 Sent! Check your Instagram Direct Messages for the AutoCAD & Revit Pro Blueprint Pack!',
      now
    );
    insertTrigger.run(
      'trig-archive',
      'ARCHIVE',
      'The Untold Archive Declassified Dossier',
      'https://texvic.ai/archive',
      'Welcome to The Untold Archive 📜 Here is the declassified dossier folder: https://texvic.ai/archive\n\nWhat topic are you currently researching?',
      '📜 Delivered to your DMs! Check your requests folder for the full dossier access link.',
      now
    );
    insertTrigger.run(
      'trig-blueprint',
      'BLUEPRINT',
      'BIM Workflow & Detail Library',
      'https://texvic.ai/blueprints',
      'Here is your BIM & CAD Blueprint master pack: https://texvic.ai/blueprints\n\nLet me know what design software you are running!',
      '🚀 Sent to your DMs! Enjoy the blueprints.',
      now
    );
    insertTrigger.run(
      'trig-preset',
      'PRESET',
      'Kinetic 4K Render Presets',
      'https://texvic.ai/presets',
      'Here are the Kinetic 4K Render Presets: https://texvic.ai/presets\n\nHave you tried rendering these in Lumion or Blender?',
      '⚡ Delivered! Check your Instagram Direct Messages for the download link.',
      now
    );
    insertTrigger.run(
      'trig-vote-a',
      'A',
      'Option [A] Classified Evidence File',
      'https://texvic.ai/archive/vote-a',
      'You voted [A]! 📊 64% of people in our community agree with your take.\n\nHere is the declassified evidence file backing Option A: https://texvic.ai/archive/vote-a\n\nWhat convinced you to pick A over B?',
      '🗳️ Vote registered for [A]! Check your DMs for the declassified evidence file.',
      now
    );
    insertTrigger.run(
      'trig-vote-b',
      'B',
      'Option [B] Whistleblower Investigation',
      'https://texvic.ai/archive/vote-b',
      'You voted [B]! ⚡ Only 36% had the courage to take this side.\n\nHere is the whistleblower record backing Option B: https://texvic.ai/archive/vote-b\n\nWhat convinced you to pick B?',
      '🗳️ Vote registered for [B]! Check your DMs for the whistleblower investigation.',
      now
    );
    insertTrigger.run(
      'trig-solve',
      'SOLVE',
      'Decoded 0.5s Anomaly Analysis',
      'https://texvic.ai/archive/anomaly-solved',
      'You caught the anomaly! 🔍 Here is the full decoded breakdown: https://texvic.ai/archive/anomaly-solved\n\nDid you spot it on the first watch or did you have to rewind?',
      '🔍 Spot on! The decoded anomaly explanation has been sent to your DMs.',
      now
    );
} catch (e) {
  console.warn('[Database] Lead magnet trigger init notice:', e);
}

// Seed Default Interaction Agents (Swarm) for @theuntoldarch
const defaultAgents = [
  {
    id: 'agent_sentinel',
    name: 'Agent Sentinel',
    role: 'Swarm Commander & Account Growth Orchestrator',
    description: 'Supreme autonomous commander of the @theuntoldarch growth collective. Spawns, deletes, and assigns specialized agents, executes manual owner directives, monitors community compliance, and drives organic account growth.',
    status: 'active',
    avatar_color: '#10b981', // Emerald Green
    target_hashtags: ['#growthstrategy', '#community', '#safeguards', '#audit'],
    daily_limit: 150,
    config: {
      isManager: true,
      growthAuthority: 'supreme',
      strictness: 'strict',
      autoVetoUnlawful: true,
      monitoredAgents: ['agent_pulse', 'agent_echo', 'agent_mentor'],
      missionDirective: 'Orchestrate swarm to drive organic growth and engagement for @theuntoldarch',
      compliancePolicies: [
        'Zero harassment, hate speech, defamation, or profanity',
        'Anti-spam velocity protection & cooldown enforcement (< 40 actions/hr)',
        'Zero deceptive links, financial scams, or unsolicited spam',
        'Factual historical accuracy, intriguing tone, and respectful interaction'
      ]
    }
  },
  {
    id: 'agent_pulse',
    name: 'Agent Pulse',
    role: 'Viral Debate & Engagement Igniter',
    description: 'Sparks intense curiosity questions and high-debate discussion hooks under mystery & history reels to drive comment velocity and reciprocal visits to @theuntoldarch.',
    status: 'active',
    avatar_color: '#06b6d4', // Cyan
    target_hashtags: ['#historicalmysteries', '#ancienthistory', '#unexplained', '#declassified', '#documentary'],
    daily_limit: 35,
    config: {
      minIntervalSeconds: 60,
      maxIntervalSeconds: 150,
      exploreNiches: ['Ancient Mysteries', 'Declassified History', 'Earth Anomalies'],
      missionDirective: 'Ignite comment debates on mystery reels'
    }
  },
  {
    id: 'agent_echo',
    name: 'Agent Echo',
    role: 'Mystery & Archival Conversationalist',
    description: 'Explores trending history and unexplained reels, posting intriguing theories and archival observations that rank at the top of comment sections and funnel viewers to @theuntoldarch.',
    status: 'active',
    avatar_color: '#ec4899', // Pink
    target_hashtags: ['#untoldstories', '#ancientcivilization', '#losthistory', '#archaeology', '#mysteries'],
    daily_limit: 18,
    config: {
      tone: 'intriguing_historian',
      commentStyle: 'insightful_observation',
      mentionBrandSubtly: true,
      missionDirective: 'Deliver intriguing historical observations and theories'
    }
  },
  {
    id: 'agent_mentor',
    name: 'Agent Archivist',
    role: 'Declassified Dossier & Historical Evidence Specialist',
    description: 'Investigates documentary reels, unresolved anomalies, and historical debates, providing verified declassified dossier evidence and little-known archival context.',
    status: 'active',
    avatar_color: '#8b5cf6', // Violet
    target_hashtags: ['#declassified', '#historicalfacts', '#coldwar', '#conspiracyfiles', '#archivalevidence'],
    daily_limit: 15,
    config: {
      technicalDepth: 'master_archivist',
      focusAreas: ['Declassified Cold War Files', 'Ancient Lost Civilizations', 'Geopolitical Anomalies'],
      missionDirective: 'Drop declassified file details and historical evidence'
    }
  },
  {
    id: 'agent_surfer',
    name: 'Agent Surfer',
    role: 'Autonomous Web Browser Recon & Direct Engagement Operative',
    description: 'Surfs Instagram Web in a stealth Chromium browser session. Watches external reels, likes, types human-crafted comments, and checks/replies to DMs on behalf of @theuntoldarch.',
    status: 'active',
    avatar_color: '#3b82f6', // Blue
    target_hashtags: ['#ancientmysteries', '#archaeology', '#unexplained', '#documentary', '#directmessages'],
    daily_limit: 25,
    config: {
      browserMode: 'playwright_stealth',
      surfReels: true,
      handleDMs: true,
      minWatchTimeSeconds: 10,
      maxWatchTimeSeconds: 25,
      missionDirective: 'Surf community reels in documentary niche and engage with authentic historical inquiries'
    }
  }
];

const checkAgentStmt = db.prepare('SELECT id FROM interaction_agents WHERE id = ?');
const insertAgentStmt = db.prepare(`
  INSERT INTO interaction_agents (
    id, name, role, description, status, avatar_color,
    target_hashtags_json, daily_limit, actions_today, total_actions,
    last_active_at, config_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, null, ?, ?, ?)
`);

for (const a of defaultAgents) {
  if (!checkAgentStmt.get(a.id)) {
    insertAgentStmt.run(
      a.id, a.name, a.role, a.description, a.status, a.avatar_color,
      JSON.stringify(a.target_hashtags), a.daily_limit,
      JSON.stringify(a.config),
      new Date().toISOString(), new Date().toISOString()
    );
  }
}

// Migrate any existing legacy tech agent records in database to @theuntoldarch documentary roles
try {
  db.prepare(`
    UPDATE interaction_agents 
    SET name = 'Agent Sentinel',
        role = 'Swarm Commander & Account Growth Orchestrator',
        description = 'Supreme autonomous commander of the @theuntoldarch growth collective. Spawns, deletes, and assigns specialized agents, executes manual owner directives, monitors community compliance, and drives organic account growth.',
        target_hashtags_json = '["#growthstrategy", "#community", "#safeguards", "#audit"]'
    WHERE id = 'agent_sentinel'
  `).run();

  db.prepare(`
    UPDATE interaction_agents 
    SET name = 'Agent Pulse',
        role = 'Viral Debate & Engagement Igniter',
        description = 'Sparks intense curiosity questions and high-debate discussion hooks under mystery & history reels to drive comment velocity and reciprocal visits to @theuntoldarch.',
        target_hashtags_json = '["#historicalmysteries", "#ancienthistory", "#unexplained", "#declassified", "#documentary"]'
    WHERE id = 'agent_pulse'
  `).run();

  db.prepare(`
    UPDATE interaction_agents 
    SET name = 'Agent Echo',
        role = 'Mystery & Archival Conversationalist',
        description = 'Explores trending history and unexplained reels, posting intriguing theories and archival observations that rank at the top of comment sections and funnel viewers to @theuntoldarch.',
        target_hashtags_json = '["#untoldstories", "#ancientcivilization", "#losthistory", "#archaeology", "#mysteries"]'
    WHERE id = 'agent_echo'
  `).run();

  db.prepare(`
    UPDATE interaction_agents 
    SET name = 'Agent Archivist',
        role = 'Declassified Dossier & Historical Evidence Specialist',
        description = 'Investigates documentary reels, unresolved anomalies, and historical debates, providing verified declassified dossier evidence and little-known archival context.',
        target_hashtags_json = '["#declassified", "#historicalfacts", "#coldwar", "#conspiracyfiles", "#archivalevidence"]'
    WHERE id = 'agent_mentor'
  `).run();
} catch (migErr) {
  console.warn('[Database] Agent migration notice:', migErr);
}

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
    'default_config', 1, 180, 'Documentary Storytelling: Heists, Forbidden Infrastructure & Global Mysteries', 'idle', null,
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

try {
  db.prepare(`ALTER TABLE autonomous_config ADD COLUMN format_preference TEXT DEFAULT 'reels_only'`).run();
} catch {}
try {
  db.prepare(`UPDATE autonomous_config SET format_preference = 'reels_only' WHERE format_preference IS NULL`).run();
} catch {}

const accountStmt = db.prepare('SELECT id, is_connected FROM account_connections WHERE id = ?');
const existingAccount = accountStmt.get('instagram_primary') as any;
if (!existingAccount) {
  const insertAccount = db.prepare(`
    INSERT INTO account_connections (
      id, platform, account_id, username, name, profile_picture_url, biography,
      followers_count, follows_count, media_count, access_token, token_expires_at,
      is_connected, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAccount.run(
    'instagram_primary', 'instagram', process.env.INSTAGRAM_ACCOUNT_ID || '', '',
    '', '', '', 0, 0, 0, process.env.META_ACCESS_TOKEN ? encryptSecret(process.env.META_ACCESS_TOKEN) : '',
    null, process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID ? 1 : 0,
    new Date().toISOString()
  );
} else if ((!existingAccount.is_connected || !existingAccount.access_token) && process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN) {
  db.prepare(`
    UPDATE account_connections
    SET account_id = ?, access_token = ?, is_connected = 1, updated_at = ?
    WHERE id = 'instagram_primary'
  `).run(
    process.env.INSTAGRAM_ACCOUNT_ID,
    encryptSecret(process.env.META_ACCESS_TOKEN),
    new Date().toISOString()
  );
}

// Auto-initialize Facebook Page connection from environment variables if provided
const envFbPageId = process.env.FACEBOOK_PAGE_ID || '';
const envFbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || '';
if (envFbPageId && envFbToken) {
  const existingFbPage = accountStmt.get('facebook_page') as any;
  if (!existingFbPage) {
    const insertFbAccount = db.prepare(`
      INSERT INTO account_connections (
        id, platform, account_id, username, name, profile_picture_url, biography,
        followers_count, follows_count, media_count, access_token, token_expires_at,
        is_connected, updated_at
      ) VALUES (?, ?, ?, ?, ?, '', '', 0, 0, 0, ?, null, 1, ?)
    `);
    insertFbAccount.run(
      'facebook_page', 'facebook_page', envFbPageId, 'Facebook Page',
      'Facebook Page', encryptSecret(envFbToken), new Date().toISOString()
    );
  } else if (!existingFbPage.is_connected) {
    db.prepare(`
      UPDATE account_connections
      SET account_id = ?, access_token = ?, is_connected = 1, updated_at = ?
      WHERE id = 'facebook_page'
    `).run(
      envFbPageId,
      encryptSecret(envFbToken),
      new Date().toISOString()
    );
  }
}

// Table migrations for multi-account and dynamic persona support
const accountColumns = db.prepare('PRAGMA table_info(account_connections)').all() as any[];
if (!accountColumns.some((c: any) => c.name === 'is_active')) {
  db.exec('ALTER TABLE account_connections ADD COLUMN is_active INTEGER DEFAULT 0');
}
if (!accountColumns.some((c: any) => c.name === 'persona_json')) {
  db.exec('ALTER TABLE account_connections ADD COLUMN persona_json TEXT');
}

// Ensure at least one account is marked active
const activeCount = Number((db.prepare('SELECT COUNT(*) as count FROM account_connections WHERE is_active = 1').get() as any)?.count || 0);
if (activeCount === 0) {
  db.prepare("UPDATE account_connections SET is_active = 1 WHERE id = 'instagram_primary'").run();
}

const reelColumns = db.prepare('PRAGMA table_info(reels)').all() as any[];
if (!reelColumns.some((c: any) => c.name === 'video_url')) {
  db.exec('ALTER TABLE reels ADD COLUMN video_url TEXT');
}
if (!reelColumns.some((c: any) => c.name === 'account_id')) {
  db.exec('ALTER TABLE reels ADD COLUMN account_id TEXT');
}

const postColumns = db.prepare('PRAGMA table_info(posts)').all() as any[];
if (!postColumns.some((c: any) => c.name === 'account_id')) {
  db.exec('ALTER TABLE posts ADD COLUMN account_id TEXT');
}

const existingTokenRow = db.prepare("SELECT id, access_token FROM account_connections WHERE id = 'instagram_primary'").get() as any;
if (existingTokenRow?.access_token && !String(existingTokenRow.access_token).startsWith('enc:v1:')) {
  db.prepare("UPDATE account_connections SET access_token = ? WHERE id = 'instagram_primary'")
    .run(encryptSecret(String(existingTokenRow.access_token)));
}

/**
 * Returns the currently active managed account, falling back to primary.
 */
export function getActiveAccount(): any {
  const active = db.prepare('SELECT * FROM account_connections WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get() as any;
  if (active) return active;
  return db.prepare("SELECT * FROM account_connections WHERE id = 'instagram_primary'").get() as any;
}

/**
 * Returns all managed accounts with decrypted metadata flags.
 */
export function getAllAccounts(): any[] {
  return db.prepare('SELECT id, platform, account_id, username, name, profile_picture_url, biography, followers_count, follows_count, media_count, is_connected, is_active, persona_json, updated_at FROM account_connections ORDER BY is_active DESC, updated_at DESC').all() as any[];
}

/**
 * Switches the active account in the workspace.
 */
export function switchActiveAccount(accountId: string): any {
  db.prepare('UPDATE account_connections SET is_active = 0').run();
  db.prepare('UPDATE account_connections SET is_active = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), accountId);
  return getActiveAccount();
}

/**
 * Updates the stored Content DNA persona for an account.
 */
export function updateAccountPersona(accountId: string, persona: any): void {
  db.prepare('UPDATE account_connections SET persona_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(persona), new Date().toISOString(), accountId);
}

/**
 * Returns the currently active Facebook Page connection (from SQLite or .env fallback)
 */
export function getFacebookPageConnection(): {
  pageId: string;
  accessToken: string;
  isConnected: boolean;
  name?: string;
  username?: string;
} | null {
  try {
    const dbRow = db.prepare("SELECT * FROM account_connections WHERE id = 'facebook_page' OR platform = 'facebook_page' LIMIT 1").get() as any;
    if (dbRow && dbRow.is_connected && dbRow.access_token && dbRow.account_id) {
      let token = '';
      try {
        token = decryptSecret(dbRow.access_token);
      } catch {
        token = String(dbRow.access_token);
      }
      return {
        pageId: dbRow.account_id,
        accessToken: token,
        isConnected: true,
        name: dbRow.name || 'Facebook Page',
        username: dbRow.username || dbRow.account_id
      };
    }
  } catch (err) {
    console.warn('[Database] getFacebookPageConnection query notice:', err);
  }

  // Fallback to environment variables
  const envPageId = process.env.FACEBOOK_PAGE_ID || '';
  const envMetaFallback = (process.env.META_ACCESS_TOKEN && !process.env.META_ACCESS_TOKEN.startsWith('IG'))
    ? process.env.META_ACCESS_TOKEN
    : '';
  const envToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || envMetaFallback;
  if (envPageId && envToken) {
    return {
      pageId: envPageId,
      accessToken: envToken,
      isConnected: true,
      name: 'Facebook Page (.env)',
      username: envPageId
    };
  }

  return null;
}

/**
 * Returns the currently active Facebook User Account connection (from SQLite or .env fallback)
 */
export function getFacebookAccountConnection(): {
  userId: string;
  accessToken: string;
  isConnected: boolean;
  name?: string;
  username?: string;
} | null {
  try {
    const dbRow = db.prepare("SELECT * FROM account_connections WHERE id = 'facebook_account' OR platform = 'facebook_account' LIMIT 1").get() as any;
    if (dbRow && dbRow.is_connected && dbRow.access_token && dbRow.account_id) {
      let token = '';
      try {
        token = decryptSecret(dbRow.access_token);
      } catch {
        token = String(dbRow.access_token);
      }
      return {
        userId: dbRow.account_id,
        accessToken: token,
        isConnected: true,
        name: dbRow.name || 'Facebook User',
        username: dbRow.username || dbRow.account_id
      };
    }
  } catch (err) {
    console.warn('[Database] getFacebookAccountConnection query notice:', err);
  }

  // Fallback to environment variables
  const envUserId = process.env.FACEBOOK_USER_ID || process.env.FACEBOOK_ACCOUNT_ID || '';
  const envMetaUserFallback = (process.env.META_ACCESS_TOKEN && !process.env.META_ACCESS_TOKEN.startsWith('IG'))
    ? process.env.META_ACCESS_TOKEN
    : '';
  const envToken = process.env.FACEBOOK_USER_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || envMetaUserFallback;
  if (envUserId && envToken) {
    return {
      userId: envUserId,
      accessToken: envToken,
      isConnected: true,
      name: 'Facebook Profile (.env)',
      username: envUserId
    };
  }

  return null;
}

/**
 * Saves or updates a Facebook Page or Facebook User Account connection in SQLite
 */
export function saveFacebookConnection(params: {
  target: 'page' | 'account';
  id: string;
  name?: string;
  accessToken: string;
  username?: string;
}): void {
  const connectionId = params.target === 'page' ? 'facebook_page' : 'facebook_account';
  const platform = params.target === 'page' ? 'facebook_page' : 'facebook_account';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO account_connections (
      id, platform, account_id, username, name, profile_picture_url, biography,
      followers_count, follows_count, media_count, access_token, is_connected, updated_at
    ) VALUES (?, ?, ?, ?, ?, '', '', 0, 0, 0, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      username = excluded.username,
      name = excluded.name,
      access_token = excluded.access_token,
      is_connected = 1,
      updated_at = excluded.updated_at
  `).run(
    connectionId,
    platform,
    params.id,
    params.username || params.name || params.id,
    params.name || (params.target === 'page' ? 'Facebook Page' : 'Facebook User'),
    encryptSecret(params.accessToken),
    now
  );
}

/**
 * Disconnects a Facebook Page or Facebook User Account connection
 */
export function disconnectFacebookConnection(target: 'page' | 'account'): void {
  const connectionId = target === 'page' ? 'facebook_page' : 'facebook_account';
  db.prepare(`
    UPDATE account_connections
    SET is_connected = 0, access_token = '', updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), connectionId);
}

export interface LeadMagnetTrigger {
  id: string;
  keyword: string;
  resource_name: string;
  resource_url: string;
  message_template: string;
  public_reply_template: string;
  is_active: number;
  trigger_count: number;
  created_at: string;
}

export function listLeadMagnetTriggers(): LeadMagnetTrigger[] {
  try {
    return db.prepare('SELECT * FROM lead_magnet_triggers ORDER BY created_at ASC').all() as any[];
  } catch {
    return [];
  }
}

export function getLeadMagnetTriggerByKeyword(keyword: string): LeadMagnetTrigger | null {
  try {
    return (db.prepare('SELECT * FROM lead_magnet_triggers WHERE UPPER(keyword) = ? AND is_active = 1').get(keyword.trim().toUpperCase()) as any) || null;
  } catch {
    return null;
  }
}

export function findMatchingLeadTrigger(text: string): LeadMagnetTrigger | null {
  try {
    const triggers = db.prepare('SELECT * FROM lead_magnet_triggers WHERE is_active = 1').all() as unknown as LeadMagnetTrigger[];
    const cleaned = String(text || '').trim();

    // 1. High-priority check for interactive poll votes (e.g. "A", "B", "Vote A", "Option A", "Team B", "1", "2")
    const explicitVoteMatch = cleaned.match(/^(?:vote|option|team|my vote is)\s*([ab12])(?:\b|[!.?])/i) 
      || cleaned.match(/^([ab12])(?:\s*[!?.+]*|\s*[-–—:].*|\s+for\s+me|\s+all\s+the\s+way)?$/i);
    if (explicitVoteMatch) {
      let voteLetter = explicitVoteMatch[1].toUpperCase();
      if (voteLetter === '1') voteLetter = 'A';
      if (voteLetter === '2') voteLetter = 'B';
      const voteTrigger = triggers.find(t => t.keyword.toUpperCase() === voteLetter);
      if (voteTrigger) return voteTrigger;
    }

    // 2. Keyword matching for multi-character triggers (CAD, ARCHIVE, SOLVE, BLUEPRINT, PRESET)
    for (const t of triggers) {
      const kw = t.keyword.toUpperCase();
      // Skip single letters to avoid matching random words like "A good story"
      if (kw === 'A' || kw === 'B') continue;

      const regex = new RegExp(`\\b${t.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(cleaned)) {
        return t;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLeadMagnetTrigger(data: Partial<LeadMagnetTrigger>): LeadMagnetTrigger {
  const id = data.id || `trig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO lead_magnet_triggers (
      id, keyword, resource_name, resource_url, message_template, public_reply_template, is_active, trigger_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      keyword = excluded.keyword,
      resource_name = excluded.resource_name,
      resource_url = excluded.resource_url,
      message_template = excluded.message_template,
      public_reply_template = excluded.public_reply_template,
      is_active = excluded.is_active
  `).run(
    id,
    String(data.keyword || '').toUpperCase().trim(),
    String(data.resource_name || 'Free Resource Pack'),
    String(data.resource_url || 'https://texvic.ai/blueprints'),
    String(data.message_template || 'Here is your link: https://texvic.ai/blueprints'),
    String(data.public_reply_template || 'Sent to your DMs! Check your requests folder.'),
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
    data.trigger_count || 0,
    data.created_at || now
  );
  return db.prepare('SELECT * FROM lead_magnet_triggers WHERE id = ?').get(id) as unknown as LeadMagnetTrigger;
}

export function deleteLeadMagnetTrigger(id: string): boolean {
  try {
    db.prepare('DELETE FROM lead_magnet_triggers WHERE id = ?').run(id);
    return true;
  } catch {
    return false;
  }
}

export function incrementLeadMagnetTrigger(id: string): void {
  try {
    db.prepare('UPDATE lead_magnet_triggers SET trigger_count = trigger_count + 1 WHERE id = ?').run(id);
  } catch {}
}

export { db };

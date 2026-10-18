import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
dotenv.config();

export interface TelegramMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

/**
 * Checks whether routine surfer sprint completion reports are enabled
 */
export function isRoutineSprintAlertsEnabled(): boolean {
  if (process.env.TELEGRAM_NOTIFY_SURFER_SPRINTS !== undefined) {
    return process.env.TELEGRAM_NOTIFY_SURFER_SPRINTS === 'true' || process.env.TELEGRAM_NOTIFY_SURFER_SPRINTS === '1';
  }
  try {
    const row = db.prepare('SELECT notify_surfer_sprints FROM browser_surfer_sessions WHERE id = ?').get('primary_surfer') as any;
    if (row && row.notify_surfer_sprints !== null && row.notify_surfer_sprints !== undefined) {
      return Boolean(row.notify_surfer_sprints);
    }
  } catch {}
  return false; // Default: muted so repetitive routine sprint reports do not spam the chat
}

/**
 * Sets whether routine surfer sprint reports should be dispatched to Telegram
 */
export function setRoutineSprintAlertsEnabled(enabled: boolean): void {
  process.env.TELEGRAM_NOTIFY_SURFER_SPRINTS = enabled ? 'true' : 'false';
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO browser_surfer_sessions (id, is_logged_in, notify_surfer_sprints, updated_at)
      VALUES ('primary_surfer', 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        notify_surfer_sprints = excluded.notify_surfer_sprints,
        updated_at = excluded.updated_at
    `).run(enabled ? 1 : 0, now);
  } catch (err) {
    console.warn('[Telegram Sentinel] Could not persist notify_surfer_sprints:', err);
  }
}

/**
 * Returns current configuration status of Telegram Sentinel bot
 */
export function getTelegramConfigStatus(): {
  isConfigured: boolean;
  botTokenMasked: string;
  chatId: string;
  routineAlertsEnabled: boolean;
} {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  let botTokenMasked = '';
  if (token) {
    botTokenMasked = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '••••••••';
  }
  return {
    isConfigured: Boolean(token && chatId),
    botTokenMasked,
    chatId,
    routineAlertsEnabled: isRoutineSprintAlertsEnabled()
  };
}

/**
 * Saves and updates Telegram Bot Token and Chat ID both in memory and .env file
 */
export function saveTelegramConfig(token: string, chatId: string): { success: boolean; message: string } {
  try {
    const cleanToken = token.trim();
    const cleanChatId = chatId.trim();

    process.env.TELEGRAM_BOT_TOKEN = cleanToken;
    process.env.TELEGRAM_CHAT_ID = cleanChatId;

    const envPath = path.join(process.cwd(), '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    // Update TELEGRAM_BOT_TOKEN
    if (/^TELEGRAM_BOT_TOKEN=/m.test(content)) {
      content = content.replace(/^TELEGRAM_BOT_TOKEN=.*$/m, `TELEGRAM_BOT_TOKEN=${cleanToken}`);
    } else {
      content += `\nTELEGRAM_BOT_TOKEN=${cleanToken}`;
    }

    // Update TELEGRAM_CHAT_ID
    if (/^TELEGRAM_CHAT_ID=/m.test(content)) {
      content = content.replace(/^TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${cleanChatId}`);
    } else {
      content += `\nTELEGRAM_CHAT_ID=${cleanChatId}`;
    }

    fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
    console.info(`[Telegram Sentinel] 💾 Updated .env with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID=${cleanChatId}`);
    restartTelegramListener();
    return { success: true, message: 'Telegram credentials saved successfully!' };
  } catch (err: any) {
    console.error('[Telegram Sentinel] Error saving Telegram config:', err);
    return { success: false, message: `Failed to save configuration: ${err?.message || err}` };
  }
}

/**
 * Automatically queries Telegram Bot API getUpdates to detect the chat ID of whoever messaged the bot
 */
export async function detectTelegramChatId(token: string): Promise<{
  success: boolean;
  chatId?: string;
  senderName?: string;
  message?: string;
  error?: string;
}> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'Please enter a Telegram Bot Token first.' };
  }

  try {
    const url = `https://api.telegram.org/bot${cleanToken}/getUpdates`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Invalid Telegram Bot Token.' };
    }

    const updates = data.result || [];
    if (!Array.isArray(updates) || updates.length === 0) {
      return {
        success: false,
        error: 'No messages received yet. Please open your bot on Telegram, press START or send any message, then try again!'
      };
    }

    // Find the latest message or channel post with a chat id
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
      if (chat && chat.id) {
        const senderName = chat.title || chat.username || chat.first_name || 'Owner';
        return {
          success: true,
          chatId: String(chat.id),
          senderName: String(senderName),
          message: `Detected chat ID: ${chat.id} (${senderName})`
        };
      }
    }

    return {
      success: false,
      error: 'Could not extract chat ID from recent updates. Please send /start to your bot and retry.'
    };
  } catch (err: any) {
    return { success: false, error: `Connection failed: ${err?.message || err}` };
  }
}

/**
 * Tests Telegram bot alert with detailed error diagnostics
 */
export async function testTelegramAlertDetailed(): Promise<{ success: boolean; error?: string; message?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is missing. Please link your Telegram bot.' };
  }
  if (!chatId) {
    return { success: false, error: 'TELEGRAM_CHAT_ID is missing. Please detect or enter your Chat ID.' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🚀 <b>TEXVIC Sentinel Bot Connected!</b>\n\nReal-time push notifications are armed & active:\n• 🎬 Published Reels\n• 🛡️ Autonomous Surfer Reports\n• 💼 Inbound DM Lead Alerts',
        parse_mode: 'HTML'
      }),
      signal: AbortSignal.timeout(8000)
    });

    const data = await response.json();
    if (!data.ok) {
      let desc = data.description || 'Unknown Telegram API error';
      if (desc.includes('chat not found')) {
        desc += ' (Did you send /start to your bot first?)';
      } else if (desc.includes('Unauthorized')) {
        desc += ' (The Bot Token appears to be invalid)';
      }
      return { success: false, error: desc };
    }

    return { success: true, message: 'Test notification sent to Telegram successfully!' };
  } catch (err: any) {
    return { success: false, error: `Network error connecting to Telegram: ${err?.message || err}` };
  }
}

/**
 * Sends a real-time push notification to the owner's Telegram channel or chat.
 * Fails safely and non-blockingly if credentials are not configured.
 */
export async function sendTelegramAlert(
  text: string,
  options: TelegramMessageOptions = { parseMode: 'HTML', disableWebPagePreview: false }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // Graceful no-op when Telegram is not configured in .env
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        disable_web_page_preview: options.disableWebPagePreview ?? false
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[Telegram Sentinel] API error (${response.status}): ${errText.slice(0, 200)}`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn(`[Telegram Sentinel] Failed to dispatch alert: ${err?.message || err}`);
    return false;
  }
}

/**
 * Notifies owner when a new Reel is successfully rendered and published simultaneously
 * across Instagram, Facebook Page, and Facebook User Account
 */
export async function notifyReelPublished(reel: {
  title?: string;
  niche?: string;
  permalink?: string;
  mediaId?: string;
  fbPermalink?: string;
  fbVideoId?: string;
  fbAccountPermalink?: string;
  fbAccountVideoId?: string;
  platforms?: string[];
  errors?: string[];
  videoUrl?: string;
  videoPath?: string;
}): Promise<void> {
  const title = reel.title || 'Untitled Documentary Reel';
  const niche = reel.niche || 'Untold History';
  const platforms = Array.isArray(reel.platforms) ? reel.platforms : [];

  const platformLines: string[] = [];

  if (reel.permalink) {
    platformLines.push(`📸 <b>Instagram:</b> <a href="${reel.permalink}">${reel.permalink}</a>`);
  } else if (platforms.includes('instagram')) {
    platformLines.push(`📸 <b>Instagram:</b> <i>Published</i>`);
  }

  if (reel.fbPermalink) {
    platformLines.push(`📄 <b>Facebook Page:</b> <a href="${reel.fbPermalink}">${reel.fbPermalink}</a>`);
  } else if (platforms.includes('facebook_page')) {
    platformLines.push(`📄 <b>Facebook Page:</b> <i>Published</i>`);
  }

  if (reel.fbAccountPermalink) {
    platformLines.push(`👤 <b>Facebook Profile:</b> <a href="${reel.fbAccountPermalink}">${reel.fbAccountPermalink}</a>`);
  } else if (platforms.includes('facebook_account')) {
    platformLines.push(`👤 <b>Facebook Profile:</b> <i>Published</i>`);
  }

  const errorLines: string[] = [];
  if (Array.isArray(reel.errors) && reel.errors.length > 0) {
    reel.errors.forEach(err => {
      errorLines.push(`⚠️ <i>Notice:</i> ${err}`);
    });
  }

  const message = [
    `🎬 <b>SIMULTANEOUS REEL PUBLISHED</b>`,
    ``,
    `📌 <b>Title:</b> ${title}`,
    `🏛️ <b>Niche:</b> ${niche}`,
    ``,
    `🌐 <b>Live Destinations:</b>`,
    platformLines.length > 0 ? platformLines.join('\n') : `<i>Published to active feeds</i>`,
    errorLines.length > 0 ? `\n${errorLines.join('\n')}` : ``,
    ``,
    `💬 <i>Auto-kickstart CTA and cross-platform algorithms primed.</i>`
  ].filter(line => line !== null && line !== undefined).join('\n');

  // If a video file or URL is provided, deliver directly as a playable Telegram video
  const videoTarget = reel.videoPath || reel.videoUrl;
  if (videoTarget) {
    const sent = await sendTelegramVideo(videoTarget, message);
    if (sent) return;
  }

  await sendTelegramAlert(message);
}

/**
 * Notifies owner when Browser Surfer concludes a periodic human browsing session
 */
export async function notifySurferSessionFinished(stats: {
  sessionNumber: number;
  reelsWatched: number;
  likesGiven: number;
  commentsPosted: number;
  restMinutes: number;
  nextSessionAt: string;
}): Promise<void> {
  // Suppress aborted or zero-reel sessions
  if (!stats.reelsWatched || stats.reelsWatched === 0) return;

  // Suppress routine sprint reports if muted
  if (!isRoutineSprintAlertsEnabled()) {
    console.info(`[Telegram Sentinel] 🔕 Routine sprint report muted (Session #${stats.sessionNumber}, ${stats.reelsWatched} reels). Lead alerts and reel publications remain active.`);
    return;
  }

  const nextTime = new Date(stats.nextSessionAt).toLocaleTimeString();

  const message = [
    `🛡️ <b>SENTINEL SURFING SPRINT FINISHED</b>`,
    ``,
    `🎬 <b>Session #${stats.sessionNumber} Report:</b>`,
    `👀 Reels Watched: <b>${stats.reelsWatched}</b>`,
    `❤️ Likes Given: <b>${stats.likesGiven}</b>`,
    `💬 Brain Comments: <b>${stats.commentsPosted}</b>`,
    ``,
    `☕ <i>Resting for ${stats.restMinutes}m to maintain 100% human telemetry. Next sprint: ${nextTime}</i>`
  ].join('\n');

  await sendTelegramAlert(message);
}

/**
 * Notifies owner when an inbound customer / follower triggers an automated lead DM
 */
export async function notifyLeadReceived(lead: {
  username?: string;
  triggerWord?: string;
  commentText?: string;
  dmReplyText?: string;
}): Promise<void> {
  const username = lead.username || 'follower';
  const trigger = lead.triggerWord || 'ARCHIVE';

  const message = [
    `🎯 <b>HOT LEAD TRIGGERED!</b>`,
    ``,
    `👤 <b>User:</b> @${username}`,
    `🔑 <b>Trigger Keyword:</b> <code>${trigger}</code>`,
    `📝 <b>Comment:</b> "${lead.commentText || trigger}"`,
    `✉️ <b>Dispatched Resource:</b> "${(lead.dmReplyText || '').slice(0, 100)}..."`
  ].join('\n');

  await sendTelegramAlert(message);
}

/**
 * Sends a playable video file or video URL to Telegram chat with optional caption
 */
export async function sendTelegramVideo(
  videoUrlOrPath: string,
  caption = ''
): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId || !videoUrlOrPath) return false;

  try {
    let resolvedPath = videoUrlOrPath;
    if (videoUrlOrPath.startsWith('/media/') || videoUrlOrPath.startsWith('/data/media/')) {
      const cleanSub = videoUrlOrPath.replace(/^\/?(data\/)?media\//, '');
      resolvedPath = path.resolve(process.cwd(), 'data', 'media', cleanSub);
    }

    if (fs.existsSync(resolvedPath)) {
      const videoBuffer = fs.readFileSync(resolvedPath);
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
      formData.append('video', blob, path.basename(resolvedPath) || 'reel.mp4');
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
      }
      formData.append('supports_streaming', 'true');

      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000)
      });
      return res.ok;
    } else if (/^https?:\/\//i.test(videoUrlOrPath)) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          video: videoUrlOrPath,
          caption: caption || undefined,
          parse_mode: 'HTML',
          supports_streaming: true
        }),
        signal: AbortSignal.timeout(30000)
      });
      return res.ok;
    }
    return false;
  } catch (err) {
    console.warn('[Telegram Sentinel] sendTelegramVideo failed:', err);
    return false;
  }
}

/**
 * Sends a photo to Telegram chat with optional caption
 */
export async function sendTelegramPhoto(
  photo: Buffer | string,
  caption = ''
): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return false;

  try {
    let photoBuffer: Buffer;
    if (typeof photo === 'string') {
      if (fs.existsSync(photo)) {
        photoBuffer = fs.readFileSync(photo);
      } else {
        return false;
      }
    } else {
      photoBuffer = photo;
    }

    const formData = new FormData();
    formData.append('chat_id', chatId);
    const blob = new Blob([new Uint8Array(photoBuffer)], { type: 'image/jpeg' });
    formData.append('photo', blob, 'screenshot.jpg');
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000)
    });
    return res.ok;
  } catch (err) {
    console.warn('[Telegram Sentinel] sendTelegramPhoto failed:', err);
    return false;
  }
}

/**
 * Dispatches commands received from Telegram Bot
 */
export async function handleIncomingTelegramCommand(commandText: string, fromChatId: string): Promise<void> {
  const authorizedChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (authorizedChatId && String(fromChatId) !== authorizedChatId) {
    console.warn(`[Telegram Sentinel] ⚠️ Unauthorized command from chatId ${fromChatId}`);
    return;
  }

  const cmd = commandText.trim().split(/\s+/)[0].toLowerCase();
  console.info(`[Telegram Sentinel] ⚡ Processing command: ${cmd} from chat ${fromChatId}`);

  switch (cmd) {
    case '/start':
    case '/help': {
      const helpMsg = [
        `🤖 <b>TEXVIC SENTINEL COMMAND CENTER</b>`,
        ``,
        `Direct remote control commands:`,
        `• <code>/status</code> - Live swarm, reels & browsing telemetry`,
        `• <code>/reels</code> - View latest 5 reels, stats & live links`,
        `• <code>/create_reel &lt;topic&gt;</code> - Trigger immediate on-demand autonomous reel`,
        `• <code>/screenshot</code> - Instant snapshot of active Instagram browser`,
        `• <code>/surf</code> - Trigger on-demand human browsing sprint (5 reels)`,
        `• <code>/pause</code> - Pause all agents & 24x7 autonomous scheduler`,
        `• <code>/resume</code> - Resume all agents & 24x7 autonomous scheduler`,
        `• <code>/sprints on|off</code> - Enable or mute routine surfing sprint reports`,
        `• <code>/leads</code> - View recent qualified inbound DM leads`
      ].join('\n');
      await sendTelegramAlert(helpMsg);
      break;
    }

    case '/status': {
      try {
        const { browserSurfer } = await import('./browserSurferEngine.js');
        const status = browserSurfer.getStatus();
        const stats = status.stats || {};
        const message = [
          `📊 <b>TEXVIC SENTINEL TELEMETRY</b>`,
          ``,
          `👤 <b>Instagram:</b> @${status.username || 'theuntoldarch'}`,
          `🟢 <b>State:</b> ${status.sessionState || (status.isRunning ? 'Surfing' : 'Idle')}`,
          `🔄 <b>24x7 Autonomous:</b> ${status.autonomousSessionsEnabled ? '✅ ACTIVE' : '⏸️ PAUSED'}`,
          `🎬 <b>Reels Watched:</b> ${stats.reelsWatched ?? 0}`,
          `❤️ <b>Likes Given:</b> ${stats.likesGiven ?? 0}`,
          `💬 <b>Comments Posted:</b> ${stats.commentsPosted ?? 0}`,
          `📍 <b>Step:</b> <i>${status.currentStep ? status.currentStep.slice(0, 75) : 'Online'}</i>`,
          status.nextSessionAt ? `⏳ <b>Next Sprint:</b> ${new Date(status.nextSessionAt).toLocaleTimeString()}` : ''
        ].filter(Boolean).join('\n');
        await sendTelegramAlert(message);
      } catch (err: any) {
        await sendTelegramAlert(`❌ Error fetching status: ${err?.message || err}`);
      }
      break;
    }

    case '/screenshot': {
      try {
        const shotPath = path.resolve(process.cwd(), 'data', 'media', 'browser_screenshots', 'latest_status.jpg');
        if (fs.existsSync(shotPath)) {
          const { browserSurfer } = await import('./browserSurferEngine.js');
          const status = browserSurfer.getStatus();
          await sendTelegramPhoto(
            shotPath,
            `📸 <b>Live Browser View</b>\n@${status.username || 'theuntoldarch'} • ${new Date().toLocaleTimeString()}`
          );
        } else {
          await sendTelegramAlert('⚠️ No browser screenshot available yet.');
        }
      } catch (err: any) {
        await sendTelegramAlert(`❌ Screenshot error: ${err?.message || err}`);
      }
      break;
    }

    case '/surf': {
      try {
        const { browserSurfer } = await import('./browserSurferEngine.js');
        await sendTelegramAlert('🏄 <b>Launching autonomous reels surfing session (5 reels)...</b>\nWatch live telemetry in dashboard.');
        browserSurfer.surfHumanSession({ reelsCount: 5 }).catch(err => {
          sendTelegramAlert(`❌ Surfing session encountered error: ${err?.message || err}`);
        });
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to launch surfing session: ${err?.message || err}`);
      }
      break;
    }

    case '/pause': {
      try {
        const { browserSurfer } = await import('./browserSurferEngine.js');
        const { toggleAllAgents } = await import('./agentSwarm.js');
        browserSurfer.stopAutonomousSessions(true);
        toggleAllAgents(false);
        await sendTelegramAlert('⏸️ <b>All AI Swarm Agents & Sentinel 24x7 Surfer PAUSED.</b>\nDashboard and background tasks synced.');
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to pause: ${err?.message || err}`);
      }
      break;
    }

    case '/resume': {
      try {
        const { browserSurfer } = await import('./browserSurferEngine.js');
        const { toggleAllAgents } = await import('./agentSwarm.js');
        browserSurfer.startAutonomousSessions(undefined, true);
        toggleAllAgents(true);
        await sendTelegramAlert('▶️ <b>All AI Swarm Agents & Sentinel 24x7 Surfer RESUMED.</b>\nDashboard and background tasks synced.');
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to resume: ${err?.message || err}`);
      }
      break;
    }

    case '/sprints':
    case '/alerts': {
      try {
        const parts = commandText.trim().split(/\s+/);
        const sub = parts[1]?.toLowerCase();
        if (sub === 'on') {
          setRoutineSprintAlertsEnabled(true);
          await sendTelegramAlert('🔔 <b>Routine Surfing Sprint Alerts: ENABLED</b>\nYou will receive a report after each feed surfing session.');
        } else if (sub === 'off') {
          setRoutineSprintAlertsEnabled(false);
          await sendTelegramAlert('🔕 <b>Routine Surfing Sprint Alerts: MUTED</b>\nRoutine sprint completion reports are silenced. High-priority lead alerts and reel publish notifications remain active.');
        } else {
          const current = isRoutineSprintAlertsEnabled();
          await sendTelegramAlert(
            `🔔 <b>Routine Sprint Alerts:</b> ${current ? 'ENABLED' : 'MUTED'}\n\n• Use <code>/sprints on</code> to enable reports\n• Use <code>/sprints off</code> to mute routine reports`
          );
        }
      } catch (err: any) {
        await sendTelegramAlert(`❌ Error updating alert preferences: ${err?.message || err}`);
      }
      break;
    }

    case '/leads': {
      try {
        const { getTrackedDmLeads } = await import('./dmConversationEngine.js');
        const leads = getTrackedDmLeads(5);
        if (!leads.length) {
          await sendTelegramAlert('💼 <b>No inbound leads tracked yet.</b>');
        } else {
          const items = leads.map((l, i) =>
            `${i + 1}. <b>@${l.username}</b> [${(l.status || 'open').toUpperCase()} • Score: ${l.leadScore}]\n` +
            (l.leadEmail ? `   📧 ${l.leadEmail}\n` : '') +
            `   💬 "${(l.lastMessageText || '').slice(0, 60)}..."`
          ).join('\n\n');
          await sendTelegramAlert(`💼 <b>LATEST INBOUND LEADS</b>\n\n${items}`);
        }
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to fetch leads: ${err?.message || err}`);
      }
      break;
    }

    case '/reels': {
      try {
        const rows = db.prepare(`
          SELECT id, title, niche, duration, status, views, likes, comments_count, permalink, created_at
          FROM reels
          ORDER BY datetime(created_at) DESC
          LIMIT 5
        `).all() as any[];

        if (!rows.length) {
          await sendTelegramAlert('🎬 <b>No reels found in the archive yet.</b>');
        } else {
          const items = rows.map((r, i) =>
            `${i + 1}. <b>${r.title}</b> (${r.niche || 'General'})\n` +
            `   Status: <b>${(r.status || 'draft').toUpperCase()}</b> | ⏱️ ${Math.round(r.duration || 0)}s | 👀 ${r.views || 0} | ❤️ ${r.likes || 0} | 💬 ${r.comments_count || 0}\n` +
            (r.permalink ? `   🔗 <a href="${r.permalink}">View on Instagram</a>\n` : '') +
            `   📅 ${new Date(r.created_at).toLocaleDateString()}`
          ).join('\n\n');
          await sendTelegramAlert(`🎬 <b>LATEST 5 REELS IN ARCHIVE</b>\n\n${items}`);
        }
      } catch (err: any) {
        await sendTelegramAlert(`❌ Error fetching reels: ${err?.message || err}`);
      }
      break;
    }

    case '/create_reel':
    case '/makereel':
    case '/cycle': {
      const topic = commandText.replace(/^\/(create_reel|makereel|cycle)/i, '').trim();
      try {
        db.prepare(`
          UPDATE autonomous_config 
          SET next_run = ?, current_stage = 'idle', updated_at = ? 
          WHERE id = 'default_config'
        `).run(new Date().toISOString(), new Date().toISOString());

        await sendTelegramAlert(
          `⚡ <b>Autonomous Creation Cycle Triggered!</b>\n` +
          (topic ? `📌 Preferred Topic: <i>${topic}</i>\n` : '') +
          `Autonomous engine has been scheduled to run immediately (within ~30s tick).\n` +
          `Sentinel will notify you with the finished video once synthesis and publishing succeed.`
        );
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to trigger cycle: ${err?.message || err}`);
      }
      break;
    }

    default:
      await sendTelegramAlert(`❓ Unknown command <code>${cmd}</code>. Type <code>/help</code> for available commands.`);
      break;
  }
}

let isListenerActive = false;
let pollingAbort: AbortController | null = null;
let lastUpdateId = 0;

/**
 * Starts Telegram Bot long-polling listener for two-way remote control
 */
export function startTelegramCommandListener(): void {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    console.info('[Telegram Sentinel] 🤖 Bot listener waiting for token & chat ID configuration.');
    return;
  }
  if (isListenerActive) return;

  isListenerActive = true;
  pollingAbort = new AbortController();
  console.info('[Telegram Sentinel] 🤖 Two-Way Remote Command Listener started.');

  (async () => {
    while (isListenerActive) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`;
        const res = await fetch(url, { signal: pollingAbort.signal });
        if (!res.ok) {
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const u of data.result) {
            lastUpdateId = Math.max(lastUpdateId, u.update_id);
            const msg = u.message;
            if (msg && msg.text && msg.text.startsWith('/')) {
              await handleIncomingTelegramCommand(msg.text.trim(), String(msg.chat.id));
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  })();
}

/**
 * Stops Telegram Bot long-polling listener
 */
export function stopTelegramCommandListener(): void {
  isListenerActive = false;
  if (pollingAbort) {
    pollingAbort.abort();
    pollingAbort = null;
  }
}

/**
 * Restarts Telegram Bot listener on configuration changes
 */
export function restartTelegramListener(): void {
  stopTelegramCommandListener();
  startTelegramCommandListener();
}


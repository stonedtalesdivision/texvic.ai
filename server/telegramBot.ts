import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

export interface TelegramMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

/**
 * Returns current configuration status of Telegram Sentinel bot
 */
export function getTelegramConfigStatus(): {
  isConfigured: boolean;
  botTokenMasked: string;
  chatId: string;
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
    chatId
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
 * Notifies owner when a new Reel is successfully rendered and published to Instagram
 */
export async function notifyReelPublished(reel: {
  title?: string;
  niche?: string;
  permalink?: string;
  mediaId?: string;
}): Promise<void> {
  const title = reel.title || 'Untitled Documentary Reel';
  const niche = reel.niche || 'Untold History';
  const permalink = reel.permalink || 'https://instagram.com';

  const message = [
    `🎬 <b>NEW REEL PUBLISHED TO INSTAGRAM</b>`,
    ``,
    `📌 <b>Title:</b> ${title}`,
    `🏛️ <b>Niche:</b> ${niche}`,
    `🔗 <b>Watch on Instagram:</b> <a href="${permalink}">${permalink}</a>`,
    `💬 <i>Auto-kickstart CTA comment placed. Ready for algorithm indexing.</i>`
  ].join('\n');

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
        `• <code>/screenshot</code> - Instant snapshot of active Instagram browser`,
        `• <code>/surf</code> - Trigger on-demand human browsing sprint (5 reels)`,
        `• <code>/pause</code> - Pause 24x7 autonomous scheduler`,
        `• <code>/resume</code> - Resume 24x7 autonomous scheduler`,
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
        browserSurfer.stopAutonomousSessions();
        await sendTelegramAlert('⏸️ <b>Sentinel 24x7 Autonomous Scheduler PAUSED.</b>');
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to pause: ${err?.message || err}`);
      }
      break;
    }

    case '/resume': {
      try {
        const { browserSurfer } = await import('./browserSurferEngine.js');
        browserSurfer.startAutonomousSessions();
        await sendTelegramAlert('▶️ <b>Sentinel 24x7 Autonomous Scheduler RESUMED.</b>');
      } catch (err: any) {
        await sendTelegramAlert(`❌ Failed to resume: ${err?.message || err}`);
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


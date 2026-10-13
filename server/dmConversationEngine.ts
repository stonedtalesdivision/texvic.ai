import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import { db } from './database.js';
import { notifyLeadReceived } from './telegramBot.js';

export interface DmMessage {
  direction: 'inbound' | 'outbound';
  text: string;
  timestamp: string;
}

export interface DmConversation {
  id: string;
  userId: string;
  username: string;
  threadId: string | null;
  lastMessageText: string;
  lastDirection: 'inbound' | 'outbound';
  status: 'open' | 'qualified' | 'converted' | 'closed';
  leadScore: number;
  leadEmail: string | null;
  messages: DmMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Multi-turn conversational AI engine that nurtures Instagram DM leads,
 * answers questions conversationally, qualifies interest, and extracts contact info.
 */
export async function processDmConversation(
  userId: string,
  username: string,
  incomingText: string
): Promise<{
  replyText: string;
  leadScore: number;
  status: string;
  leadEmail: string | null;
}> {
  const now = new Date().toISOString();
  let row = db.prepare('SELECT * FROM dm_conversations WHERE user_id = ?').get(userId) as any;

  let messages: DmMessage[] = [];
  let leadScore = 10;
  let status = 'open';
  let leadEmail: string | null = null;
  let convoId = `dm-${crypto.randomBytes(4).toString('hex')}`;

  if (row) {
    convoId = row.id;
    try {
      messages = JSON.parse(row.messages_json || '[]');
    } catch {
      messages = [];
    }
    leadScore = row.lead_score || 10;
    status = row.status || 'open';
    leadEmail = row.lead_email || null;
  }

  // 1. Record incoming message
  messages.push({
    direction: 'inbound',
    text: incomingText,
    timestamp: now
  });

  // 2. Email extraction check
  const emailMatch = incomingText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && !leadEmail) {
    leadEmail = emailMatch[0].toLowerCase();
    leadScore += 50;
    status = 'converted';
    console.info(`[DM Closer Engine] 🎯 Lead captured email: ${leadEmail} (User: @${username})`);
  }

  // 3. Conversation history formatting for Gemini
  const historyTranscript = messages.slice(-6).map(m => 
    `${m.direction === 'inbound' ? 'User' : 'UntoldArchive'}: ${m.text}`
  ).join('\n');

  // 4. Synthesize intelligent multi-turn response via Gemini 3.8 Flash
  let replyText = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are the authentic curator of @theuntoldarch ("The Untold Archive" - investigative history & declassified mysteries).
You are messaging a follower on Instagram DMs.

Conversation Transcript:
${historyTranscript}

Instructions:
1. Speak warmly, authentically, and intelligently (1-2 sentences maximum).
2. If this is their first message triggering "ARCHIVE" / "STORY" / "CASE", provide them the link to the case files (https://texvic.ai/archive) and ask if they are researching this topic for personal curiosity or a project.
3. If they gave their email or answered your question, thank them warmly and confirm they've been granted priority access to upcoming declassified dossier drops.
4. If they asked a historical question, answer factually based on historical records with curiosity and intrigue.
5. ZERO robotic jargon. ZERO software/coding words. Write like a passionate human investigative archivist.
6. Return ONLY the message string directly without quotes.`;

      const resp = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      replyText = resp?.text?.trim() || '';
    } catch (e: any) {
      console.warn(`[DM Closer Engine] Gemini error: ${e?.message}`);
    }
  }

  if (!replyText) {
    if (incomingText.toLowerCase().includes('archive') || incomingText.toLowerCase().includes('file')) {
      replyText = `Welcome to The Untold Archive 📜 You can access our full case dossier here: https://texvic.ai/archive. Are you looking into this for research or personal curiosity?`;
    } else {
      replyText = `Appreciate you reaching out! We're declassifying the full photographic records in our next dossier release. Stay tuned!`;
    }
  }

  // 5. Append outbound response to history
  messages.push({
    direction: 'outbound',
    text: replyText,
    timestamp: new Date().toISOString()
  });

  // Calculate engagement bump
  leadScore += 5;
  if (messages.length >= 4 && status === 'open') {
    status = 'qualified';
  }

  // 6. Persist to SQLite
  db.prepare(`
    INSERT INTO dm_conversations (
      id, user_id, username, thread_id, last_message_text,
      last_direction, status, lead_score, lead_email, messages_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      last_message_text = excluded.last_message_text,
      last_direction = excluded.last_direction,
      status = excluded.status,
      lead_score = excluded.lead_score,
      lead_email = COALESCE(excluded.lead_email, dm_conversations.lead_email),
      messages_json = excluded.messages_json,
      updated_at = excluded.updated_at
  `).run(
    convoId,
    userId,
    username,
    null,
    replyText,
    status,
    leadScore,
    leadEmail,
    JSON.stringify(messages),
    now,
    new Date().toISOString()
  );

  // 7. Dispatch Telegram alert if high value or email captured
  if (leadEmail || leadScore >= 25) {
    notifyLeadReceived({
      username,
      triggerWord: incomingText,
      commentText: incomingText,
      dmReplyText: replyText
    }).catch(() => {});
  }

  return {
    replyText,
    leadScore,
    status,
    leadEmail
  };
}

/**
 * Retrieve all tracked DM lead conversations
 */
export function getTrackedDmLeads(limit = 50): DmConversation[] {
  try {
    const rows = db.prepare(`
      SELECT * FROM dm_conversations ORDER BY updated_at DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      threadId: r.thread_id,
      lastMessageText: r.last_message_text,
      lastDirection: r.last_direction,
      status: r.status,
      leadScore: r.lead_score,
      leadEmail: r.lead_email,
      messages: JSON.parse(r.messages_json || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch {
    return [];
  }
}

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';
import { db, updateAccountPersona } from './database.js';
import { decryptSecret } from './tokenVault.js';
import { fetchRecentAccountMedia } from './metaGraphApi.js';
import { AccountPersona, ContentPillar } from '../src/types.js';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

function hasNemotronKey(): boolean {
  return Boolean(process.env.NEMOTRON_API_KEY && process.env.NEMOTRON_API_KEY.length > 5);
}

function getNemotronModel(): string {
  const configured = String(process.env.NEMOTRON_MODEL || "nvidia/nemotron-3-super-120b-a12b");
  if (/openrouter\.ai/i.test(getNvidiaNimUrl())) {
    return configured;
  }
  return configured.replace(/:free$/i, "");
}

function getNvidiaNimUrl(): string {
  return String(process.env.NVIDIA_NIM_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
}

async function callNemotronJson(prompt: string): Promise<any | null> {
  if (!hasNemotronKey()) return null;
  const model = getNemotronModel();
  const url = `${getNvidiaNimUrl()}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEMOTRON_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function generateDnaJson(prompt: string): Promise<any> {
  // 1. Try Gemini models
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  if (process.env.GEMINI_API_KEY) {
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.4
          }
        });
        const text = response.text?.trim() || '';
        if (text) {
          const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          return JSON.parse(cleaned);
        }
      } catch (err: any) {
        console.warn(`[Account DNA Engine] Gemini model ${model} error:`, err?.message || err);
      }
    }
  }

  // 2. Try Nemotron fallback
  const nemotronResult = await callNemotronJson(prompt);
  if (nemotronResult) return nemotronResult;

  throw new Error('Both Gemini and Nemotron AI models failed to synthesize Content DNA.');
}

/**
 * Analyzes an Instagram account's past posts, bio, and tone to extract
 * a hyper-personalized Content DNA Persona.
 */
export async function learnAccountPersona(
  accountId: string,
  options?: {
    customDescription?: string;
    sampleCaptions?: string[];
    referenceNiche?: string;
  }
): Promise<AccountPersona> {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get(accountId) as any;
  if (!account) {
    throw new Error(`Account connection "${accountId}" not found in database.`);
  }

  console.log(`[Account DNA Engine] Starting Content DNA analysis for @${account.username || account.id}...`);

  // Step 1: Collect past posts and captions
  let collectedMedia: Array<{ caption?: string; likes?: number; comments?: number }> = [];
  let tokenDecrypted = '';
  if (account.access_token) {
    try {
      tokenDecrypted = decryptSecret(account.access_token);
    } catch {}
  }

  if (account.account_id && tokenDecrypted) {
    try {
      console.log(`[Account DNA Engine] Querying live Meta Graph API for @${account.username} media...`);
      const rawMedia = await fetchRecentAccountMedia(account.account_id, tokenDecrypted, 25);
      collectedMedia = rawMedia.map(m => ({
        caption: m.caption,
        likes: m.like_count,
        comments: m.comments_count
      }));
      console.log(`[Account DNA Engine] Successfully ingested ${collectedMedia.length} recent posts from Instagram.`);
    } catch (err) {
      console.warn('[Account DNA Engine] Meta media ingestion skipped:', err);
    }
  }

  // Combine media captions, sample captions, and descriptions
  const captionsList: string[] = [];
  collectedMedia.forEach((m, idx) => {
    if (m.caption && m.caption.trim().length > 15) {
      captionsList.push(`[Post ${idx + 1} (${m.likes || 0} likes, ${m.comments || 0} comments)]:\n${m.caption.trim()}`);
    }
  });

  if (options?.sampleCaptions && Array.isArray(options.sampleCaptions)) {
    options.sampleCaptions.forEach((c, idx) => {
      if (c && c.trim().length > 10) {
        captionsList.push(`[Sample Post ${idx + 1}]:\n${c.trim()}`);
      }
    });
  }

  const captionsText = captionsList.length > 0 
    ? captionsList.slice(0, 15).join('\n---\n') 
    : 'No recent public captions available.';

  const handle = account.username ? (account.username.startsWith('@') ? account.username : `@${account.username}`) : '@instagram_creator';
  const name = account.name || account.username || 'Creator';
  const bio = account.biography || '';
  const notes = options?.customDescription || options?.referenceNiche || '';

  // Step 2: Build the AI Reverse-Engineering Prompt
  const prompt = `You are an elite Instagram Brand Strategist & Viral Creative Director.
Your job is to reverse-engineer and decode the EXACT "Content DNA" and style of this Instagram account.

Account Handle: ${handle}
Account Name: ${name}
Bio: "${bio}"
User Notes / Desired Niche Direction: "${notes}"

Recent Posts & Captions From This Account:
"""
${captionsText}
"""

TASK:
Analyze the account's existing posts, topics, tone, hook formats, and target audience. 
If the account has few or no posts, rely on the Bio and User Notes to infer an authentic, premium, viral-grade Content DNA.

Respond ONLY with a valid JSON object matching this EXACT schema:
{
  "brand": "${name}",
  "handle": "${handle}",
  "niche": "High-impact specific niche title (max 5 words, e.g. 'Functional Hypertrophy & Biomechanics' or 'Minimalist Specialty Coffee Roasting')",
  "audience": "Ultra-specific description of the followers, their exact pain points, aspirations, and skill level",
  "toneOfVoice": ["4 distinct adjectives describing the voice, e.g. 'Direct', 'Uncompromising', 'Scientific', 'No-BS'"],
  "visualDirection": "Detailed visual aesthetic instructions for photorealistic 8K imagery and video generation (camera lens, studio or natural lighting, color mood, subjects, set design)",
  "accentColors": ["#hex1", "#hex2", "#hex3"],
  "defaultCta": "High-converting closing CTA in this exact brand voice (e.g. 'Drop a COMMENT below | Save this for your next session')",
  "contentPillars": [
    {
      "id": "unique-kebab-slug-1",
      "niche": "Pillar title (e.g. Biomechanical Form Breakdowns)",
      "badge": "Badge with emoji (e.g. 🏋️ FORM DRILLS)",
      "description": "What this pillar breaks down and why it retains viewers",
      "pillars": [
        "Core mechanism 1",
        "Core mechanism 2",
        "Core mechanism 3",
        "Core mechanism 4"
      ],
      "sampleHooks": [
        "First 3-second hook line for a reel in this pillar",
        "Second contrarian hook line that stops the scroll",
        "Third specific number or benchmark hook"
      ],
      "visualAesthetic": "Tangible physical photography direction for this specific pillar"
    }
  ]
}

CRITICAL RULES:
1. Provide between 4 and 6 complete "contentPillars". Each pillar must have 3 distinct sampleHooks and 4 bullet points in pillars.
2. The visualDirection and accentColors must feel bespoke to this specific niche (e.g., warm earthy tones for coffee/lifestyle, high-contrast dark tones for tech/coding, vibrant neon for fitness or sports).
3. NO GENERIC FLUFF. Do not say "creating great content". Give specific mechanisms, concepts, and hooks suitable for 2026 Instagram algorithms.`;

  console.log(`[Account DNA Engine] Synthesizing Content DNA with AI models...`);
  const rawDna = await generateDnaJson(prompt);

  // Step 3: Normalize and validate structure
  const persona: AccountPersona = {
    brand: String(rawDna.brand || name).trim(),
    handle: String(rawDna.handle || handle).trim(),
    niche: String(rawDna.niche || notes || 'Creator & Growth').trim(),
    audience: String(rawDna.audience || 'Target audience seeking high-utility insights').trim(),
    toneOfVoice: Array.isArray(rawDna.toneOfVoice) && rawDna.toneOfVoice.length > 0 
      ? rawDna.toneOfVoice.map(String) 
      : ['Authentic', 'High-Utility', 'Engaging', 'Direct'],
    visualDirection: String(rawDna.visualDirection || 'Cinematic 8k photorealistic photography, dramatic cinematic lighting, clean typography').trim(),
    accentColors: Array.isArray(rawDna.accentColors) && rawDna.accentColors.length >= 2 
      ? rawDna.accentColors.map(String) 
      : ['#38bdf8', '#818cf8', '#f43f5e'],
    defaultCta: String(rawDna.defaultCta || `Follow ${handle} for more insights`).trim(),
    contentPillars: Array.isArray(rawDna.contentPillars) && rawDna.contentPillars.length > 0 
      ? rawDna.contentPillars.map((p: any, idx: number) => ({
          id: String(p.id || `pillar-${idx + 1}`),
          niche: String(p.niche || `Content Pillar ${idx + 1}`),
          badge: String(p.badge || `• PILLAR 0${idx + 1} •`),
          description: String(p.description || ''),
          pillars: Array.isArray(p.pillars) ? p.pillars.map(String) : [],
          sampleHooks: Array.isArray(p.sampleHooks) ? p.sampleHooks.map(String) : [],
          visualAesthetic: String(p.visualAesthetic || rawDna.visualDirection || '')
        }))
      : [
          {
            id: 'pillar-core-mastery',
            niche: String(rawDna.niche || 'Core Breakdown'),
            badge: '⚡ CORE MASTERY',
            description: 'Foundational insights and high-retention frameworks.',
            pillars: ['Actionable frameworks', 'Common mistakes to avoid', 'Step-by-step implementation'],
            sampleHooks: ['Stop making this common mistake.', 'The 1 framework that changes everything.'],
            visualAesthetic: 'Clean high-contrast editorial photography'
          }
        ],
    analyzedPostCount: collectedMedia.length,
    lastLearnedAt: new Date().toISOString(),
    learnedFromBio: bio,
    customNotes: notes
  };

  // Step 4: Persist in SQLite
  updateAccountPersona(accountId, persona);
  console.log(`[Account DNA Engine] ✅ Stored learned Content DNA for @${persona.handle} with ${persona.contentPillars.length} pillars.`);

  return persona;
}

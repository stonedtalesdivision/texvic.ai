import { db } from './database.js';
import { getActivePersona } from './themePage.js';

export interface YouTubeShortsMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
  pinnedCommentPrompt: string;
}

export interface TikTokMetadata {
  caption: string;
  soundRecommendation: string;
  hashtags: string[];
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

export interface InstagramMetadata {
  caption: string;
  shareToFeed: boolean;
  coverUrl?: string;
}

export interface SyndicationPackage {
  reelId: string;
  generatedAt: string;
  youtubeShorts: YouTubeShortsMetadata;
  tiktok: TikTokMetadata;
  instagram: InstagramMetadata;
}

function cleanTitle(raw: string): string {
  return String(raw || 'Declassified Historical Event')
    .replace(/^(documented archival anomaly|declassified dossier|archival anomaly|case file|investigation file)[\s\:\-]+/i, '')
    .split(/[:\-\—\(]/)[0]
    .trim();
}

/**
 * Builds tailored multi-platform syndication metadata for YouTube Shorts and TikTok,
 * maximizing algorithmic distribution beyond Meta.
 */
export async function buildSyndicationPackage(
  reelOrId: string | any
): Promise<SyndicationPackage> {
  let reel: any = null;
  if (typeof reelOrId === 'string') {
    reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelOrId);
  } else {
    reel = reelOrId;
  }

  if (!reel) {
    throw new Error(`Reel not found for syndication: ${reelOrId}`);
  }

  const persona = getActivePersona();
  const branding = persona.brand || 'The Untold Archive';
  const subject = cleanTitle(reel.title);

  // Parse scenes
  let scenes: any[] = [];
  if (Array.isArray(reel.scenes) && reel.scenes.length > 0) {
    scenes = reel.scenes;
  } else if (reel.scenes_json) {
    try {
      const parsed = typeof reel.scenes_json === 'string' ? JSON.parse(reel.scenes_json) : reel.scenes_json;
      if (Array.isArray(parsed)) scenes = parsed;
    } catch {}
  }

  // Parse existing hashtags
  let baseHashtags: string[] = [];
  if (reel.hashtags_json) {
    try {
      const parsed = typeof reel.hashtags_json === 'string' ? JSON.parse(reel.hashtags_json) : reel.hashtags_json;
      if (Array.isArray(parsed)) baseHashtags = parsed;
    } catch {}
  }

  // 1. YouTube Shorts Metadata
  // YouTube title limit is 100 characters
  const suffix = ' #Shorts #Documentary';
  const availTitleLen = 100 - suffix.length;
  let ytTitle = `${subject}: The Declassified Secret`;
  if (ytTitle.length > availTitleLen) {
    ytTitle = ytTitle.slice(0, availTitleLen).trim();
  }
  ytTitle = `${ytTitle}${suffix}`;

  // Build YouTube description with chapter timestamps
  let currentSec = 0;
  const chapterLines = scenes.map((s, idx) => {
    const mins = Math.floor(currentSec / 60);
    const secs = Math.floor(currentSec % 60);
    const timecode = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const label = s.chapterLabel || s.headline || `Part ${idx + 1}`;
    currentSec += Number(s.duration || s.durationSeconds || 7.0);
    return `${timecode} - ${label}`;
  });

  const rawCaption = String(reel.caption || '').split(/#\w+/)[0].trim();
  const discussionQuestion = 'What do you believe actually happened? Drop your theory in the comments below.';

  const ytDescription = [
    `${subject} // ${branding}`,
    '',
    rawCaption || `A deep dive into primary archival records and declassified documentation regarding ${subject}.`,
    '',
    'CHAPTERS:',
    chapterLines.join('\n') || '00:00 - Declassified Archival Record',
    '',
    `📌 Subscribe to ${branding} for daily declassified history dossiers and forensic investigations.`,
    '',
    '#Shorts #Documentary #History #UntoldArchive #Mystery #Declassified'
  ].join('\n');

  const ytTags = Array.from(new Set([
    'shorts', 'documentary', 'history', 'declassified', 'mystery', 'untold',
    'archival', 'true story', subject.toLowerCase(), ...baseHashtags.map(h => h.replace(/^#/, ''))
  ])).slice(0, 15);

  const youtubeShorts: YouTubeShortsMetadata = {
    title: ytTitle,
    description: ytDescription,
    tags: ytTags,
    categoryId: '27', // Education / History
    privacyStatus: 'public',
    madeForKids: false,
    pinnedCommentPrompt: `${discussionQuestion} 👇`
  };

  // 2. TikTok Metadata
  const ttTags = ['#historytok', '#documentary', '#mystery', '#untold', '#conspiracy', '#truestory'];
  const tiktokCaption = `${subject}: What official archives never revealed. ${ttTags.join(' ')}`.slice(0, 150);

  const tiktok: TikTokMetadata = {
    caption: tiktokCaption,
    soundRecommendation: 'Dark Cinematic Tension / Ambient Suspense',
    hashtags: ttTags,
    allowComments: true,
    allowDuet: true,
    allowStitch: true
  };

  // 3. Instagram Metadata
  const instagram: InstagramMetadata = {
    caption: String(reel.caption || `${subject} // ${branding}`),
    shareToFeed: true,
    coverUrl: reel.cover_url || undefined
  };

  const syndicationPackage: SyndicationPackage = {
    reelId: String(reel.id),
    generatedAt: new Date().toISOString(),
    youtubeShorts,
    tiktok,
    instagram
  };

  // Persist to database
  try {
    db.prepare('UPDATE reels SET syndication_json = ? WHERE id = ?')
      .run(JSON.stringify(syndicationPackage), String(reel.id));
  } catch (dbErr) {
    console.warn('[Syndication Engine] Notice updating syndication_json:', dbErr);
  }

  return syndicationPackage;
}
